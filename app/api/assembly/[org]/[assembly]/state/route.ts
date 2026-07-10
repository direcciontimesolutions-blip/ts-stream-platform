// app/api/assembly/[org]/[assembly]/state/route.ts — Estado completo de la asamblea para asistentes

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAssemblyTokenFromRequest } from '@/lib/assembly-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; assembly: string }> }
) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const payload = await getAssemblyTokenFromRequest(req)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    if (payload.org !== orgSlug || payload.assembly !== assemblySlug)
      return NextResponse.json({ error: 'Token inválido.' }, { status: 403 })

    const supabase = createServiceRoleClient()

    // ── 1. Asamblea ────────────────────────────────────────────────────────────
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('id, title, status, current_convocatoria, total_coefficient, quorum_threshold_primera, quorum_threshold_segunda, stream_url, organizations(name, primary_color)')
      .eq('id', payload.assemblyId)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })

    // ── 2. Quórum (cálculo simplificado para el portal) ────────────────────────
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

    const { data: sessions } = await supabase
      .from('assembly_sessions')
      .select('attendee_id, is_presencial, last_ping_at, created_at')
      .eq('assembly_id', payload.assemblyId)
      .is('logout_at', null)
      .is('kicked_at', null)

    const activeAttendeeIds = (sessions ?? [])
      .filter(s => {
        if (s.is_presencial) return true
        const ref = s.last_ping_at ?? s.created_at
        return ref >= twoMinutesAgo
      })
      .map(s => s.attendee_id)

    let currentCoefficient = 0
    if (activeAttendeeIds.length > 0) {
      const { data: activeAttendees } = await supabase
        .from('assembly_attendees')
        .select('id, unit_id')
        .in('id', activeAttendeeIds)

      const activeSet = new Set(activeAttendeeIds)
      const ownUnitIds = new Set(
        (activeAttendees ?? []).filter(a => a.unit_id).map(a => a.unit_id as string)
      )

      const { data: poderes } = await supabase
        .from('assembly_poderes')
        .select('granting_unit_id, receiving_attendee_id')
        .eq('assembly_id', payload.assemblyId)
        .not('receiving_attendee_id', 'is', null)

      const representedUnitIds = new Set(
        (poderes ?? [])
          .filter(p => p.receiving_attendee_id && activeSet.has(p.receiving_attendee_id))
          .map(p => p.granting_unit_id)
      )

      const allUnitIds = new Set([...ownUnitIds, ...representedUnitIds])

      if (allUnitIds.size > 0) {
        const { data: units } = await supabase
          .from('assembly_units')
          .select('coefficient')
          .in('id', Array.from(allUnitIds))
        currentCoefficient = (units ?? []).reduce((s, u) => s + Number(u.coefficient), 0)
      }
    }

    const totalCoef = Number(assembly.total_coefficient)
    const pct = totalCoef > 0 ? (currentCoefficient / totalCoef) * 100 : 0
    const threshold = assembly.current_convocatoria === 'segunda'
      ? Number(assembly.quorum_threshold_segunda) * 100
      : Number(assembly.quorum_threshold_primera) * 100

    const quorum = {
      pct: Math.round(pct * 100) / 100,
      threshold,
      reached: pct >= threshold,
      connected_count: activeAttendeeIds.length,
    }

    // ── 3. Agenda ───────────────────────────────────────────────────────────────
    const { data: motionsRaw } = await supabase
      .from('assembly_motions')
      .select('id, title, description, motion_type, status, majority_type, majority_pct, order_index, opened_at, closed_at, duration_seconds, closes_at, assembly_plancha_options(id, name, description, order_index)')
      .eq('assembly_id', payload.assemblyId)
      .order('order_index')

    // Auto-cierre de votaciones cuyo temporizador expiró
    const nowStr = new Date().toISOString()
    const expired = (motionsRaw ?? []).filter(m => m.status === 'open' && m.closes_at && m.closes_at < nowStr)
    if (expired.length > 0) {
      await supabase
        .from('assembly_motions')
        .update({ status: 'closed', closed_at: nowStr, closes_at: null })
        .in('id', expired.map(m => m.id))
      expired.forEach(m => { m.status = 'closed'; m.closed_at = nowStr; m.closes_at = null })
    }

    // ── 4. Votos del asistente ──────────────────────────────────────────────────
    // Unidad propia
    const ownUnitId = payload.unitId

    // Unidades representadas por este asistente
    const { data: myPoderes } = await supabase
      .from('assembly_poderes')
      .select('granting_unit_id, assembly_units(unit_number)')
      .eq('assembly_id', payload.assemblyId)
      .eq('receiving_attendee_id', payload.sub)

    const representedUnitIds2 = (myPoderes ?? []).map(p => p.granting_unit_id)
    const allMyUnitIds = [...(ownUnitId ? [ownUnitId] : []), ...representedUnitIds2]

    // Votos existentes de mis unidades
    const motionIds = (motionsRaw ?? []).map(m => m.id)
    let myVotesMap: Record<string, Record<string, string>> = {} // motionId → { unitId → vote_value }

    if (motionIds.length > 0 && allMyUnitIds.length > 0) {
      const { data: myVotes } = await supabase
        .from('assembly_votes')
        .select('motion_id, unit_id, vote_value')
        .in('motion_id', motionIds)
        .in('unit_id', allMyUnitIds)

      for (const vote of myVotes ?? []) {
        if (!myVotesMap[vote.motion_id]) myVotesMap[vote.motion_id] = {}
        myVotesMap[vote.motion_id][vote.unit_id] = vote.vote_value
      }
    }

    // Tallies de votos para todas las mociones
    let tallyMap: Record<string, Record<string, number>> = {} // motionId → { vote_value → coef sum }
    if (motionIds.length > 0) {
      const { data: allVotes } = await supabase
        .from('assembly_votes')
        .select('motion_id, vote_value, coefficient_weight')
        .in('motion_id', motionIds)

      for (const vote of allVotes ?? []) {
        if (!tallyMap[vote.motion_id]) tallyMap[vote.motion_id] = {}
        tallyMap[vote.motion_id][vote.vote_value] =
          (tallyMap[vote.motion_id][vote.vote_value] ?? 0) + Number(vote.coefficient_weight)
      }
    }

    const motions = (motionsRaw ?? []).map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      motion_type: m.motion_type,
      status: m.status,
      majority_type: m.majority_type,
      majority_pct: m.majority_pct,
      order_index: m.order_index,
      closes_at: m.closes_at ?? null,
      duration_seconds: m.duration_seconds ?? null,
      plancha_options: (m.assembly_plancha_options as Array<{ id: string; name: string; description: string | null; order_index: number }> | null) ?? [],
      tally: tallyMap[m.id] ?? {},
      my_vote: ownUnitId ? (myVotesMap[m.id]?.[ownUnitId] ?? null) : null,
      represented_votes: representedUnitIds2.map(uid => ({
        unit_id: uid,
        unit_number: (myPoderes ?? []).find(p => p.granting_unit_id === uid)
          ?.assembly_units
          ? ((myPoderes ?? []).find(p => p.granting_unit_id === uid)?.assembly_units as unknown as { unit_number: string })?.unit_number ?? uid
          : uid,
        vote: myVotesMap[m.id]?.[uid] ?? null,
      })),
    }))

    // ── 5. Documentos de la asamblea ───────────────────────────────────────────
    const { data: documents } = await supabase
      .from('assembly_documents')
      .select('id, title, url, order_index')
      .eq('assembly_id', payload.assemblyId)
      .order('order_index')

    // ── 6. Info del asistente ───────────────────────────────────────────────────
    let unitNumber: string | null = null
    if (ownUnitId) {
      const { data: unit } = await supabase
        .from('assembly_units')
        .select('unit_number')
        .eq('id', ownUnitId)
        .single()
      unitNumber = unit?.unit_number ?? null
    }

    const representedUnits = (myPoderes ?? []).map(p => ({
      unit_id: p.granting_unit_id,
      unit_number: (p.assembly_units as unknown as { unit_number: string } | null)?.unit_number ?? p.granting_unit_id,
    }))

    return NextResponse.json({
      assembly: {
        id: assembly.id,
        title: assembly.title,
        status: assembly.status,
        current_convocatoria: assembly.current_convocatoria,
        stream_url: assembly.stream_url ?? null,
        org_name: (assembly.organizations as unknown as { name: string } | null)?.name ?? '',
        org_color: (assembly.organizations as unknown as { primary_color: string } | null)?.primary_color ?? '#7c3aed',
      },
      quorum,
      motions,
      documents: documents ?? [],
      attendee: {
        id: payload.sub,
        name: payload.name,
        unit_number: unitNumber,
        role: payload.role,
        represented_units: representedUnits,
      },
    })
  } catch (err) {
    console.error('Error GET assembly state:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
