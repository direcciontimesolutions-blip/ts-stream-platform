// app/api/admin/assemblies/[id]/sala/route.ts — Datos unificados para pantalla sala (proyector)

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

    // ── 1. Asamblea + Org ──────────────────────────────────────────────────────
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('id, title, slug, status, scheduled_at, total_coefficient, current_convocatoria, quorum_threshold_primera, quorum_threshold_segunda, stream_url, organizations(name, slug, primary_color)')
      .eq('id', assemblyId)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })

    // ── 2. Quórum ──────────────────────────────────────────────────────────────
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const nowStr = new Date().toISOString()

    const { data: sessions } = await supabase
      .from('assembly_sessions')
      .select('attendee_id, is_presencial, last_ping_at, created_at')
      .eq('assembly_id', assemblyId)
      .is('logout_at', null)
      .is('kicked_at', null)

    const isActive = (s: { is_presencial: boolean; last_ping_at: string | null; created_at: string }) =>
      s.is_presencial || (s.last_ping_at ?? s.created_at) >= twoMinutesAgo

    const activeSessions = (sessions ?? []).filter(isActive)
    const activeAttendeeIds = activeSessions.map(s => s.attendee_id)
    const presencialCount = activeSessions.filter(s => s.is_presencial).length

    let currentCoefficient = 0
    if (activeAttendeeIds.length > 0) {
      const { data: attendees } = await supabase
        .from('assembly_attendees')
        .select('id, unit_id')
        .in('id', activeAttendeeIds)

      const activeSet = new Set(activeAttendeeIds)
      const ownUnitIds = new Set((attendees ?? []).filter(a => a.unit_id).map(a => a.unit_id as string))

      const { data: poderes } = await supabase
        .from('assembly_poderes')
        .select('granting_unit_id, receiving_attendee_id')
        .eq('assembly_id', assemblyId)
        .not('receiving_attendee_id', 'is', null)

      const repUnitIds = new Set(
        (poderes ?? [])
          .filter(p => p.receiving_attendee_id && activeSet.has(p.receiving_attendee_id))
          .map(p => p.granting_unit_id)
      )

      const allUnitIds = new Set([...ownUnitIds, ...repUnitIds])
      if (allUnitIds.size > 0) {
        const { data: units } = await supabase
          .from('assembly_units')
          .select('coefficient')
          .in('id', Array.from(allUnitIds))
        currentCoefficient = (units ?? []).reduce((s, u) => s + Number(u.coefficient), 0)
      }
    }

    const totalCoef = Number(assembly.total_coefficient ?? 1)
    const thresholdRaw = assembly.current_convocatoria === 'segunda'
      ? Number(assembly.quorum_threshold_segunda ?? 0)
      : Number(assembly.quorum_threshold_primera ?? 0.5001)
    const pct = totalCoef > 0 ? (currentCoefficient / totalCoef) * 100 : 0
    const thresholdPct = thresholdRaw * 100

    // ── 3. Mociones + Tallies ──────────────────────────────────────────────────
    const { data: motionsRaw } = await supabase
      .from('assembly_motions')
      .select('id, title, description, motion_type, status, order_index, closes_at, closed_at, quorum_at_open, quorum_at_close, assembly_plancha_options(id, name, order_index)')
      .eq('assembly_id', assemblyId)
      .order('order_index')

    // Auto-cierre
    const expired = (motionsRaw ?? []).filter(m => m.status === 'open' && m.closes_at && m.closes_at < nowStr)
    if (expired.length > 0) {
      await supabase
        .from('assembly_motions')
        .update({ status: 'closed', closed_at: nowStr, closes_at: null })
        .in('id', expired.map(m => m.id))
      expired.forEach(m => { m.status = 'closed'; m.closed_at = nowStr; m.closes_at = null })
    }

    const motionIds = (motionsRaw ?? []).map(m => m.id)

    // Tallies por coeficiente
    let tallyMap: Record<string, Record<string, number>> = {}
    let votedUnitsMap: Record<string, number> = {}

    if (motionIds.length > 0) {
      const { data: votes } = await supabase
        .from('assembly_votes')
        .select('motion_id, vote_value, coefficient_weight, unit_id')
        .in('motion_id', motionIds)

      for (const v of votes ?? []) {
        if (!tallyMap[v.motion_id]) { tallyMap[v.motion_id] = {}; votedUnitsMap[v.motion_id] = 0 }
        tallyMap[v.motion_id][v.vote_value] = (tallyMap[v.motion_id][v.vote_value] ?? 0) + Number(v.coefficient_weight)
        votedUnitsMap[v.motion_id] = (votedUnitsMap[v.motion_id] ?? 0) + 1
      }
    }

    const motions = (motionsRaw ?? []).map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      motion_type: m.motion_type,
      status: m.status,
      order_index: m.order_index,
      closes_at: m.closes_at ?? null,
      closed_at: m.closed_at ?? null,
      quorum_at_open: m.quorum_at_open ?? null,
      quorum_at_close: m.quorum_at_close ?? null,
      plancha_options: (m.assembly_plancha_options as Array<{ id: string; name: string; order_index: number }> ?? [])
        .sort((a, b) => a.order_index - b.order_index),
      tally: tallyMap[m.id] ?? {},
      voted_units: votedUnitsMap[m.id] ?? 0,
    }))

    // ── 4. Turno de palabra activo ─────────────────────────────────────────────
    const { data: floorRequests } = await supabase
      .from('assembly_floor_requests')
      .select('id, attendee_name, unit_number, status, agora_channel, requested_at, granted_at')
      .eq('assembly_id', assemblyId)
      .in('status', ['pending', 'granted'])
      .order('requested_at')

    // ── 5. Token Agora para sala como viewer ───────────────────────────────────
    const SALA_UID = 9999
    let salaAgora: { app_id: string; channel: string; token: string; uid: number } | null = null
    const grantedReq = (floorRequests ?? []).find(r => r.status === 'granted' && r.agora_channel)
    if (grantedReq?.agora_channel) {
      try {
        const { generateRtcToken, APP_ID } = await import('@/lib/agora-token')
        salaAgora = {
          app_id: APP_ID,
          channel: grantedReq.agora_channel,
          token: generateRtcToken(grantedReq.agora_channel, SALA_UID, 3600),
          uid: SALA_UID,
        }
      } catch { /* env vars no configuradas */ }
    }

    const org = assembly.organizations as unknown as { name: string; slug: string; primary_color: string | null } | null

    return NextResponse.json({
      assembly: {
        id: assembly.id,
        title: assembly.title,
        slug: assembly.slug,
        status: assembly.status,
        scheduled_at: assembly.scheduled_at,
        current_convocatoria: assembly.current_convocatoria,
        stream_url: assembly.stream_url ?? null,
        org: { name: org?.name ?? '', slug: org?.slug ?? '', primary_color: org?.primary_color ?? '#7c3aed' },
      },
      quorum: {
        pct: Math.round(pct * 100) / 100,
        threshold: Math.round(thresholdPct * 100) / 100,
        reached: pct >= thresholdPct,
        connected_count: activeAttendeeIds.length,
        presencial_count: presencialCount,
        current_coef: Math.round(currentCoefficient * 10000) / 10000,
        total_coef: totalCoef,
      },
      motions,
      floor_requests: (floorRequests ?? []).map(r => ({
        id: r.id,
        attendee_name: r.attendee_name,
        unit_number: r.unit_number,
        status: r.status,
        requested_at: r.requested_at,
        granted_at: r.granted_at,
      })),
      sala_agora: salaAgora,
    })
  } catch (err) {
    console.error('Error GET sala:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
