// app/api/assembly/[org]/[assembly]/login/route.ts — Login de asistente

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signAssemblyToken } from '@/lib/assembly-auth'
import { logAudit } from '@/lib/assembly-audit'
import bcrypt from 'bcryptjs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; assembly: string }> }
) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const body = await req.json() as { username: string; password: string }

    if (!body.username?.trim() || !body.password?.trim())
      return NextResponse.json({ error: 'Usuario y contraseña requeridos.' }, { status: 400 })

    // Capturar IP y User-Agent al inicio (necesario para auditar intentos fallidos)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? null
    const userAgent = req.headers.get('user-agent') ?? null

    const supabase = createServiceRoleClient()

    // Buscar asamblea por org+slug
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('id, title, status, organizations!inner(slug)')
      .eq('slug', assemblySlug)
      .eq('organizations.slug', orgSlug)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })
    if (assembly.status === 'ended') return NextResponse.json({ error: 'Esta asamblea ya finalizó.' }, { status: 403 })

    // Buscar asistente
    const { data: attendee } = await supabase
      .from('assembly_attendees')
      .select('id, full_name, username, password_hash, unit_id, role, assembly_units(unit_number)')
      .eq('assembly_id', assembly.id)
      .eq('username', body.username.trim())
      .single()

    if (!attendee) {
      await logAudit(supabase, {
        assembly_id: assembly.id,
        action: 'login_failed',
        details: { username: body.username.trim(), reason: 'user_not_found' },
        ip_address: ip,
        user_agent: userAgent,
      })
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })
    }

    const passwordOk = await bcrypt.compare(body.password, attendee.password_hash)
    if (!passwordOk) {
      await logAudit(supabase, {
        assembly_id: assembly.id,
        attendee_id: attendee.id,
        action: 'login_failed',
        details: { reason: 'wrong_password' },
        ip_address: ip,
        user_agent: userAgent,
      })
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 })
    }

    // Auto-vincular poderes cuyo representative_name coincida con el full_name del asistente
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

    // Verificar sesión activa — protección legal: un solo ingreso simultáneo por unidad
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data: activeSessions } = await supabase
      .from('assembly_sessions')
      .select('id, is_presencial, last_ping_at, created_at')
      .eq('attendee_id', attendee.id)
      .eq('assembly_id', assembly.id)
      .is('logout_at', null)
      .is('kicked_at', null)

    for (const s of activeSessions ?? []) {
      const lastActivity = s.last_ping_at ?? s.created_at
      const isActive = s.is_presencial || lastActivity >= twoMinutesAgo
      if (isActive) {
        await logAudit(supabase, {
          assembly_id: assembly.id,
          attendee_id: attendee.id,
          action: 'login_failed',
          details: { reason: 'session_already_active', blocked_session_id: s.id },
          ip_address: ip,
          user_agent: userAgent,
        })
        return NextResponse.json({
          error: 'Ya existe una sesión activa para este usuario en otro dispositivo. Por validez legal de la asamblea, solo se permite un ingreso simultáneo por unidad. Si perdiste acceso, espera 2 minutos e intenta de nuevo.',
        }, { status: 409 })
      }
    }

    // Cerrar sesiones expiradas (sin ping reciente) antes de crear la nueva
    await supabase
      .from('assembly_sessions')
      .update({ logout_at: new Date().toISOString() })
      .eq('attendee_id', attendee.id)
      .eq('assembly_id', assembly.id)
      .is('logout_at', null)

    // Crear nueva sesión
    const { data: session } = await supabase
      .from('assembly_sessions')
      .insert({
        attendee_id: attendee.id,
        assembly_id: assembly.id,
        ip_address: ip,
        user_agent: userAgent,
        last_ping_at: new Date().toISOString(),
        is_presencial: false,
      })
      .select('id')
      .single()

    if (!session) return NextResponse.json({ error: 'Error creando sesión.' }, { status: 500 })

    const unitNumber = (attendee.assembly_units as unknown as { unit_number: string } | null)?.unit_number ?? null

    await logAudit(supabase, {
      assembly_id: assembly.id,
      attendee_id: attendee.id,
      action: 'login',
      details: { session_id: session.id, unit_number: unitNumber },
      ip_address: ip,
      user_agent: userAgent,
    })

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
      redirect: `/assemblies/${orgSlug}/${assemblySlug}/watch`,
      name: attendee.full_name,
      unitNumber,
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
    console.error('Error POST assembly login:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
