// app/api/sessions/[id]/end/route.ts — Cierra sesion y calcula duracion

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAttendeeToken } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params

    // Verificar JWT (puede venir de cookie o ser beacon — intentar ambos)
    const cookieStore = await cookies()
    const token = cookieStore.get('ts_stream_token')?.value

    // Para navigator.sendBeacon, el JWT puede no estar disponible si la cookie ya fue limpiada.
    // En ese caso permitimos que la sesion se cierre de todos modos si el sessionId existe.
    if (token) {
      const payload = await verifyAttendeeToken(token)
      if (!payload || payload.sessionId !== sessionId) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
      }
    }

    const supabase = createServiceRoleClient()

    // Obtener la sesion para calcular duracion
    const { data: session } = await supabase
      .from('sessions')
      .select('login_at, last_ping_at, logout_at')
      .eq('id', sessionId)
      .single()

    if (!session || session.logout_at) {
      // Ya cerrada o no existe
      return NextResponse.json({ ok: true })
    }

    const now = new Date()
    const loginAt = new Date(session.login_at)

    // Usar last_ping_at si es mas reciente que login_at para duracion real
    const endReference =
      session.last_ping_at && new Date(session.last_ping_at) > loginAt
        ? new Date(session.last_ping_at)
        : now

    const durationSeconds = Math.floor(
      (endReference.getTime() - loginAt.getTime()) / 1000
    )

    await supabase
      .from('sessions')
      .update({
        logout_at: now.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error cerrando sesion:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
