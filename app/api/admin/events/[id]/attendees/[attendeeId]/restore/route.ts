// app/api/admin/events/[id]/attendees/[attendeeId]/restore/route.ts — Restaurar acceso de asistente expulsado

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: eventId, attendeeId } = await params
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('sessions')
      .update({ kicked_at: null })
      .eq('event_id', eventId)
      .eq('attendee_id', attendeeId)
      .not('kicked_at', 'is', null)

    if (error) return NextResponse.json({ error: 'Error al restaurar acceso.' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error restaurando acceso:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
