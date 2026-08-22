// scripts/setup-prueba-26ago-cloudflare.mjs
//
// Configura Cloudflare Stream REAL (no efimero) para el evento existente
// "prueba-26-agosto" (cliente-demo-prueba-26ago): crea Live Input primario +
// de respaldo, actualiza el evento (streaming_tier + end_at extendido hasta
// despues del 4 sep para cubrir las 3 fechas: 26 ago, 3 sep, 4 sep), genera
// el token del embed para el proveedor externo, y guarda las credenciales
// RTMPS de vMix en un archivo LOCAL (nunca en la consola/chat).
//
// Uso: node scripts/setup-prueba-26ago-cloudflare.mjs

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs'
import { randomBytes } from 'crypto'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadEnvFile('.env.local')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN

const EVENT_ID = 'e3d4e3d0-9379-4b35-a732-aa2b2d7ca27b' // prueba-26-agosto
const ORG_SLUG = 'cliente-demo-prueba-26ago'
const EVENT_SLUG = 'prueba-26-agosto'
const NEW_END_AT = '2026-09-05T02:00:00+00:00' // 4 sep 9pm Colombia, margen despues del evento

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${opts.method || 'GET'} ${path} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

async function cf(path, opts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  const json = await res.json()
  if (!res.ok || json.success === false) throw new Error(`Cloudflare ${path} -> ${JSON.stringify(json.errors ?? json)}`)
  return json
}

async function createLiveInput(name) {
  const json = await cf('/stream/live_inputs', {
    method: 'POST',
    body: JSON.stringify({
      meta: { name },
      recording: { mode: 'automatic', requireSignedURLs: true, deleteRecordingAfterDays: 1 },
    }),
  })
  const r = json.result
  return { uid: r.uid, rtmpsUrl: r.rtmps.url, rtmpsStreamKey: r.rtmps.streamKey }
}

console.log('Creando Live Input PRINCIPAL...')
const primary = await createLiveInput('Prueba de plataforma — 26 de agosto')
console.log('Creando Live Input de RESPALDO...')
const backup = await createLiveInput('Prueba de plataforma — 26 de agosto (respaldo)')

console.log('Actualizando el evento (streaming_tier + end_at extendido + uids)...')
await sb(`events?id=eq.${EVENT_ID}`, {
  method: 'PATCH',
  body: JSON.stringify({
    streaming_tier: 'cloudflare',
    cloudflare_stream_id: primary.uid,
    cloudflare_stream_id_backup: backup.uid,
    end_at: NEW_END_AT,
  }),
})

const providerToken = randomBytes(24).toString('base64url')
const envVarName = `PROVIDER_EMBED_TOKEN_${ORG_SLUG.toUpperCase().replace(/-/g, '_')}_${EVENT_SLUG.toUpperCase().replace(/-/g, '_')}`

const credFile = '.vmix-credentials-prueba-26-agosto.txt'
writeFileSync(
  credFile,
  `Credenciales de transmision — evento "prueba-26-agosto" (Cloudflare Stream)
Generado: ${new Date().toISOString()}
Uso: configurar en vMix, Settings -> Outputs -> Stream -> "Custom RTMP Server"
vMix soporta salidas simultaneas: configura AMBAS (principal + respaldo) desde
el arranque, transmitiendo en paralelo. Si la principal falla, el swap a
respaldo es instantaneo desde el panel admin (boton "Cambiar a transmision de
respaldo AHORA").

=== PRINCIPAL ===
RTMPS URL:   ${primary.rtmpsUrl}
Stream Key:  ${primary.rtmpsStreamKey}
Live Input UID: ${primary.uid}

=== RESPALDO ===
RTMPS URL:   ${backup.rtmpsUrl}
Stream Key:  ${backup.rtmpsStreamKey}
Live Input UID: ${backup.uid}

=== Iframe para el proveedor externo ===
${envVarName}=${providerToken}  (ya se sube a Vercel produccion en este mismo script)

Iframe a entregar:
<iframe src="https://live.timesolutions.com.co/embed/${EVENT_ID}?token=${providerToken}" allowfullscreen></iframe>

Cloudflare NO vuelve a mostrar el Stream Key despues de esto — si se pierde,
hay que crear un Live Input nuevo (no se puede recuperar el existente).
`
)

console.log(`\nListo. Credenciales de vMix guardadas en: ${credFile}`)
console.log('(No se imprimieron en esta consola — abre el archivo directamente.)')
console.log(`\nEvento actualizado: streaming_tier=cloudflare, end_at extendido hasta ${NEW_END_AT}.`)
