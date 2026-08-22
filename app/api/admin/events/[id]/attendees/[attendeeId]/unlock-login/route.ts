// app/api/admin/events/[id]/attendees/[attendeeId]/unlock-login/route.ts
//
// Desbloqueo manual del rate limit de login (ver supabase/migrations/020_login_rate_limit.sql).
// Red de seguridad para 2 casos: (1) un asistente real se equivoco de contraseña 5 veces
// solo, (2) atacante y victima comparten IP del venue (el candado compuesto evento+usuario+ip
// no separa eso del todo). Borra el candado en TODAS las IPs de ese usuario en este evento —
// el admin no necesita saber cual IP quedo bloqueada.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attendeeId: string }> }
) {
  try {
    const { id: eventId, attendeeId } = await params
    const supabaseAuth = await createServerSupabaseClient()
    const allowed = await verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
    if (!allowed) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    const { data: attendee, error: attendeeError } = await supabase
      .from('attendees')
      .select('username')
      .eq('id', attendeeId)
      .eq('event_id', eventId)
      .single()

    if (attendeeError || !attendee) {
      return NextResponse.json({ error: 'Asistente no encontrado.' }, { status: 404 })
    }

    const { error } = await supabase.rpc('admin_unlock_login', {
      p_event_id: eventId,
      p_username: attendee.username,
    })

    if (error) {
      console.error('Error al desbloquear login:', error)
      return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error en unlock-login:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
