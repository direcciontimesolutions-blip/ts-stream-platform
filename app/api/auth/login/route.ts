// app/api/auth/login/route.ts — Login de asistente al evento

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
      username?: string
      password?: string
    }

    const { org, event, username, password } = body

    if (!org || !event || !username || !password) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // 1. Buscar la organizacion por slug
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', org)
      .single()

    if (orgError || !organization) {
      return NextResponse.json(
        { error: 'Evento no encontrado.' },
        { status: 404 }
      )
    }

    // 2. Buscar el evento por org_id + slug, verificar que este live
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, title, slug, status')
      .eq('organization_id', organization.id)
      .eq('slug', event)
      .single()

    if (eventError || !eventData) {
      return NextResponse.json(
        { error: 'Evento no encontrado.' },
        { status: 404 }
      )
    }

    if (eventData.status !== 'live') {
      return NextResponse.json(
        { error: 'El evento no esta disponible en este momento.' },
        { status: 403 }
      )
    }

    // 3. Buscar el asistente por event_id + username
    const { data: attendee, error: attendeeError } = await supabase
      .from('attendees')
      .select('id, full_name, username, password_hash, role')
      .eq('event_id', eventData.id)
      .eq('username', username.trim().toLowerCase())
      .single()

    if (attendeeError || !attendee) {
      return NextResponse.json(
        { error: 'Usuario o contrasena incorrectos.' },
        { status: 401 }
      )
    }

    // 4. Verificar password con bcrypt
    const passwordOk = await bcrypt.compare(password, attendee.password_hash)
    if (!passwordOk) {
      return NextResponse.json(
        { error: 'Usuario o contrasena incorrectos.' },
        { status: 401 }
      )
    }

    // 5. Verificar que el asistente no fue expulsado de este evento
    const { data: kickedSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('attendee_id', attendee.id)
      .eq('event_id', eventData.id)
      .not('kicked_at', 'is', null)
      .limit(1)
      .maybeSingle()

    if (kickedSession) {
      return NextResponse.json(
        { error: 'Tu acceso a este evento fue revocado por el administrador.' },
        { status: 403 }
      )
    }

    // 6. Verificar que no haya una sesión activa en otro dispositivo.
    // Dos queries separadas para evitar problemas de parseo con .or() y timestamps.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    // 6a. Sesión con ping reciente
    const { data: sessionByPing } = await supabase
      .from('sessions')
      .select('id')
      .eq('attendee_id', attendee.id)
      .eq('event_id', eventData.id)
      .is('logout_at', null)
      .is('kicked_at', null)
      .gte('last_ping_at', twoMinutesAgo)
      .limit(1)
      .maybeSingle()

    // 6b. Sesión recién creada pero sin ping todavía (last_ping_at es NULL los primeros ~30s)
    const { data: sessionByCreate } = await supabase
      .from('sessions')
      .select('id')
      .eq('attendee_id', attendee.id)
      .eq('event_id', eventData.id)
      .is('logout_at', null)
      .is('kicked_at', null)
      .is('last_ping_at', null)
      .gte('created_at', twoMinutesAgo)
      .limit(1)
      .maybeSingle()

    if (sessionByPing || sessionByCreate) {
      return NextResponse.json(
        { error: 'Ya tienes una sesión activa en otro dispositivo. Cerrá esa sesión primero.' },
        { status: 409 }
      )
    }

    // 7. Crear sesion en la tabla sessions
    const ipAddress = getClientIP(req)
    const userAgent = req.headers.get('user-agent') ?? 'unknown'

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

    // 7b. Invalidar sesiones anteriores del mismo asistente en este evento.
    // Esto evita que un browser antiguo reabierto reactive una sesión huérfana.
    if (session) {
      await supabase
        .from('sessions')
        .update({ logout_at: new Date().toISOString() })
        .eq('attendee_id', attendee.id)
        .eq('event_id', eventData.id)
        .is('logout_at', null)
        .is('kicked_at', null)
        .neq('id', session.id)
    }

    if (sessionError || !session) {
      console.error('Error creando sesion:', sessionError)
      return NextResponse.json(
        { error: 'Error interno. Intenta de nuevo.' },
        { status: 500 }
      )
    }

    // 6. Firmar JWT con payload del asistente
    const token = await signAttendeeToken({
      attendeeId: attendee.id,
      eventId: eventData.id,
      orgId: organization.id,
      sessionId: session.id,
      name: attendee.full_name,
      username: attendee.username,
    })

    // 7. Set cookie httpOnly + return ok
    const response = NextResponse.json({ ok: true, sessionId: session.id })
    response.cookies.set(
      ATTENDEE_COOKIE.name,
      token,
      ATTENDEE_COOKIE.options
    )

    return response
  } catch (err) {
    console.error('Error en login:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor.' },
      { status: 500 }
    )
  }
}
