// scripts/certificates/export-eligibles.ts — Paso 1 del pipeline LOCAL de certificados.
//
// Lee los asistentes elegibles de un evento (misma agregacion que el CSV de metricas,
// lib/attendee-metrics.ts, para que este numero nunca se desincronice del resto de la
// plataforma) y escribe un JSON plano que el paso 2 (generate-certificates.ps1, COM de
// PowerPoint) puede leer sin tocar Supabase ni TypeScript.
//
// Uso:
//   npx tsx scripts/certificates/export-eligibles.ts <eventId> <outputJsonPath>
//
// Requiere .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) en la raiz
// del proyecto — igual que cualquier otro script de scripts/*.

import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile(join(ROOT, '.env.local'))
loadEnvFile(join(ROOT, '.env.secrets.txt'))

async function main() {
  const [eventId, outPath] = process.argv.slice(2)
  if (!eventId || !outPath) {
    console.error('Uso: npx tsx scripts/certificates/export-eligibles.ts <eventId> <outputJsonPath>')
    process.exit(1)
  }

  // Import dinamico DESPUES de cargar .env.local — lib/supabase/server.ts lee
  // process.env al momento de llamar createServiceRoleClient(), no al importar el modulo,
  // pero igual es mas claro cargar el entorno primero.
  const { getAttendeeMetrics, CERTIFICATE_ELIGIBILITY_SECONDS, formatDuration } = await import('../../lib/attendee-metrics')
  const { createServiceRoleClient } = await import('../../lib/supabase/server')

  const supabase = createServiceRoleClient()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('title, start_at')
    .eq('id', eventId)
    .single()

  if (eventError || !event) {
    console.error('Evento no encontrado:', eventError?.message ?? eventId)
    process.exit(1)
  }

  const rows = await getAttendeeMetrics(eventId)
  const eligibles = rows.filter((r) => r.totalSeconds >= CERTIFICATE_ELIGIBILITY_SECONDS)

  const eventDateLabel = event.start_at
    ? new Date(event.start_at).toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota',
      })
    : ''

  const slugify = (s: string) => (s || 'asistente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const seenSlugs = new Map<string, number>()
  const attendeesOut = eligibles.map((a) => {
    let slug = slugify(a.full_name)
    const count = seenSlugs.get(slug) ?? 0
    seenSlugs.set(slug, count + 1)
    if (count > 0) slug = `${slug}-${count + 1}`  // desambiguar nombres repetidos
    return {
      full_name: a.full_name,
      email: a.email,
      document_id: a.document_id,
      slug,
      connected_time_label: formatDuration(a.totalSeconds),
    }
  })

  const out = {
    event_id: eventId,
    event_title: event.title,
    event_date_label: eventDateLabel,
    total_asistentes: rows.length,
    elegibles: attendeesOut.length,
    attendees: attendeesOut,
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')
  console.log(`OK: ${attendeesOut.length} elegible(s) de ${rows.length} asistente(s) -> ${outPath}`)
  const sinCorreo = attendeesOut.filter((a) => !a.email?.trim()).length
  if (sinCorreo > 0) {
    console.warn(`Aviso: ${sinCorreo} elegible(s) sin correo registrado, no recibiran nada en el paso de envio.`)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
