// app/api/admin/events/[id]/attendees/[attendeeId]/route.ts — Eliminar asistente

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  try {
    const { id: eventId, attendeeId } = await params
    const supabaseAuth = await createServerSupabaseClient()
    const allowed = await verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
    if (!allowed) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // Verificar que el asistente pertenece a este evento
    const { data: attendee } = await supabase
      .from('attendees')
      .select('id')
      .eq('id', attendeeId)
      .eq('event_id', eventId)
      .single()

    if (!attendee) {
      return NextResponse.json({ error: 'Asistente no encontrado.' }, { status: 404 })
    }

    // Eliminar sesiones primero (FK constraint)
    await supabase
      .from('sessions')
      .delete()
      .eq('attendee_id', attendeeId)
      .eq('event_id', eventId)

    // Eliminar mensajes del chat de este asistente
    await supabase
      .from('messages')
      .delete()
      .eq('attendee_id', attendeeId)
      .eq('event_id', eventId)

    // Eliminar el asistente
    const { error } = await supabase
      .from('attendees')
      .delete()
      .eq('id', attendeeId)
      .eq('event_id', eventId)

    if (error) {
      console.error('Error al eliminar asistente:', error)
      return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en delete attendee:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
