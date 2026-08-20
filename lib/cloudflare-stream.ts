// lib/cloudflare-stream.ts — Cliente de Cloudflare Stream (Tier 1)
//
// Requiere 4 variables de entorno que Claude no puede generar (dashboard de Cloudflare):
//   CLOUDFLARE_ACCOUNT_ID           — account ID de Cloudflare
//   CLOUDFLARE_STREAM_API_TOKEN     — API Token con scope Stream:Edit + Stream:Read
//   CLOUDFLARE_STREAM_CUSTOMER_CODE — subdominio de reproduccion (customer-XXXX.cloudflarestream.com)
//   CLOUDFLARE_STREAM_SIGNING_KEY_ID / CLOUDFLARE_STREAM_SIGNING_KEY_PEM
//     — par de firma creado una sola vez con POST /accounts/{account_id}/stream/keys
//       (requiere que CLOUDFLARE_STREAM_API_TOKEN ya exista) — ver scripts/create-stream-signing-key.ts
//
// Mientras esas variables no existan, las funciones fallan explicito (throw), nunca en silencio.

import { SignJWT, importPKCS8 } from 'jose'
import { createPrivateKey } from 'node:crypto'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la variable de entorno ${name} (Cloudflare Stream no esta configurado todavia).`)
  return v
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

function accountId() {
  return requireEnv('CLOUDFLARE_ACCOUNT_ID')
}

function apiToken() {
  return requireEnv('CLOUDFLARE_STREAM_API_TOKEN')
}

async function cfFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${CF_API_BASE}/accounts/${accountId()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!res.ok || json.success === false) {
    const msg = json?.errors?.[0]?.message ?? `Cloudflare Stream API error (HTTP ${res.status})`
    throw new Error(msg)
  }
  return json
}

// ─── Upload directo (admin sube el video desde el navegador) ───────────────
// Flujo: 1) el server pide una URL de subida de un solo uso, 2) el navegador
// del admin hace PUT del archivo directo a esa URL (nunca pasa por Vercel),
// 3) el uid devuelto aqui es el que se guarda en events.cloudflare_stream_id.
export async function createDirectUploadUrl(opts?: {
  maxDurationSeconds?: number
  requireSignedUrls?: boolean
}): Promise<{ uploadURL: string; uid: string }> {
  const json = await cfFetch('/stream/direct_upload', {
    method: 'POST',
    body: JSON.stringify({
      maxDurationSeconds: opts?.maxDurationSeconds ?? 3 * 60 * 60, // 3h tope, eventos largos
      requireSignedURLs: opts?.requireSignedUrls ?? true,
    }),
  })
  return { uploadURL: json.result.uploadURL, uid: json.result.uid }
}

export interface StreamVideoStatus {
  uid: string
  readyToStream: boolean
  state: 'pendingupload' | 'downloading' | 'queued' | 'inprogress' | 'ready' | 'error'
  errorReasonText?: string
  durationSeconds?: number
}

// Chequeo manual de estado — sin webhook todavia (ver rediseno-web-global-estado.md,
// el manejo de webhooks de Cloudflare queda pendiente de validar contra la API real).
export async function getVideoStatus(videoId: string): Promise<StreamVideoStatus> {
  const json = await cfFetch(`/stream/${videoId}`)
  const r = json.result
  return {
    uid: r.uid,
    readyToStream: !!r.readyToStream,
    state: r.status?.state ?? 'queued',
    errorReasonText: r.status?.errorReasonText,
    durationSeconds: r.duration,
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  await cfFetch(`/stream/${videoId}`, { method: 'DELETE' })
}

// El endpoint /stream/keys de Cloudflare devuelve "pem" ya codificado en
// base64 (no es texto PEM literal, a pesar del nombre del campo) — se
// confirmo decodificando el valor real guardado. Soporta tambien el caso de
// que alguien pegue el PEM literal con "\n" escapados a mano, por si acaso.
//
// Ademas, la llave que entrega Cloudflare viene en formato PKCS#1
// ("-----BEGIN RSA PRIVATE KEY-----"), pero jose.importPKCS8 solo acepta
// PKCS#8 ("-----BEGIN PRIVATE KEY-----") — confirmado con el error real
// "must be PKCS#8 formatted string" al probar con la llave sin convertir.
// Se reempaqueta con el modulo crypto de Node (createPrivateKey acepta
// PKCS#1, export({type:'pkcs8'}) lo saca en el formato que jose necesita).
function normalizePem(raw: string): string {
  const literal = raw.includes('-----BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf-8')
  if (literal.includes('BEGIN PRIVATE KEY')) return literal // ya es PKCS#8

  const keyObject = createPrivateKey({ key: literal, format: 'pem' })
  return keyObject.export({ type: 'pkcs8', format: 'pem' }) as string
}

// ─── Signed URL de reproduccion (por asistente, expira) ─────────────────────
// Firma local con jose (RS256) — no llama a la API de Cloudflare en cada
// reproduccion, usa el par de llaves creado una sola vez de antemano.
export async function generateSignedPlaybackToken(
  videoId: string,
  expiresInSeconds = 60 * 60 * 6 // 6h — cubre eventos largos sin regenerar
): Promise<string> {
  const keyId = requireEnv('CLOUDFLARE_STREAM_SIGNING_KEY_ID')
  const pem = normalizePem(requireEnv('CLOUDFLARE_STREAM_SIGNING_KEY_PEM'))

  const privateKey = await importPKCS8(pem, 'RS256')
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds

  return new SignJWT({ kid: keyId })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setSubject(videoId)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey)
}

export function customerCode(): string {
  return requireEnv('CLOUDFLARE_STREAM_CUSTOMER_CODE')
}

// Iframe listo para <iframe src=... /> — mismo patron que el embed de YouTube/Teams
export async function getSignedIframeUrl(videoId: string): Promise<string> {
  const token = await generateSignedPlaybackToken(videoId)
  return `https://customer-${customerCode()}.cloudflarestream.com/${token}/iframe`
}

// ─── Live Input (vMix produce en vivo → RTMPS → Cloudflare) ─────────────────
// Crea el destino RTMPS que se configura en vMix como salida (Settings →
// Outputs → Stream → RTMP). El "uid" devuelto se usa exactamente igual que
// el uid de un video VOD para reproduccion (mismo iframe firmado,
// getSignedIframeUrl funciona sin cambios para un uid de live input).
export interface LiveInputResult {
  uid: string
  rtmpsUrl: string
  rtmpsStreamKey: string
}

export async function createLiveInput(opts?: { name?: string }): Promise<LiveInputResult> {
  const json = await cfFetch('/stream/live_inputs', {
    method: 'POST',
    body: JSON.stringify({
      meta: opts?.name ? { name: opts.name } : undefined,
      // requireSignedURLs aqui protege TANTO la vista en vivo como el VOD
      // grabado automaticamente — sin esto, cualquiera con el uid podria ver
      // la transmision sin pasar por el login de la plataforma.
      recording: { mode: 'automatic', requireSignedURLs: true },
    }),
  })
  const r = json.result
  return {
    uid: r.uid,
    rtmpsUrl: r.rtmps.url,
    rtmpsStreamKey: r.rtmps.streamKey,
  }
}

export interface LiveInputStatus {
  uid: string
  status: 'connected' | 'disconnected' | string
}

// Chequeo de si vMix esta conectado y transmitiendo de verdad ahora mismo.
export async function getLiveInputStatus(liveInputUid: string): Promise<LiveInputStatus> {
  const json = await cfFetch(`/stream/live_inputs/${liveInputUid}`)
  const r = json.result
  return {
    uid: r.uid,
    status: r.status?.current?.state ?? 'disconnected',
  }
}

export async function deleteLiveInput(liveInputUid: string): Promise<void> {
  await cfFetch(`/stream/live_inputs/${liveInputUid}`, { method: 'DELETE' })
}
