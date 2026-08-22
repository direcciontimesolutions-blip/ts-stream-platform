// scripts/create-embed-signing-key.mjs
//
// Crea una SEGUNDA llave de firma de Cloudflare Stream, dedicada al embed
// que se le entrega a un proveedor externo (separada de
// CLOUDFLARE_STREAM_SIGNING_KEY_ID/PEM, que sigue siendo la de asistentes).
// Asi, si el link del proveedor se filtra o hay que revocarlo a mitad de
// evento, se rota solo esta llave sin invalidar las sesiones reales.
//
// Lee CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_STREAM_API_TOKEN de .env.secrets.txt,
// y APPEND directo a ese mismo archivo las 2 variables nuevas — nunca
// imprime el PEM en la consola (solo confirma el key id parcial).
//
// Uso: node scripts/create-embed-signing-key.mjs

import { readFileSync, appendFileSync } from 'node:fs'

const envPath = new URL('../.env.secrets.txt', import.meta.url)
const envText = readFileSync(envPath, 'utf-8')
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx), l.slice(idx + 1)]
    })
)

const accountId = env.CLOUDFLARE_ACCOUNT_ID
const token = env.CLOUDFLARE_STREAM_API_TOKEN

if (!accountId || !token) {
  console.error('Falta CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_STREAM_API_TOKEN en .env.secrets.txt')
  process.exit(1)
}

if (env.CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID) {
  console.error('Ya existe CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID en .env.secrets.txt — no se crea otra (evita acumular llaves huerfanas). Borrala primero si de verdad quieres regenerar.')
  process.exit(1)
}

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/keys`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
})
const json = await res.json()

if (!res.ok || !json.success) {
  console.error('Error creando la llave de firma:', JSON.stringify(json.errors ?? json, null, 2))
  process.exit(1)
}

const keyId = json.result.id
const pem = json.result.pem // ya en base64, normalizePem() lo maneja igual que la llave de asistentes

appendFileSync(
  envPath,
  `\nCLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID=${keyId}\nCLOUDFLARE_STREAM_EMBED_SIGNING_KEY_PEM=${pem}\n`
)

console.log(`Llave de embed creada y guardada en .env.secrets.txt (key id: ${keyId.slice(0, 8)}...).`)
console.log('Pendiente: copiar estas 2 variables tambien a .env.local y a Vercel produccion (mismo patron que las de asistentes).')
