// app/api/admin/events/[id]/export/route.ts — GET exporta CSV de metricas de conexion por asistente
//
// Entregable pedido por el cliente desde el inicio del proyecto: "dar al cliente el archivo
// y que nos de toda la metrica de conexion y tiempo de cada persona". Una fila por asistente
// REAL (no por sesion) — un reingreso con el mismo correo reusa el mismo attendee_id
// (ver app/api/auth/register/route.ts), asi que aqui se agregan todas sus sesiones.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

interface SessionRow {
  attendee_id: string
  login_at: string
  logout_at: string | null
  duration_seconds: number | null
  last_ping_at: string | null
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDateCO(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  })
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    // ── Auth admin (mismo patron que attendees/route.ts) ────────────────────
    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('title, slug')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const { data: attendees, error: attendeesError } = await supabase
      .from('attendees')
      .select('id, full_name, document_id, email, company, phone')
      .eq('event_id', eventId)

    if (attendeesError) {
      return NextResponse.json({ error: attendeesError.message }, { status: 500 })
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('attendee_id, login_at, logout_at, duration_seconds, last_ping_at')
      .eq('event_id', eventId)
      .order('login_at', { ascending: true })

    if (sessionsError) {
      return NextResponse.json({ error: sessionsError.message }, { status: 500 })
    }

    // ── Agregacion por asistente ─────────────────────────────────────────────
    // Sesiones ya cerradas usan duration_seconds tal cual. Una sesion sin logout_at
    // (asistente sigue conectado en este momento) todavia no tiene duration_seconds,
    // pero no debe contar como cero tiempo: se estima con last_ping_at - login_at
    // (el ultimo latido de conexion conocido), y si no hay ping aun se usa 0.
    const nowFallback = Date.now()

    interface Agg {
      firstLogin: string | null
      lastLogin: string | null
      totalSeconds: number
      sessionCount: number
    }
    const byAttendee = new Map<string, Agg>()

    for (const s of (sessions ?? []) as SessionRow[]) {
      const agg = byAttendee.get(s.attendee_id) ?? {
        firstLogin: null,
        lastLogin: null,
        totalSeconds: 0,
        sessionCount: 0,
      }

      agg.sessionCount += 1
      if (!agg.firstLogin || s.login_at < agg.firstLogin) agg.firstLogin = s.login_at
      if (!agg.lastLogin || s.login_at > agg.lastLogin) agg.lastLogin = s.login_at

      let seconds = s.duration_seconds ?? null
      if (seconds === null) {
        const start = new Date(s.login_at).getTime()
        const end = s.last_ping_at ? new Date(s.last_ping_at).getTime() : (s.logout_at ? new Date(s.logout_at).getTime() : nowFallback)
        seconds = Math.max(0, Math.round((end - start) / 1000))
      }
      agg.totalSeconds += seconds

      byAttendee.set(s.attendee_id, agg)
    }

    const rows = (attendees ?? []).map((a) => {
      const agg = byAttendee.get(a.id)
      return {
        full_name: a.full_name ?? '',
        document_id: a.document_id ?? '',
        email: a.email ?? '',
        company: a.company ?? '',
        phone: a.phone ?? '',
        firstLogin: agg?.firstLogin ?? null,
        lastLogin: agg?.lastLogin ?? null,
        totalSeconds: agg?.totalSeconds ?? 0,
        sessionCount: agg?.sessionCount ?? 0,
      }
    })

    // Mas comprometidos primero (mayor tiempo conectado).
    rows.sort((a, b) => b.totalSeconds - a.totalSeconds)

    const header = [
      'Nombre completo',
      'Cedula / Documento',
      'Correo',
      'Empresa',
      'Telefono',
      'Primera conexion',
      'Ultima conexion',
      'Tiempo total conectado',
      'Numero de sesiones',
    ]

    const lines = [header.map(csvEscape).join(',')]
    for (const r of rows) {
      lines.push([
        csvEscape(r.full_name),
        csvEscape(r.document_id),
        csvEscape(r.email),
        csvEscape(r.company),
        csvEscape(r.phone),
        csvEscape(formatDateCO(r.firstLogin)),
        csvEscape(formatDateCO(r.lastLogin)),
        csvEscape(formatDuration(r.totalSeconds)),
        csvEscape(r.sessionCount),
      ].join(','))
    }

    // BOM UTF-8 para que Excel abra tildes/enes correctamente.
    const csv = '﻿' + lines.join('\r\n') + '\r\n'
    const filename = `metricas-${event.slug || eventId}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error exportando CSV de metricas:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
