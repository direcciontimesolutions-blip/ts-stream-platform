// app/api/events/[eventId]/chat/route.ts — Chat del evento (asistentes)

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAttendeeToken } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAttendee(eventId: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get('ts_stream_token')?.value
  if (!token) return null
  const payload = await verifyAttendeeToken(token)
  if (!payload || payload.eventId !== eventId) return null
  return payload
}

// GET — ultimos 50 mensajes del evento
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const payload = await verifyAttendee(eventId)
    if (!payload) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    // Verificar que el chat esta habilitado
    const { data: event } = await supabase
      .from('events')
      .select('chat_enabled')
      .eq('id', eventId)
      .single()

    if (!event?.chat_enabled) {
      return NextResponse.json({ messages: [], chat_enabled: false })
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, created_at, attendee_id, moderator_name, attendees(full_name, username)')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(100)

    const formatted = (messages ?? []).map((m) => {
      const att = m.attendees as unknown as { full_name: string; username: string } | null
      const isMod = !m.attendee_id
      return {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        attendee_id: m.attendee_id,
        attendee_name: isMod ? ((m.moderator_name as string) ?? 'Moderador') : (att?.full_name ?? 'Usuario'),
        attendee_username: isMod ? '' : (att?.username ?? ''),
        is_own: m.attendee_id === payload.attendeeId,
        is_moderator: isMod,
      }
    })

    return NextResponse.json({ messages: formatted, chat_enabled: true })
  } catch (err) {
    console.error('Error GET chat:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — enviar mensaje
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const payload = await verifyAttendee(eventId)
    if (!payload) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const body = await req.json() as { content?: string }
    const content = body.content?.trim()

    if (!content || content.length === 0 || content.length > 500) {
      return NextResponse.json(
        { error: 'Mensaje invalido. Maximo 500 caracteres.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // Verificar que el chat esta habilitado
    const { data: event } = await supabase
      .from('events')
      .select('chat_enabled')
      .eq('id', eventId)
      .single()

    if (!event?.chat_enabled) {
      return NextResponse.json({ error: 'El chat no esta habilitado.' }, { status: 403 })
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        event_id: eventId,
        attendee_id: payload.attendeeId,
        content,
      })
      .select('id, content, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Error al enviar mensaje.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message })
  } catch (err) {
    console.error('Error POST chat:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
