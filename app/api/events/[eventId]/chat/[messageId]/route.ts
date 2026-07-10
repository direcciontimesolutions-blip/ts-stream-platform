// app/api/events/[eventId]/chat/[messageId]/route.ts — Borrar mensaje (admin o moderador)

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyModeratorToken } from '@/lib/auth'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; messageId: string }> }
) {
  try {
    const { eventId, messageId } = await params

    const cookieStore = await cookies()
    let authorized = false

    // Verificar si es admin (Supabase session)
    const adminSupabase = await createServerSupabaseClient()
    const { data: { user } } = await adminSupabase.auth.getUser()
    if (user) {
      authorized = true
    }

    // Si no es admin, verificar si es moderador del evento
    if (!authorized) {
      const modToken = cookieStore.get('ts_moderator_token')?.value
      if (modToken) {
        const modPayload = await verifyModeratorToken(modToken)
        if (modPayload && modPayload.eventId === eventId) {
          authorized = true
        }
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('event_id', eventId)
      .is('deleted_at', null)

    if (error) {
      return NextResponse.json({ error: 'Error al borrar mensaje.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE message:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
