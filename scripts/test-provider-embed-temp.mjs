// scripts/test-provider-embed-temp.mjs — prueba end-to-end del embed para
// proveedor externo (ver lib/provider-embed.ts, app/api/embed/[eventId]/stream-url,
// app/embed/[eventId]/page.tsx) ANTES de entregarle nada a nadie. Crea todo
// efimero, prueba, y borra sin dejar rastro.
//
// Uso:
//   node scripts/test-provider-embed-temp.mjs setup    -> crea org+evento+2 live inputs, imprime TOKEN local
//   node scripts/test-provider-embed-temp.mjs failover -> simula un failover (swap de uid activo)
//   node scripts/test-provider-embed-temp.mjs cleanup  -> borra todo (Cloudflare + Supabase + .env.local)

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'fs'

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
loadEnvFile('.env.secrets.txt')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN

const ORG_SLUG = 'embed-test-temp'
const EVENT_SLUG = 'embed-test-temp'
const TEST_TOKEN = 'test-provider-token-temp-9f3k2'
const STATE_FILE = '.embed-test-temp-state.json'

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.method === 'POST' ? 'return=representation' : 'return=minimal',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${opts.method || 'GET'} ${path} -> ${res.status}: ${await res.text()}`)
  const ct = res.headers.get('content-type') || ''
  return ct.includes('json') ? res.json() : null
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
  return json.result.uid
}

const cmd = process.argv[2]

if (cmd === 'setup') {
  console.log('Creando organizacion + evento de prueba...')
  const org = await sb('organizations', {
    method: 'POST',
    body: JSON.stringify({ slug: ORG_SLUG, name: 'Embed test temp' }),
  })
  const orgId = org[0].id

  console.log('Creando 2 Live Inputs en Cloudflare (primary + backup, simulando el failover)...')
  const uidPrimary = await createLiveInput('embed-test-temp-primary')
  const uidBackup = await createLiveInput('embed-test-temp-backup')

  const ev = await sb('events', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: orgId,
      slug: EVENT_SLUG,
      title: 'Embed test temp',
      status: 'live',
      start_at: new Date(Date.now() - 3600_000).toISOString(),
      end_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
      streaming_tier: 'cloudflare',
      cloudflare_stream_id: uidPrimary,
      cloudflare_stream_id_backup: uidBackup,
    }),
  })
  const eventId = ev[0].id

  writeFileSync(STATE_FILE, JSON.stringify({ orgId, eventId, uidPrimary, uidBackup }, null, 2))

  const envVarName = `PROVIDER_EMBED_TOKEN_${ORG_SLUG.toUpperCase().replace(/-/g, '_')}_${EVENT_SLUG.toUpperCase().replace(/-/g, '_')}`
  appendFileSync('.env.local', `\n# --- test temporal, borrar con: node scripts/test-provider-embed-temp.mjs cleanup ---\n${envVarName}=${TEST_TOKEN}\n`)

  console.log('\nListo. Datos para probar:')
  console.log(`  eventId:  ${eventId}`)
  console.log(`  token:    ${TEST_TOKEN}`)
  console.log(`  uid primary: ${uidPrimary}`)
  console.log(`  uid backup:  ${uidBackup}`)
  console.log(`\nCon el server local corriendo (npm run dev), probar:`)
  console.log(`  curl "http://localhost:3000/api/embed/${eventId}/stream-url?token=${TEST_TOKEN}"`)
} else if (cmd === 'failover') {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  console.log('Simulando failover: swap de cloudflare_stream_id <-> cloudflare_stream_id_backup...')
  await sb(`events?id=eq.${state.eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ cloudflare_stream_id: state.uidBackup, cloudflare_stream_id_backup: state.uidPrimary }),
  })
  console.log(`Ahora el uid activo deberia ser: ${state.uidBackup}`)
} else if (cmd === 'cleanup') {
  if (existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    console.log('Borrando Live Inputs de Cloudflare...')
    for (const uid of [state.uidPrimary, state.uidBackup]) {
      try { await cf(`/stream/live_inputs/${uid}`, { method: 'DELETE' }) } catch (e) { console.warn(`  (${uid}: ${e.message})`) }
    }
    console.log('Borrando organizacion (cascada)...')
    await sb(`organizations?id=eq.${state.orgId}`, { method: 'DELETE' })
  }
  // Limpiar .env.local
  if (existsSync('.env.local')) {
    const text = readFileSync('.env.local', 'utf-8')
    const cleaned = text.replace(/\n# --- test temporal, borrar con:.*?\n.*PROVIDER_EMBED_TOKEN_EMBED_TEST_TEMP.*\n/g, '\n')
    writeFileSync('.env.local', cleaned)
  }
  try { const { unlinkSync } = await import('fs'); unlinkSync(STATE_FILE) } catch {}
  console.log('Listo, sin rastro.')
} else {
  console.error('Uso: node scripts/test-provider-embed-temp.mjs [setup|failover|cleanup]')
  process.exit(1)
}
