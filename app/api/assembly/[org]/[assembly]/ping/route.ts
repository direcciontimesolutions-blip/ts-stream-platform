// app/api/assembly/[org]/[assembly]/ping/route.ts — Heartbeat de sesión

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAssemblyTokenFromRequest } from '@/lib/assembly-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; assembly: string }> }
) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const payload = await getAssemblyTokenFromRequest(req)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    // Verificar que el token corresponde a la asamblea correcta
    if (payload.org !== orgSlug || payload.assembly !== assemblySlug)
      return NextResponse.json({ error: 'Token inválido para esta asamblea.' }, { status: 403 })

    const supabase = createServiceRoleClient()

    // Verificar si la asamblea terminó
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('status')
      .eq('id', payload.assemblyId)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })
    if (assembly.status === 'ended') return NextResponse.json({ ended: true }, { status: 410 })

    // Verificar que la sesión no fue revocada ni cerrada por otro login
    const { data: session } = await supabase
      .from('assembly_sessions')
      .select('kicked_at, logout_at')
      .eq('id', payload.sessionId)
      .single()

    if (session?.kicked_at) return NextResponse.json({ error: 'Sesión revocada.' }, { status: 401 })
    if (session?.logout_at) return NextResponse.json({ error: 'Sesión cerrada en otro dispositivo.', displaced: true }, { status: 401 })

    // Actualizar last_ping_at
    await supabase
      .from('assembly_sessions')
      .update({ last_ping_at: new Date().toISOString() })
      .eq('id', payload.sessionId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error POST assembly ping:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
