// app/api/admin/assemblies/[id]/quorum/route.ts — Quórum en tiempo real

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const supabase = createServiceRoleClient()

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    // Sesiones activas: virtual con ping reciente O presencial sin logout
    const { data: activeSessions } = await supabase
      .from('assembly_sessions')
      .select('attendee_id, is_presencial, last_ping_at, created_at')
      .eq('assembly_id', assemblyId)
      .is('logout_at', null)
      .is('kicked_at', null)

    const sessions = activeSessions ?? []

    const activePredicate = (s: { is_presencial: boolean; last_ping_at: string | null; created_at: string }) => {
      if (s.is_presencial) return true
      const ref = s.last_ping_at ?? s.created_at
      return ref >= twoMinutesAgo
    }

    const activeAttendeeIds = sessions
      .filter(activePredicate)
      .map(s => s.attendee_id)

    const presencialCount = sessions.filter(s => s.is_presencial && activePredicate(s)).length

    if (activeAttendeeIds.length === 0) {
      const { data: assembly } = await supabase
        .from('assemblies')
        .select('total_coefficient, quorum_threshold_primera, quorum_threshold_segunda, current_convocatoria')
        .eq('id', assemblyId)
        .single()

      const thresholdRaw = assembly?.current_convocatoria === 'segunda'
        ? (assembly?.quorum_threshold_segunda ?? 0)
        : (assembly?.quorum_threshold_primera ?? 0.5001)
      const threshold = thresholdRaw * 100

      return NextResponse.json({
        current_coefficient: 0,
        total_coefficient: assembly?.total_coefficient ?? 1,
        pct: 0,
        threshold,
        reached: threshold === 0,
        convocatoria: assembly?.current_convocatoria ?? 'primera',
        connected_count: 0,
        presencial_count: 0,
      })
    }

    // Obtener unidades representadas por los asistentes activos
    const { data: attendees } = await supabase
      .from('assembly_attendees')
      .select('id, unit_id')
      .in('id', activeAttendeeIds)

    const activeAttendeeSet = new Set(activeAttendeeIds)

    // Unidades propias
    const ownUnitIds = new Set(
      (attendees ?? []).filter(a => a.unit_id).map(a => a.unit_id as string)
    )

    // Unidades por poder (representadas por alguien activo)
    const { data: poderes } = await supabase
      .from('assembly_poderes')
      .select('granting_unit_id, receiving_attendee_id')
      .eq('assembly_id', assemblyId)
      .not('receiving_attendee_id', 'is', null)

    const representedUnitIds = new Set(
      (poderes ?? [])
        .filter(p => p.receiving_attendee_id && activeAttendeeSet.has(p.receiving_attendee_id))
        .map(p => p.granting_unit_id)
    )

    const allRepresentedUnitIds = new Set([...ownUnitIds, ...representedUnitIds])

    // Sumar coeficientes
    let currentCoefficient = 0
    if (allRepresentedUnitIds.size > 0) {
      const { data: units } = await supabase
        .from('assembly_units')
        .select('id, coefficient')
        .in('id', Array.from(allRepresentedUnitIds))

      currentCoefficient = (units ?? []).reduce((sum, u) => sum + Number(u.coefficient), 0)
    }

    const { data: assembly } = await supabase
      .from('assemblies')
      .select('total_coefficient, quorum_threshold_primera, quorum_threshold_segunda, current_convocatoria')
      .eq('id', assemblyId)
      .single()

    const totalCoef = assembly?.total_coefficient ?? 1
    const pct = totalCoef > 0 ? (currentCoefficient / totalCoef) * 100 : 0
    const threshold = assembly?.current_convocatoria === 'segunda'
      ? (assembly?.quorum_threshold_segunda ?? 0)
      : (assembly?.quorum_threshold_primera ?? 0.5001)
    const thresholdPct = threshold * 100

    return NextResponse.json({
      current_coefficient: Math.round(currentCoefficient * 1000000) / 1000000,
      total_coefficient: totalCoef,
      pct: Math.round(pct * 100) / 100,
      threshold: thresholdPct,
      reached: pct >= thresholdPct,
      convocatoria: assembly?.current_convocatoria ?? 'primera',
      connected_count: activeAttendeeIds.length,
      presencial_count: presencialCount,
    })
  } catch (err) {
    console.error('Error GET quorum:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
