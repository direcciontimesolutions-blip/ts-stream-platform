// app/api/assembly/[org]/[assembly]/logout/route.ts — Cerrar sesión de asistente

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAssemblyTokenFromRequest } from '@/lib/assembly-auth'

export async function POST(req: NextRequest) {
  try {
    const payload = await getAssemblyTokenFromRequest(req)
    if (payload) {
      const supabase = createServiceRoleClient()
      const logoutAt = new Date().toISOString()

      const { data: session } = await supabase
        .from('assembly_sessions')
        .select('login_at')
        .eq('id', payload.sessionId)
        .single()

      const durationSeconds = session?.login_at
        ? Math.round((Date.now() - new Date(session.login_at).getTime()) / 1000)
        : null

      await supabase
        .from('assembly_sessions')
        .update({ logout_at: logoutAt, duration_seconds: durationSeconds })
        .eq('id', payload.sessionId)
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.delete('ts_assembly_token')
    return res
  } catch (err) {
    console.error('Error POST assembly logout:', err)
    const res = NextResponse.json({ ok: true })
    res.cookies.delete('ts_assembly_token')
    return res
  }
}
