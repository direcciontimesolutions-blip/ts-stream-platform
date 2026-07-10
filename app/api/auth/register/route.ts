// app/api/auth/register/route.ts — Auto-registro sin contraseña (open_registration)

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signAttendeeToken, ATTENDEE_COOKIE } from '@/lib/auth'
import { getClientIP } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      org?: string
      event?: string
      full_name?: string
      email?: string
    }

    const { org, event, full_name, email } = body

    if (!org || !event || !full_name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nombre y correo son requeridos.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: organization } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', org)
      .single()

    if (!organization) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const { data: eventData } = await supabase
      .from('events')
      .select('id, status, branding')
      .eq('organization_id', organization.id)
      .eq('slug', event)
      .single()

    if (!eventData) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }
    if (eventData.status !== 'live') {
      return NextResponse.json({ error: 'El evento no está disponible.' }, { status: 403 })
    }

    const branding = (eventData.branding ?? {}) as { open_registration?: boolean }
    if (!branding.open_registration) {
      return NextResponse.json({ error: 'Este evento requiere credenciales de acceso.' }, { status: 403 })
    }

    // Cada ingreso = registro independiente. Username único por timestamp.
    const base = email.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 12)
    const username = `${base}_${Date.now().toString(36)}`
    // password_hash no se usa para login en modo open — valor aleatorio
    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 4)
    const ipAddress = getClientIP(req)
    const userAgent = req.headers.get('user-agent') ?? 'unknown'

    const { data: attendee, error: attError } = await supabase
      .from('attendees')
      .insert({
        event_id: eventData.id,
        organization_id: organization.id,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        username,
        password_hash: passwordHash,
        role: 'attendee',
      })
      .select('id, full_name, username')
      .single()

    if (attError || !attendee) {
      console.error('Error creando asistente:', attError)
      return NextResponse.json({ error: 'Error al registrar. Intenta de nuevo.' }, { status: 500 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        attendee_id: attendee.id,
        event_id: eventData.id,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select('id')
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
    }

    const token = await signAttendeeToken({
      attendeeId: attendee.id,
      eventId: eventData.id,
      orgId: organization.id,
      sessionId: session.id,
      name: attendee.full_name,
      username: attendee.username,
    })

    const response = NextResponse.json({ ok: true, sessionId: session.id })
    response.cookies.set(ATTENDEE_COOKIE.name, token, ATTENDEE_COOKIE.options)
    return response
  } catch (err) {
    console.error('Error en register:', err)
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 })
  }
}
