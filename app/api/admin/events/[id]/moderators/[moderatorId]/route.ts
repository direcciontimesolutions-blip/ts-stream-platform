// app/api/admin/events/[id]/moderators/[moderatorId]/route.ts — Revocar moderador

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; moderatorId: string }> }
) {
  try {
    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: eventId, moderatorId } = await params
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('event_moderators')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', moderatorId)
      .eq('event_id', eventId)

    if (error) {
      console.error('Error revocando moderador:', error)
      return NextResponse.json({ error: 'Error al revocar.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en DELETE moderator:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
