// app/api/auth/login/route.ts — Login de asistente al evento

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signAttendeeToken, ATTENDEE_COOKIE } from '@/lib/auth'
import { getClientIP } from '@/lib/utils'
import { getEventLiveState } from '@/lib/event-live-state'

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
      .select('id, title, slug, status, start_at, end_at, branding')
      .eq('organization_id', organization.id)
      .eq('slug', event)
      .single()

    if (eventError || !eventData) {
      return NextResponse.json(
        { error: 'Evento no encontrado.' },
        { status: 404 }
      )
    }

    if (!getEventLiveState(eventData.status, eventData.start_at, eventData.end_at).isLive) {
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

    // 6. Verificar cuantas sesiones activas tiene este asistente en este evento.
    // Limite depende del modo de registro (pedido explicito de Julian, 20 ago 2026):
    // - Registro abierto (open_registration): 2 sesiones — celular+compu simultaneo es
    //   un caso valido, decision original del Simposio SCP (nadie controla quien se
    //   registra, no tiene sentido perseguir sesiones dobles ahi).
    // - Credenciales generadas por Time Solutions desde una base de datos del cliente:
    //   1 sesion — "prohibido estar en 2 sesiones o dispositivos al mismo tiempo",
    //   pensado para desincentivar que alguien comparta su usuario/contrasena (compartir
    //   se vuelve inutil si el segundo login queda bloqueado en vez de solo desplazar al
    //   primero). Se bloquea con 409 solo si ya hay ese maximo de sesiones FRESCAS.
    const openRegistration = (eventData.branding as { open_registration?: boolean } | null)?.open_registration === true
    //
    // Criterio de "fresca" identico al que ya usan app/[org]/[event]/page.tsx y
    // app/[org]/[event]/watch/page.tsx (fix del mismo dia, commit 517e6f5): logout_at/
    // kicked_at NULL y (last_ping_at ?? login_at) dentro de los ultimos 5 minutos. Antes
    // esta ruta usaba un criterio distinto e inconsistente (umbral de 2 min, fallback a
    // created_at en vez de login_at) — ahora usa el mismo criterio en todo el sistema.
    //
    // Nota de concurrencia: este conteo se hace en memoria (leer, luego insertar), no es
    // atomico a nivel de base de datos. Dos logins del MISMO asistente llegando en la
    // misma fraccion de segundo (ej. doble clic, 2 pestañas abiertas al mismo tiempo)
    // podrian en teoria colarse como 3ra sesion antes de que cualquiera termine de
    // insertar. Para cerrar esa ventana por completo hace falta una funcion Postgres
    // (SELECT ... FOR UPDATE) que serialice esto a nivel de transaccion — ver
    // supabase/migrations/018_session_limit_atomic.sql, preparada pero AUN NO APLICADA
    // (requiere correrla una vez en el SQL Editor de Supabase, Claude no tiene acceso DDL
    // a la base). Migrar esta ruta a esa funcion via supabase.rpc() en cuanto este aplicada.
    const MAX_CONCURRENT_SESSIONS = openRegistration ? 2 : 1
    const FRESH_WINDOW_MS = 5 * 60 * 1000
    const freshCutoff = new Date(Date.now() - FRESH_WINDOW_MS).toISOString()

    const { data: openSessions } = await supabase
      .from('sessions')
      .select('id, last_ping_at, login_at')
      .eq('attendee_id', attendee.id)
      .eq('event_id', eventData.id)
      .is('logout_at', null)
      .is('kicked_at', null)

    const freshSessions = (openSessions ?? []).filter((s) => {
      const lastActivity = s.last_ping_at ?? s.login_at
      return !!lastActivity && lastActivity >= freshCutoff
    })

    if (freshSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const message = MAX_CONCURRENT_SESSIONS === 1
        ? 'Ya tienes una sesión activa en otro dispositivo. Cerrá esa sesión primero para poder ingresar aquí.'
        : `Ya tienes ${MAX_CONCURRENT_SESSIONS} sesiones activas en otros dispositivos. Cerrá una de esas sesiones primero.`
      return NextResponse.json({ error: message }, { status: 409 })
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

    // 7b. Housekeeping: cerrar sesiones huerfanas (abiertas pero YA NO frescas) del mismo
    // asistente en este evento. A diferencia del comportamiento anterior (que invalidaba
    // TODAS las demas sesiones abiertas, correcto solo para limite=1), esto deja intactas
    // las sesiones hermanas que siguen frescas — de lo contrario, con limite=2, un login
    // nuevo mataria la sesion del otro dispositivo activo.
    if (session) {
      await supabase
        .from('sessions')
        .update({ logout_at: new Date().toISOString() })
        .eq('attendee_id', attendee.id)
        .eq('event_id', eventData.id)
        .is('logout_at', null)
        .is('kicked_at', null)
        .neq('id', session.id)
        // Equivalente a COALESCE(last_ping_at, login_at) < freshCutoff, mismo criterio
        // de frescura del paso 6.
        .or(`last_ping_at.lt.${freshCutoff},and(last_ping_at.is.null,login_at.lt.${freshCutoff})`)
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
