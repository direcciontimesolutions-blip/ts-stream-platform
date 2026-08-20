// scripts/certificates/send-certificates.ts — Paso 3 (ultimo) del pipeline LOCAL de
// certificados. Lee el JSON de elegibles (paso 1, export-eligibles.ts) + los PDF ya
// generados por PowerPoint COM (paso 2, generate-certificates.ps1) y envia un correo real
// por asistente, con su PDF adjunto — mismo canal de correo (lib/email.ts, Resend con
// dominio propio verificado) que usa el resto de la plataforma, corriendo aqui en la
// maquina local en vez de en el servidor.
//
// Uso:
//   npx tsx scripts/certificates/send-certificates.ts <dataJsonPath> <pdfDir>
//
// Requiere RESEND_API_KEY en el entorno — se carga de ts-stream-platform/.env.secrets.txt
// si existe ahi (no esta en .env.local, ver ese archivo). Nunca imprime ese valor.
//
// Sin deduplicacion de envios (mismo criterio que el endpoint viejo documentaba): si se
// corre dos veces, se reenvia a todos los elegibles del JSON de nuevo. Es una accion
// manual puntual post-evento, un disparo por evento — correr con cuidado.

import { readFileSync, existsSync } from 'fs'
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

interface EligibleAttendee {
  full_name: string
  email: string | null
  document_id: string | null
  slug: string
  connected_time_label: string
}

interface EligiblesData {
  event_id: string
  event_title: string
  event_date_label: string
  attendees: EligibleAttendee[]
}

async function main() {
  const [dataJsonPath, pdfDir] = process.argv.slice(2)
  if (!dataJsonPath || !pdfDir) {
    console.error('Uso: npx tsx scripts/certificates/send-certificates.ts <dataJsonPath> <pdfDir>')
    process.exit(1)
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurada (revisar .env.secrets.txt).')
    process.exit(1)
  }

  const data: EligiblesData = JSON.parse(readFileSync(dataJsonPath, 'utf-8'))
  const { sendEmail } = await import('../../lib/email')

  let sent = 0
  const failures: { nombre: string; email: string | null; error: string }[] = []

  for (const attendee of data.attendees) {
    const email = attendee.email?.trim()
    if (!email) {
      failures.push({ nombre: attendee.full_name, email: null, error: 'Sin correo registrado.' })
      continue
    }

    const pdfPath = join(pdfDir, `certificado-${attendee.slug}.pdf`)
    if (!existsSync(pdfPath)) {
      failures.push({ nombre: attendee.full_name, email, error: `PDF no encontrado: ${pdfPath}` })
      continue
    }

    try {
      const subject = `Certificado de asistencia — ${data.event_title}`
      const body = `Estimado(a) ${attendee.full_name},

Gracias por tu participación en ${data.event_title}, organizado por la Sociedad Colombiana de Pediatría — Regional Antioquia y transmitido a través de la plataforma digital de Time Solutions.

Adjunto encontrarás tu certificado de asistencia en formato PDF, generado con base en tu tiempo de conexión verificado durante el evento (${attendee.connected_time_label}).

Ha sido un gusto contar con tu participación. Esperamos verte en próximos encuentros académicos.

Saludos cordiales,
Equipo Time Solutions — Soporte técnico del evento`

      await sendEmail({
        to: email,
        subject,
        text: body,
        attachments: [
          {
            filename: `certificado-asistencia-${attendee.slug}.pdf`,
            content: readFileSync(pdfPath),
            contentType: 'application/pdf',
          },
        ],
      })
      sent += 1
      console.log(`Enviado: ${attendee.full_name} <${email}>`)
    } catch (err) {
      failures.push({
        nombre: attendee.full_name,
        email,
        error: err instanceof Error ? err.message : 'Error desconocido',
      })
    }
  }

  console.log('-----')
  console.log(`Enviados: ${sent}/${data.attendees.length}. Fallidos: ${failures.length}`)
  if (failures.length > 0) {
    for (const f of failures) console.log(`  - ${f.nombre} (${f.email ?? 'sin correo'}): ${f.error}`)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
