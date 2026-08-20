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

    // 6-7. Verificar cupo de sesiones y crear la sesion en una sola transaccion atomica
    // (funcion try_create_session, supabase/migrations/018_session_limit_atomic.sql,
    // aplicada el 20 ago 2026). Reemplaza el conteo-en-memoria anterior (leer, luego
    // insertar en 2 llamadas separadas) que dejaba una ventana de carrera real: dos
    // logins del MISMO asistente casi simultaneos (doble clic, 2 pestañas, reintento de
    // red) podian colarse ambos antes de que cualquiera terminara de insertar. La funcion
    // usa SELECT ... FOR UPDATE para serializar esto a nivel de base de datos.
    //
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
    const MAX_CONCURRENT_SESSIONS = openRegistration ? 2 : 1
    const ipAddress = getClientIP(req)
    const userAgent = req.headers.get('user-agent') ?? 'unknown'

    const { data: sessionRows, error: sessionError } = await supabase.rpc('try_create_session', {
      p_attendee_id: attendee.id,
      p_event_id: eventData.id,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_max_sessions: MAX_CONCURRENT_SESSIONS,
      p_fresh_minutes: 5,
    })

    if (sessionError) {
      console.error('Error creando sesion (try_create_session):', sessionError)
      return NextResponse.json(
        { error: 'Error interno. Intenta de nuevo.' },
        { status: 500 }
      )
    }

    const session = sessionRows?.[0]

    if (!session) {
      const message = MAX_CONCURRENT_SESSIONS === 1
        ? 'Ya tienes una sesión activa en otro dispositivo. Cerrá esa sesión primero para poder ingresar aquí.'
        : `Ya tienes ${MAX_CONCURRENT_SESSIONS} sesiones activas en otros dispositivos. Cerrá una de esas sesiones primero.`
      return NextResponse.json({ error: message }, { status: 409 })
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
