// app/api/admin/events/[id]/attendees/[attendeeId]/kick/route.ts — Expulsar asistente

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  try {
    const { id: eventId, attendeeId } = await params
    const supabaseAuth = await createServerSupabaseClient()
    const allowed = await verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
    if (!allowed) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // Marcar kicked_at en la sesion activa del asistente
    const { data, error } = await supabase
      .from('sessions')
      .update({ kicked_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('attendee_id', attendeeId)
      .is('logout_at', null)
      .is('kicked_at', null)
      .select('id')

    if (error) {
      console.error('Error al kickear asistente:', error)
      return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'El asistente no tiene una sesion activa.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, kicked_sessions: data.length })
  } catch (err) {
    console.error('Error en kick:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
