// app/api/moderator/[eventId]/chat/route.ts — Moderador/co-host envía mensaje al chat

import { NextRequest, NextResponse } from 'next/server'
import { verifyModeratorAccess } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const payload = await verifyModeratorAccess(eventId)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const body = await req.json() as { content?: string }
    const content = body.content?.trim()
    if (!content || content.length === 0 || content.length > 500) {
      return NextResponse.json({ error: 'Mensaje inválido.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const emailName = payload.email.split('@')[0]
    const roleLabel = payload.role === 'co_host' ? 'Co-anfitrión' : 'Moderador'
    const moderatorName = `${roleLabel} · ${emailName}`

    const { error } = await supabase
      .from('messages')
      .insert({ event_id: eventId, attendee_id: null, content, moderator_name: moderatorName })

    if (error) {
      console.error('Error enviando mensaje moderador:', error)
      return NextResponse.json({ error: 'Error al enviar.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en moderator chat POST:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
