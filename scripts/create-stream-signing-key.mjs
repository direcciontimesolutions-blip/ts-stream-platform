// scripts/create-stream-signing-key.mjs
//
// Correr UNA SOLA VEZ, despues de que CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_STREAM_API_TOKEN
// ya existan en .env.local. Crea el par de llaves de firma de Cloudflare Stream y
// muestra los 2 valores que faltan pegar en .env.local / Vercel:
//   CLOUDFLARE_STREAM_SIGNING_KEY_ID
//   CLOUDFLARE_STREAM_SIGNING_KEY_PEM
//
// Uso:  node scripts/create-stream-signing-key.mjs
// (lee las env vars del proceso — exportalas antes o usa `dotenv -e .env.local -- node ...`)

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_STREAM_API_TOKEN

if (!accountId || !token) {
  console.error('Falta CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_STREAM_API_TOKEN en el entorno.')
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

console.log('\nLlave de firma creada. Agregar a .env.local y a Vercel:\n')
console.log(`CLOUDFLARE_STREAM_SIGNING_KEY_ID=${json.result.id}`)
console.log(`CLOUDFLARE_STREAM_SIGNING_KEY_PEM="${json.result.pem.replace(/\n/g, '\\n')}"`)
console.log('\nGuardar el PEM en un lugar seguro — Cloudflare no lo vuelve a mostrar despues de esto.\n')
