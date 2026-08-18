// lib/attendee-metrics.ts — Agregacion de tiempo conectado por asistente REAL
//
// Extraido de app/api/admin/events/[id]/export/route.ts (commit ddf43a6) para poder
// reusar el MISMO calculo desde dos lugares sin duplicar la logica: el CSV de metricas
// y el filtro de elegibilidad de certificados (>= 30 min conectado, criterio confirmado
// por la SCP para el Primer Simposio en Pediatria, 18 ago 2026). Cualquier cambio futuro
// al criterio de agregacion (ej. como se estima una sesion todavia activa) solo se toca aqui.

import { createServiceRoleClient } from '@/lib/supabase/server'

export interface AttendeeMetrics {
  id: string
  full_name: string
  document_id: string | null
  email: string | null
  company: string | null
  phone: string | null
  firstLogin: string | null
  lastLogin: string | null
  totalSeconds: number
  sessionCount: number
}

interface SessionRow {
  attendee_id: string
  login_at: string
  logout_at: string | null
  duration_seconds: number | null
  last_ping_at: string | null
}

// Umbral confirmado por el cliente (SCP Antioquia) para el Primer Simposio en Pediatria:
// minimo 30 minutos de tiempo conectado real para calificar a certificado de asistencia.
export const CERTIFICATE_ELIGIBILITY_SECONDS = 30 * 60

export async function getAttendeeMetrics(eventId: string): Promise<AttendeeMetrics[]> {
  const supabase = createServiceRoleClient()

  const { data: attendees, error: attendeesError } = await supabase
    .from('attendees')
    .select('id, full_name, document_id, email, company, phone')
    .eq('event_id', eventId)

  if (attendeesError) {
    throw new Error(attendeesError.message)
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('attendee_id, login_at, logout_at, duration_seconds, last_ping_at')
    .eq('event_id', eventId)
    .order('login_at', { ascending: true })

  if (sessionsError) {
    throw new Error(sessionsError.message)
  }

  // ── Agregacion por asistente ─────────────────────────────────────────────
  // Sesiones ya cerradas usan duration_seconds tal cual. Una sesion sin logout_at
  // (asistente sigue conectado en este momento) todavia no tiene duration_seconds,
  // pero no debe contar como cero tiempo: se estima con last_ping_at - login_at
  // (el ultimo latido de conexion conocido), y si no hay ping aun se usa el momento actual.
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

  const rows: AttendeeMetrics[] = (attendees ?? []).map((a) => {
    const agg = byAttendee.get(a.id)
    return {
      id: a.id,
      full_name: a.full_name ?? '',
      document_id: a.document_id ?? null,
      email: a.email ?? null,
      company: a.company ?? null,
      phone: a.phone ?? null,
      firstLogin: agg?.firstLogin ?? null,
      lastLogin: agg?.lastLogin ?? null,
      totalSeconds: agg?.totalSeconds ?? 0,
      sessionCount: agg?.sessionCount ?? 0,
    }
  })

  // Mas comprometidos primero (mayor tiempo conectado).
  rows.sort((a, b) => b.totalSeconds - a.totalSeconds)

  return rows
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h}h ${m}min`
}
