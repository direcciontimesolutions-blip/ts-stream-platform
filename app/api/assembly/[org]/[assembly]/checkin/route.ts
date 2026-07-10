// app/api/assembly/[org]/[assembly]/checkin/route.ts — Check-in presencial via QR

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signAssemblyToken } from '@/lib/assembly-auth'
import bcrypt from 'bcryptjs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; assembly: string }> }
) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const body = await req.json() as { username: string; password: string; qr_token: string }

    if (!body.username?.trim() || !body.password?.trim() || !body.qr_token?.trim())
      return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 })

    const supabase = createServiceRoleClient()

    // Buscar asamblea
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('id, title, status, organizations!inner(slug)')
      .eq('slug', assemblySlug)
      .eq('organizations.slug', orgSlug)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })
    if (assembly.status === 'ended') return NextResponse.json({ error: 'Esta asamblea ya finalizó.' }, { status: 403 })

    // Verificar QR token
    const now = new Date().toISOString()
    const { data: qrToken } = await supabase
      .from('assembly_qr_tokens')
      .select('id, expires_at')
      .eq('assembly_id', assembly.id)
      .eq('token', body.qr_token.trim())
      .single()

    if (!qrToken) return NextResponse.json({ error: 'Código QR inválido.' }, { status: 401 })
    if (qrToken.expires_at < now) return NextResponse.json({ error: 'El código QR ha expirado.' }, { status: 401 })

    // Verificar asistente
    const { data: attendee } = await supabase
      .from('assembly_attendees')
      .select('id, full_name, username, password_hash, unit_id, role')
      .eq('assembly_id', assembly.id)
      .eq('username', body.username.trim())
      .single()

    if (!attendee) return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })

    const passwordOk = await bcrypt.compare(body.password, attendee.password_hash)
    if (!passwordOk) return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })

    // Auto-vincular poderes
    const { data: pendingPoderes } = await supabase
      .from('assembly_poderes')
      .select('id')
      .eq('assembly_id', assembly.id)
      .ilike('representative_name', attendee.full_name)
      .is('receiving_attendee_id', null)

    if (pendingPoderes && pendingPoderes.length > 0) {
      await supabase
        .from('assembly_poderes')
        .update({ receiving_attendee_id: attendee.id })
        .in('id', pendingPoderes.map(p => p.id))
    }

    // Cerrar sesiones previas activas
    await supabase
      .from('assembly_sessions')
      .update({ logout_at: new Date().toISOString() })
      .eq('attendee_id', attendee.id)
      .eq('assembly_id', assembly.id)
      .is('logout_at', null)

    // Crear sesión presencial
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null
    const userAgent = req.headers.get('user-agent') ?? null

    const { data: session } = await supabase
      .from('assembly_sessions')
      .insert({
        attendee_id: attendee.id,
        assembly_id: assembly.id,
        ip_address: ip,
        user_agent: userAgent,
        is_presencial: true,
      })
      .select('id')
      .single()

    if (!session) return NextResponse.json({ error: 'Error creando sesión.' }, { status: 500 })

    const token = await signAssemblyToken({
      sub: attendee.id,
      assemblyId: assembly.id,
      sessionId: session.id,
      unitId: attendee.unit_id,
      role: attendee.role,
      name: attendee.full_name,
      org: orgSlug,
      assembly: assemblySlug,
    })

    const res = NextResponse.json({
      ok: true,
      redirect: `/${orgSlug}/${assemblySlug}/watch`,
      name: attendee.full_name,
      presencial: true,
    })

    res.cookies.set('ts_assembly_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })

    return res
  } catch (err) {
    console.error('Error POST checkin:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
