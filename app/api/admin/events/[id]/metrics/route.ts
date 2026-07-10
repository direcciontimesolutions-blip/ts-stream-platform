// app/api/admin/events/[id]/metrics/route.ts — GET metricas en tiempo real

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'
import type { EventMetrics, ConnectedAttendee } from '@/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabaseAuth = await createServerSupabaseClient()
    const allowed = await verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
    if (!allowed) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // Conectados ahora: sesiones sin logout, sin kick y con ping en los ultimos 2 minutos
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    const [countResult, totalResult, durationResult, activeResult] = await Promise.all([
      supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .is('logout_at', null)
        .is('kicked_at', null)
        .gte('last_ping_at', twoMinutesAgo),

      supabase
        .from('sessions')
        .select('attendee_id', { count: 'exact', head: true })
        .eq('event_id', eventId),

      supabase
        .from('sessions')
        .select('duration_seconds')
        .eq('event_id', eventId)
        .not('duration_seconds', 'is', null),

      // Lista de asistentes conectados ahora con su info
      supabase
        .from('sessions')
        .select('id, attendee_id, login_at, last_ping_at, attendees(full_name, username)')
        .eq('event_id', eventId)
        .is('logout_at', null)
        .is('kicked_at', null)
        .gte('last_ping_at', twoMinutesAgo)
        .order('login_at', { ascending: false }),
    ])

    let avg_duration_seconds: number | null = null
    const durationData = durationResult.data
    if (durationData && durationData.length > 0) {
      const total = durationData.reduce((sum, row) => sum + (row.duration_seconds ?? 0), 0)
      avg_duration_seconds = Math.round(total / durationData.length)
    }

    const connected_attendees: ConnectedAttendee[] = (activeResult.data ?? []).map((row) => {
      const att = row.attendees as unknown as { full_name: string; username: string } | null
      return {
        sessionId: row.id,
        attendeeId: row.attendee_id,
        full_name: att?.full_name ?? 'Desconocido',
        username: att?.username ?? '',
        login_at: row.login_at,
        last_ping_at: row.last_ping_at,
      }
    })

    const metrics: EventMetrics = {
      connected_now: countResult.count ?? 0,
      total_joined: totalResult.count ?? 0,
      avg_duration_seconds,
      connected_attendees,
    }

    return NextResponse.json(metrics)
  } catch (err) {
    console.error('Error obteniendo metricas:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
