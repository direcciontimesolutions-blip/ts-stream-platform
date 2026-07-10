// app/api/sessions/[id]/ping/route.ts — Heartbeat cada 30s

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAttendeeToken } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params

    const cookieStore = await cookies()
    const token = cookieStore.get('ts_stream_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const payload = await verifyAttendeeToken(token)
    if (!payload || payload.sessionId !== sessionId) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    // Verificar sesion y evento en una sola query con join
    const { data: session } = await supabase
      .from('sessions')
      .select('kicked_at, event_id, events(status)')
      .eq('id', sessionId)
      .single()

    if (session?.kicked_at) {
      return NextResponse.json({ error: 'Acceso revocado.' }, { status: 401 })
    }

    const eventStatus = (session?.events as { status?: string } | null)?.status
    if (eventStatus && eventStatus !== 'live') {
      return NextResponse.json({ ended: true }, { status: 410 })
    }

    await supabase
      .from('sessions')
      .update({ last_ping_at: new Date().toISOString() })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en ping:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
