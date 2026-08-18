// app/api/admin/events/[id]/export/route.ts — GET exporta CSV de metricas de conexion por asistente
//
// Entregable pedido por el cliente desde el inicio del proyecto: "dar al cliente el archivo
// y que nos de toda la metrica de conexion y tiempo de cada persona". Una fila por attendee_id
// real (agrega todas las sesiones/reingresos de la misma persona), columnas: nombre, correo,
// empresa, telefono, primera/ultima conexion, tiempo total conectado, numero de sesiones.
//
// Parametro opcional ?solo_elegibles=true — filtra a solo quienes cumplen el umbral de
// CERTIFICATE_ELIGIBILITY_SECONDS (hoy 30 min, criterio confirmado por SCP Antioquia para
// certificados de asistencia). Reusa exactamente la misma agregacion que consume
// app/api/admin/events/[id]/send-certificates/route.ts (lib/attendee-metrics.ts) para que
// el CSV filtrado y el envio real de certificados nunca se puedan desincronizar.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAttendeeMetrics, formatDuration, CERTIFICATE_ELIGIBILITY_SECONDS } from '@/lib/attendee-metrics'

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    const soloElegibles = req.nextUrl.searchParams.get('solo_elegibles') === 'true'

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

    let rows = await getAttendeeMetrics(eventId)
    if (soloElegibles) {
      rows = rows.filter((r) => r.totalSeconds >= CERTIFICATE_ELIGIBILITY_SECONDS)
    }

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
    const filename = soloElegibles
      ? `metricas-elegibles-${event.slug || eventId}.csv`
      : `metricas-${event.slug || eventId}.csv`

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
