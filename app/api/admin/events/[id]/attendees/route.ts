// app/api/admin/events/[id]/attendees/route.ts — GET lista de asistentes

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()

    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('id, full_name, email, username, role, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Agregar estado de expulsión consultando sessions
    const { data: kickedSessions } = await supabase
      .from('sessions')
      .select('attendee_id')
      .eq('event_id', eventId)
      .not('kicked_at', 'is', null)

    const kickedSet = new Set((kickedSessions ?? []).map((s) => s.attendee_id))

    const result = (attendees ?? []).map((a) => ({
      ...a,
      is_kicked: kickedSet.has(a.id),
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('Error listando asistentes:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
