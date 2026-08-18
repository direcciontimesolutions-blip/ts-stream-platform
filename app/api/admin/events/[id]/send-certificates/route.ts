// app/api/admin/events/[id]/send-certificates/route.ts — Genera y envia certificados de
// asistencia personalizados a los asistentes elegibles de un evento.
//
// A diferencia de emergency-broadcast/route.ts (headless, disparado por una rutina externa
// con clave estatica), este es una ACCION MANUAL que Julian dispara desde el panel admin
// despues del evento — protegido con la misma sesion de admin que el resto del panel
// (createServerSupabaseClient().auth.getUser()), nunca con clave en query string.
//
// Criterio de elegibilidad confirmado por el cliente (SCP Antioquia, Primer Simposio en
// Pediatria, 18 ago 2026): minimo 30 minutos de tiempo conectado real. Reusa exactamente
// la misma agregacion que el CSV de metricas (lib/attendee-metrics.ts) para que ambos
// numeros nunca se desincronicen.
//
// El fondo del certificado (imagen PROVISIONAL, ver public/certificates/placeholder-fondo.png)
// se trae UNA sola vez por request via fetch al propio origin (mismo patron que cualquier
// asset estatico de /public en Vercel) y se reusa para las N generaciones de PDF de este
// lote — no se relee del disco por cada asistente.
//
// Idempotencia: NO hay deduplicacion de envios (mismo criterio documentado en
// emergency-broadcast/route.ts). Si se llama dos veces, hoy se reenvia a todos los
// elegibles de nuevo. Para este caso de uso (accion manual puntual post-evento, un
// disparo por evento) esta bien asi. Si se necesita a futuro evitar reenvios accidentales,
// agregar una columna "certificate_sent_at" en `attendees` y saltar a quien ya la tenga,
// en vez de reenviar siempre.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAttendeeMetrics, formatDuration, CERTIFICATE_ELIGIBILITY_SECONDS } from '@/lib/attendee-metrics'
import { renderCertificatePdf } from '@/lib/certificate-pdf'
import { sendEmail } from '@/lib/email'

function formatEventDateCO(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
}

// GET — solo cuenta cuantos asistentes son elegibles hoy, sin enviar nada. Lo usa el
// panel admin para el mensaje de confirmacion antes de disparar el envio real (POST).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const rows = await getAttendeeMetrics(eventId)
    const eligibles = rows.filter((r) => r.totalSeconds >= CERTIFICATE_ELIGIBILITY_SECONDS)
    const sinCorreo = eligibles.filter((r) => !r.email?.trim()).length

    return NextResponse.json({
      total_asistentes: rows.length,
      elegibles: eligibles.length,
      elegibles_sin_correo: sinCorreo,
      umbral_minutos: CERTIFICATE_ELIGIBILITY_SECONDS / 60,
    })
  } catch (err) {
    console.error('Error contando elegibles de certificados:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — genera y envia el certificado PDF a cada asistente elegible.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('title, slug, start_at')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const rows = await getAttendeeMetrics(eventId)
    const eligibles = rows.filter((r) => r.totalSeconds >= CERTIFICATE_ELIGIBILITY_SECONDS)

    if (eligibles.length === 0) {
      return NextResponse.json({
        ok: true,
        evento: event.title,
        elegibles: 0,
        enviados: 0,
        fallidos: 0,
        detalle_fallos: [],
      })
    }

    // Fondo del certificado (PROVISIONAL) — una sola descarga para todo el lote.
    const bgUrl = new URL('/certificates/placeholder-fondo.png', req.nextUrl.origin).toString()
    const bgRes = await fetch(bgUrl)
    if (!bgRes.ok) {
      return NextResponse.json(
        { error: 'No se pudo cargar la plantilla de fondo del certificado.' },
        { status: 500 }
      )
    }
    const backgroundSrc = Buffer.from(await bgRes.arrayBuffer())

    const eventDateLabel = formatEventDateCO(event.start_at)

    let sent = 0
    const failures: { email: string | null; nombre: string; error: string }[] = []

    for (const attendee of eligibles) {
      const email = attendee.email?.trim()
      if (!email) {
        failures.push({ email: null, nombre: attendee.full_name, error: 'Sin correo registrado.' })
        continue
      }

      try {
        const pdfBuffer = await renderCertificatePdf(
          {
            full_name: attendee.full_name,
            document_id: attendee.document_id ?? '',
            event_title: event.title,
            event_date_label: eventDateLabel,
            connected_time_label: formatDuration(attendee.totalSeconds),
          },
          backgroundSrc
        )

        const subject = `Certificado de asistencia — ${event.title}`
        const body = `Estimado(a) ${attendee.full_name},

Gracias por tu participación en ${event.title}, organizado por la Sociedad Colombiana de Pediatría — Regional Antioquia y transmitido a través de la plataforma digital de Time Solutions.

Adjunto encontrarás tu certificado de asistencia en formato PDF, generado con base en tu tiempo de conexión verificado durante el evento.

Ha sido un gusto contar con tu participación. Esperamos verte en próximos encuentros académicos.

Saludos cordiales,
Equipo Time Solutions — Soporte técnico del evento`

        await sendEmail({
          to: email,
          subject,
          text: body,
          attachments: [
            {
              filename: `certificado-asistencia-${(attendee.full_name || 'asistente').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
        })
        sent += 1
      } catch (err) {
        failures.push({
          email,
          nombre: attendee.full_name,
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      evento: event.title,
      elegibles: eligibles.length,
      enviados: sent,
      fallidos: failures.length,
      detalle_fallos: failures,
    })
  } catch (err) {
    console.error('Error enviando certificados:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
