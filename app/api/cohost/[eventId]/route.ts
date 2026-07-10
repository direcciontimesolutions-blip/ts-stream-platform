// app/api/cohost/[eventId]/route.ts — Co-host: métricas + estado del evento

import { NextRequest, NextResponse } from 'next/server'
import { verifyModeratorAccess } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

async function verifyCoHost(eventId: string) {
  const payload = await verifyModeratorAccess(eventId)
  if (!payload || payload.role !== 'co_host') return null
  return payload
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const payload = await verifyCoHost(eventId)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    const [eventRes, countRes, totalRes, activeRes] = await Promise.all([
      supabase.from('events').select('chat_enabled, status, title').eq('id', eventId).single(),
      supabase.from('sessions').select('id', { count: 'exact', head: true })
        .eq('event_id', eventId).is('logout_at', null).is('kicked_at', null).gte('last_ping_at', twoMinutesAgo),
      supabase.from('sessions').select('attendee_id', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase.from('sessions')
        .select('id, attendee_id, login_at, last_ping_at, attendees(full_name, username)')
        .eq('event_id', eventId).is('logout_at', null).is('kicked_at', null)
        .gte('last_ping_at', twoMinutesAgo).order('login_at', { ascending: false }),
    ])

    return NextResponse.json({
      chat_enabled: eventRes.data?.chat_enabled ?? false,
      status: eventRes.data?.status,
      title: eventRes.data?.title,
      connected_now: countRes.count ?? 0,
      total_joined: totalRes.count ?? 0,
      connected_attendees: (activeRes.data ?? []).map((row) => {
        const att = row.attendees as unknown as { full_name: string; username: string } | null
        return {
          sessionId: row.id,
          attendeeId: row.attendee_id,
          full_name: att?.full_name ?? 'Desconocido',
          username: att?.username ?? '',
          login_at: row.login_at,
          last_ping_at: row.last_ping_at,
        }
      }),
    })
  } catch (err) {
    console.error('Error GET cohost:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
