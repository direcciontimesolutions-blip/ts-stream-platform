// app/api/cron/check-stream-health/route.ts — Vercel Cron, cada 1 minuto
//
// Cierra el hallazgo #2 de la auditoria de confiabilidad (21 ago 2026): el failover
// primary/backup de Cloudflare era 100% manual, sin ninguna alerta automatica. Revisa el
// Live Input principal + de respaldo de cada evento EN VIVO con Cloudflare Stream, y manda
// un correo a Julian solo cuando hay un CAMBIO real de estado (no en cada chequeo) —
// compara contra el ultimo estado conocido guardado en `events.cloudflare_last_status` /
// `cloudflare_backup_last_status` (ver 021_cloudflare_health_tracking.sql).
//
// Protegido con CRON_SECRET (header Authorization: Bearer <secret>) para que nadie mas
// pueda disparar esto — Vercel lo agrega solo cuando invoca el cron programado.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getLiveInputStatus } from '@/lib/cloudflare-stream'
import { getEventLiveState } from '@/lib/event-live-state'
import { sendEmail } from '@/lib/email'

const ALERT_EMAIL = 'sonidointro@gmail.com'

async function checkOne(
  eventTitle: string,
  eventId: string,
  role: 'principal' | 'respaldo',
  uid: string,
  lastStatus: string | null,
  onUpdate: (newStatus: string) => Promise<void>
) {
  const { status } = await getLiveInputStatus(uid)

  if (status !== lastStatus) {
    if (lastStatus === 'connected' && status !== 'connected') {
      await sendEmail({
        to: ALERT_EMAIL,
        subject: `🔴 Transmision ${role} CAIDA — ${eventTitle}`,
        text: `El Live Input ${role} del evento "${eventTitle}" se desconecto (estado: ${status}).\n\n` +
          (role === 'principal'
            ? 'Si esto no se recupera solo en unos segundos, considera activar el respaldo desde el panel admin.'
            : 'Este es el Live Input de RESPALDO — revisa si el principal sigue sano.') +
          `\n\nEvento ID: ${eventId}\nHora: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
      })
    } else if (lastStatus && lastStatus !== 'connected' && status === 'connected') {
      await sendEmail({
        to: ALERT_EMAIL,
        subject: `🟢 Transmision ${role} recuperada — ${eventTitle}`,
        text: `El Live Input ${role} del evento "${eventTitle}" volvio a conectar.\n\nHora: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
      })
    }
    await onUpdate(status)
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, status, start_at, end_at, streaming_tier, cloudflare_stream_id, cloudflare_stream_id_backup, cloudflare_last_status, cloudflare_backup_last_status')
    .eq('streaming_tier', 'cloudflare')
    .not('cloudflare_stream_id', 'is', null)

  if (error) {
    console.error('check-stream-health: error consultando eventos:', error)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }

  const liveEvents = (events ?? []).filter((e) =>
    getEventLiveState(e.status, e.start_at, e.end_at).isLive
  )

  let checked = 0
  for (const ev of liveEvents) {
    try {
      await checkOne(ev.title, ev.id, 'principal', ev.cloudflare_stream_id, ev.cloudflare_last_status, async (newStatus) => {
        await supabase.from('events').update({ cloudflare_last_status: newStatus }).eq('id', ev.id)
      })
      checked++

      if (ev.cloudflare_stream_id_backup) {
        await checkOne(ev.title, ev.id, 'respaldo', ev.cloudflare_stream_id_backup, ev.cloudflare_backup_last_status, async (newStatus) => {
          await supabase.from('events').update({ cloudflare_backup_last_status: newStatus }).eq('id', ev.id)
        })
        checked++
      }
    } catch (err) {
      console.error(`check-stream-health: error revisando evento ${ev.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, eventsLive: liveEvents.length, liveInputsChecked: checked })
}
