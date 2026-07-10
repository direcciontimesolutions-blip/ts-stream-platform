// app/api/admin/events/[id]/chat/route.ts — Admin: ver todos los mensajes + toggle chat

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

// GET — todos los mensajes del evento (incluye borrados para moderacion)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const supabase = await createServerSupabaseClient()
    const allowed = await verifyAdminOrModerator(eventId, () => supabase.auth.getUser())
    if (!allowed) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase2 = createServiceRoleClient()

    const { data: messages } = await supabase2
      .from('messages')
      .select('id, content, created_at, deleted_at, attendee_id, moderator_name, attendees(full_name, username)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(200)

    const formatted = (messages ?? []).map((m) => {
      const att = m.attendees as unknown as { full_name: string; username: string } | null
      const isMod = !m.attendee_id
      return {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        deleted_at: m.deleted_at,
        attendee_name: isMod ? ((m.moderator_name as string) ?? 'Moderador') : (att?.full_name ?? 'Usuario'),
        attendee_username: isMod ? '' : (att?.username ?? ''),
        is_moderator: isMod,
      }
    })

    return NextResponse.json(formatted)
  } catch (err) {
    console.error('Error GET admin chat:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// DELETE — limpiar todos los mensajes del chat (borrado lógico)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAdmin = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAdmin.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .is('deleted_at', null)

    if (error) return NextResponse.json({ error: 'Error al limpiar.' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE chat:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// PATCH — toggle chat_enabled (solo admin)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAdmin = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAdmin.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: eventId } = await params
    const body = await req.json() as { chat_enabled?: boolean }

    if (typeof body.chat_enabled !== 'boolean') {
      return NextResponse.json({ error: 'chat_enabled debe ser boolean.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('events')
      .update({ chat_enabled: body.chat_enabled })
      .eq('id', eventId)
      .select('id, chat_enabled')
      .single()

    if (error) return NextResponse.json({ error: 'Error al actualizar.' }, { status: 500 })

    return NextResponse.json(data)
  } catch (err) {
    console.error('Error PATCH chat toggle:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
