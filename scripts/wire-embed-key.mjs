// scripts/wire-embed-key.mjs
//
// Toma CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID/PEM de .env.secrets.txt (ya
// creadas por create-embed-signing-key.mjs) y las propaga a:
//   1) .env.local (para dev local)
//   2) Vercel produccion (via `vercel env add`, valor por stdin — nunca
//      como argumento de linea de comando, para que no quede en ningun
//      historial de shell ni se imprima en la salida de esta corrida)
//
// Nunca imprime el valor del PEM ni del key id completo en consola.
//
// Uso: node scripts/wire-embed-key.mjs

import { readFileSync, appendFileSync, readFileSync as rf } from 'node:fs'
import { spawnSync } from 'node:child_process'

const secretsPath = new URL('../.env.secrets.txt', import.meta.url)
const localPath = new URL('../.env.local', import.meta.url)

const secretsText = readFileSync(secretsPath, 'utf-8')
const env = Object.fromEntries(
  secretsText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx), l.slice(idx + 1)]
    })
)

const keyId = env.CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID
const pem = env.CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_PEM

if (!keyId || !pem) {
  console.error('Faltan CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID/PEM en .env.secrets.txt — correr primero create-embed-signing-key.mjs')
  process.exit(1)
}

// 1) .env.local
const localText = rf(localPath, 'utf-8')
if (localText.includes('CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID')) {
  console.log('.env.local ya tiene las variables de embed — no se duplican.')
} else {
  appendFileSync(
    localPath,
    `\n# Llave de firma dedicada al embed de proveedores externos (separada de la de asistentes)\nCLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID=${keyId}\nCLOUDFLARE_STREAM_EMBED_SIGNING_KEY_PEM=${pem}\n`
  )
  console.log('.env.local actualizado.')
}

// 2) Vercel produccion
function vercelEnvAdd(name, value) {
  const res = spawnSync('npx', ['vercel', 'env', 'add', name, 'production'], {
    input: value,
    encoding: 'utf-8',
    shell: true,
  })
  const out = (res.stdout ?? '') + (res.stderr ?? '')
  const alreadyExists = /already exists|ya existe/i.test(out)
  if (res.status !== 0 && !alreadyExists) {
    console.error(`Error subiendo ${name} a Vercel:`, out.slice(0, 300))
    return false
  }
  console.log(alreadyExists ? `${name}: ya existia en Vercel produccion.` : `${name}: agregada a Vercel produccion.`)
  return true
}

const ok1 = vercelEnvAdd('CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID', keyId)
const ok2 = vercelEnvAdd('CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_PEM', pem)

if (!ok1 || !ok2) process.exit(1)
console.log('Listo. Falta un nuevo deploy para que Vercel produccion recoja las variables nuevas.')
