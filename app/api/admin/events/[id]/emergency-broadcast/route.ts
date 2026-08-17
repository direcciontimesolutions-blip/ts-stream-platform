// app/api/admin/events/[id]/emergency-broadcast/route.ts — Plan B de emergencia
//
// Canal de correo de emergencia para un evento puntual: envia a cada asistente
// real un aviso con el link directo de respaldo (Teams) cuando la plataforma
// de transmision falla. Se disparo desde una rutina headless (curl / cron),
// por eso es GET protegido por clave estatica en query string en vez de un
// endpoint autenticado con sesion de admin — no hay navegador involucrado.
//
// Validado por el agente `validator`: WhatsApp automatico se descarto porque
// depende de aprobacion de plantilla de Meta que no llegaria a tiempo para
// este evento. Ver memoria del proyecto (simposio-pediatria-scp-estado) para
// el contexto completo.
//
// Reusa:
// - La agregacion por persona de export/route.ts: la tabla `attendees` ya
//   garantiza una fila = una persona real por evento (ver comentario en
//   app/api/auth/register/route.ts — mismo correo + mismo evento reusa el
//   mismo attendee_id), asi que no hace falta deduplicar por sesiones aqui.
// - lib/fallback-stream.ts para leer el link de Teams desde la MISMA
//   variable de entorno que ya usa la pantalla de respaldo cuando falla
//   Supabase (FALLBACK_STREAM_URL_<ORG>_<EVENTO>) — no se duplica el link.
//
// Idempotencia: NO hay deduplicacion de envios. Si se llama dos veces, hoy
// se reenvia a todos de nuevo. Para este caso de uso (evento unico, disparo
// manual/puntual de emergencia) esta bien asi. Si este endpoint se reusa
// para algo recurrente en el futuro, agregar una tabla/columna de
// "emergency_broadcast_sent_at" por evento (o por attendee) y saltar el
// reenvio si ya se disparo, en vez de reenviar siempre.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getFallbackStreamUrl } from '@/lib/fallback-stream'
import { sendEmail } from '@/lib/email'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const key = req.nextUrl.searchParams.get('key')
    if (!key || key !== process.env.EMERGENCY_BROADCAST_KEY) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('title, slug, organizations (slug)')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const org = event.organizations as unknown as { slug: string } | { slug: string }[] | null
    const orgSlug = Array.isArray(org) ? org[0]?.slug : org?.slug

    if (!orgSlug) {
      return NextResponse.json({ error: 'Evento sin organizacion asociada.' }, { status: 500 })
    }

    const fallbackUrl = getFallbackStreamUrl(orgSlug, event.slug)
    if (!fallbackUrl) {
      return NextResponse.json(
        { error: 'No hay link de respaldo configurado para este evento (variable de entorno faltante).' },
        { status: 500 }
      )
    }

    // Una fila = una persona real (ver comentario arriba).
    const { data: attendees, error: attendeesError } = await supabase
      .from('attendees')
      .select('full_name, email')
      .eq('event_id', eventId)

    if (attendeesError) {
      return NextResponse.json({ error: attendeesError.message }, { status: 500 })
    }

    // Deduplicacion defensiva por correo (insurance extra sobre la garantia
    // de app-level en register/route.ts, en caso de una carrera o import CSV
    // con filas repetidas).
    const seen = new Set<string>()
    const recipients = (attendees ?? []).filter((a) => {
      const email = a.email?.trim().toLowerCase()
      if (!email || seen.has(email)) return false
      seen.add(email)
      return true
    })

    let sent = 0
    const failures: { email: string; error: string }[] = []

    for (const recipient of recipients) {
      const nombre = recipient.full_name?.trim() || 'estimado(a) asistente'
      const subject = 'Aviso importante — Primer Simposio en Pediatría (acceso directo)'
      const body = `Estimado(a) ${nombre},

Detectamos un inconveniente técnico temporal con la plataforma de transmisión del Primer Simposio en Pediatría para Médicos Generales, organizado por la Sociedad Colombiana de Pediatría — Regional Antioquia.

Para que puedas seguir la transmisión sin contratiempos, puedes ingresar directamente a través de este enlace de Microsoft Teams:

${fallbackUrl}

Lamentamos cualquier inconveniente. Nuestro equipo está trabajando para resolver la situación.

Saludos cordiales,
Equipo Time Solutions — Soporte técnico del evento`

      try {
        await sendEmail({ to: recipient.email as string, subject, text: body })
        sent += 1
      } catch (err) {
        failures.push({
          email: recipient.email as string,
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      event: event.title,
      total_destinatarios: recipients.length,
      enviados: sent,
      fallidos: failures.length,
      // Se expone solo el correo + motivo de los fallos puntuales (necesario
      // para poder reintentar manualmente), nunca la lista completa de
      // destinatarios exitosos.
      detalle_fallos: failures,
    })
  } catch (err) {
    console.error('Error en emergency-broadcast:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
