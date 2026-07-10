// app/api/cohost/[eventId]/chat/route.ts — Co-host: toggle chat

import { NextRequest, NextResponse } from 'next/server'
import { verifyModeratorAccess } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

async function verifyCoHost(eventId: string) {
  const payload = await verifyModeratorAccess(eventId)
  if (!payload || payload.role !== 'co_host') return null
  return payload
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const payload = await verifyCoHost(eventId)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

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
    console.error('Error PATCH cohost chat:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
