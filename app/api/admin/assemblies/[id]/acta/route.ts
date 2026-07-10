// app/api/admin/assemblies/[id]/acta/route.ts — Genera el Acta PDF (Ley 675/2001)

import { NextRequest, NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import React from 'react'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ActaDocument, ActaData, MotionRecord, VoteResult } from '@/lib/acta-pdf'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // ── Auth admin (Supabase session) ──────────────────────────────────────────
    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // ── 1. Asamblea + organización ──────────────────────────────────────────────
    const { data: assembly, error: asmErr } = await supabase
      .from('assemblies')
      .select(`
        id, title, slug, status, assembly_type, acta_number, acta_location,
        current_convocatoria, scheduled_at, started_at, ended_at,
        total_coefficient, quorum_threshold_primera, quorum_threshold_segunda,
        organizations(id, name, slug)
      `)
      .eq('id', id)
      .single()

    if (asmErr || !assembly) {
      return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })
    }

    const org = assembly.organizations as unknown as { id: string; name: string; slug: string }

    // ── 2. Unidades ────────────────────────────────────────────────────────────
    const { data: units } = await supabase
      .from('assembly_units')
      .select('id, unit_number, owner_name, coefficient')
      .eq('assembly_id', id)
      .order('unit_number')

    const unitMap = new Map((units ?? []).map(u => [u.id, u]))

    // ── 3. Asistentes + sesiones ────────────────────────────────────────────────
    const { data: attendees } = await supabase
      .from('assembly_attendees')
      .select('id, full_name, unit_id, role')
      .eq('assembly_id', id)

    const { data: sessions } = await supabase
      .from('assembly_sessions')
      .select('attendee_id, is_presencial, login_at, logout_at')
      .eq('assembly_id', id)

    // Todos los que iniciaron sesión estuvieron presentes (login_at es NOT NULL)
    const presentAttendeeIds = new Set(
      (sessions ?? []).map(s => s.attendee_id)
    )

    // Mapa de sesión para saber si fue presencial
    const sessionMap = new Map(
      (sessions ?? []).map(s => [s.attendee_id, s])
    )

    // ── 4. Poderes ─────────────────────────────────────────────────────────────
    const { data: poderes } = await supabase
      .from('assembly_poderes')
      .select('granting_unit_id, receiving_attendee_id, representative_name')
      .eq('assembly_id', id)

    // Set de unidades representadas por poder
    const representedUnitIds = new Set((poderes ?? []).map(p => p.granting_unit_id))

    // Mapa: granting_unit_id → representative name
    const proxyNameMap = new Map(
      (poderes ?? []).map(p => [
        p.granting_unit_id,
        p.representative_name ?? 'Representante'
      ])
    )

    // ── 5. Construir lista de asistentes para el acta ──────────────────────────
    // Solo incluimos asistentes que tuvieron sesión activa
    const attendeeRecords: import('@/lib/acta-pdf').AttendeeRecord[] = (attendees ?? [])
      .filter(a => {
        // Incluir si tuvo sesión O si su unidad tiene un poder activo
        if (presentAttendeeIds.has(a.id)) return true
        if (a.unit_id && representedUnitIds.has(a.unit_id)) return false // representado = no asistió directo
        return false
      })
      .map(a => {
        const unit = a.unit_id ? unitMap.get(a.unit_id) : null
        const sess = sessionMap.get(a.id)
        return {
          full_name: a.full_name,
          unit_number: unit?.unit_number ?? null,
          coefficient: unit ? Number(unit.coefficient) : null,
          is_presencial: sess?.is_presencial ?? false,
          is_proxy: false,
        }
      })

    // Añadir representados por poder (que no asistieron directo)
    for (const poder of poderes ?? []) {
      const unit = unitMap.get(poder.granting_unit_id)
      if (!unit) continue
      // Si el propietario de esta unidad no asistió directo
      const ownerAttendee = (attendees ?? []).find(a => a.unit_id === poder.granting_unit_id)
      if (ownerAttendee && presentAttendeeIds.has(ownerAttendee.id)) continue // asistió directo
      attendeeRecords.push({
        full_name: unit.owner_name ?? `Unidad ${unit.unit_number}`,
        unit_number: unit.unit_number,
        coefficient: Number(unit.coefficient),
        is_presencial: false,
        is_proxy: true,
        proxy_name: poder.representative_name ?? undefined,
      })
    }

    // ── 6. Registro de poderes para el acta ──────────────────────────────────
    const poderRecords = (poderes ?? []).map(p => {
      const unit = unitMap.get(p.granting_unit_id)
      return {
        granting_unit: unit?.unit_number ?? p.granting_unit_id,
        owner_name: unit?.owner_name ?? '—',
        coefficient: unit ? Number(unit.coefficient) : 0,
        representative_name: p.representative_name ?? '—',
      }
    })

    // ── 7. Quórum alcanzado ────────────────────────────────────────────────────
    // Calcular coeficiente representado (presentes directos + poderes cuyo representante asistió)
    const directUnitIds = new Set(
      (attendees ?? [])
        .filter(a => presentAttendeeIds.has(a.id) && a.unit_id)
        .map(a => a.unit_id as string)
    )

    // Añadir unidades representadas por poder donde el representante asistió
    for (const poder of poderes ?? []) {
      if (!poder.receiving_attendee_id) continue
      if (presentAttendeeIds.has(poder.receiving_attendee_id)) {
        directUnitIds.add(poder.granting_unit_id)
      }
    }

    const presentCoefficient = Array.from(directUnitIds).reduce((sum, uid) => {
      const u = unitMap.get(uid)
      return sum + (u ? Number(u.coefficient) : 0)
    }, 0)

    const totalCoef = Number(assembly.total_coefficient)
    const presentPct = totalCoef > 0 ? (presentCoefficient / totalCoef) * 100 : 0
    const threshold = assembly.current_convocatoria === 'segunda'
      ? Number(assembly.quorum_threshold_segunda) * 100
      : Number(assembly.quorum_threshold_primera) * 100
    const quorumReached = presentPct >= threshold

    // ── 8. Mociones con resultados de votación ─────────────────────────────────
    const { data: motionsRaw } = await supabase
      .from('assembly_motions')
      .select(`
        id, title, description, motion_type, status, majority_type, majority_pct,
        order_index, opened_at, closed_at, secretary_notes,
        assembly_plancha_options(id, name, order_index)
      `)
      .eq('assembly_id', id)
      .order('order_index')

    const motionIds = (motionsRaw ?? []).map(m => m.id)

    // Votos con coeficiente
    const { data: allVotes } = motionIds.length > 0
      ? await supabase
          .from('assembly_votes')
          .select('motion_id, vote_value, coefficient_weight')
          .in('motion_id', motionIds)
      : { data: [] }

    // Agrupar votos por moción
    const tallyMap = new Map<string, Map<string, number>>()
    for (const vote of allVotes ?? []) {
      if (!tallyMap.has(vote.motion_id)) tallyMap.set(vote.motion_id, new Map())
      const m = tallyMap.get(vote.motion_id)!
      m.set(vote.vote_value, (m.get(vote.vote_value) ?? 0) + Number(vote.coefficient_weight))
    }

    const motionRecords: MotionRecord[] = (motionsRaw ?? []).map(m => {
      const tally = tallyMap.get(m.id) ?? new Map()
      const planchaOptions = (m.assembly_plancha_options as Array<{ id: string; name: string; order_index: number }> | null) ?? []

      const totalVotedCoef = Array.from(tally.values()).reduce((s, v) => s + v, 0)
      const majorityRequired = m.majority_type === 'calificada'
        ? (m.majority_pct / 100) * totalCoef
        : totalVotedCoef / 2

      // Resultados
      let voteResults: VoteResult[] = []

      if (m.motion_type === 'voto_plancha') {
        voteResults = planchaOptions.map(opt => {
          const coef = tally.get(opt.id) ?? 0
          return {
            vote_value: opt.id,
            label: opt.name,
            coefficient: coef,
            pct: totalVotedCoef > 0 ? (coef / totalVotedCoef) * 100 : 0,
          }
        })
      } else if (m.motion_type === 'voto_adhoc') {
        // Votos ad-hoc: claves son los valores únicos
        const uniqueValues = Array.from(tally.keys())
        voteResults = uniqueValues.map(v => {
          const coef = tally.get(v) ?? 0
          return {
            vote_value: v,
            label: v,
            coefficient: coef,
            pct: totalVotedCoef > 0 ? (coef / totalVotedCoef) * 100 : 0,
          }
        })
      } else {
        // voto_simple: si/no/abstencion
        for (const key of ['si', 'no', 'abstencion']) {
          const coef = tally.get(key) ?? 0
          voteResults.push({
            vote_value: key,
            label: key === 'si' ? 'A favor' : key === 'no' ? 'En contra' : 'Abstención',
            coefficient: coef,
            pct: totalVotedCoef > 0 ? (coef / totalVotedCoef) * 100 : 0,
          })
        }
      }

      // Determinar si fue aprobado
      let approved: boolean | null = null
      if (m.motion_type !== 'informativo' && m.status === 'closed') {
        if (m.motion_type === 'voto_plancha') {
          // Plancha: ganador es el de mayor coeficiente
          approved = totalVotedCoef > 0
        } else if (m.motion_type === 'voto_adhoc') {
          approved = totalVotedCoef > 0
        } else {
          const siCoef = tally.get('si') ?? 0
          if (m.majority_type === 'calificada') {
            approved = siCoef >= (m.majority_pct / 100) * totalCoef
          } else {
            // mayoría simple: más de la mitad de los votos
            const noCoef = tally.get('no') ?? 0
            approved = siCoef > noCoef
          }
        }
      }

      return {
        order_index: m.order_index,
        title: m.title,
        description: m.description,
        motion_type: m.motion_type as MotionRecord['motion_type'],
        status: m.status as MotionRecord['status'],
        majority_type: m.majority_type as MotionRecord['majority_type'],
        majority_pct: m.majority_pct,
        opened_at: m.opened_at,
        closed_at: m.closed_at,
        secretary_notes: m.secretary_notes,
        vote_results: voteResults,
        total_voted_coefficient: totalVotedCoef,
        total_voted_pct: totalCoef > 0 ? (totalVotedCoef / totalCoef) * 100 : 0,
        approved,
        plancha_options: planchaOptions,
      }
    })

    // ── 9. Presidente y Secretario ─────────────────────────────────────────────
    const presidentAttendee = (attendees ?? []).find(a => a.role === 'president')
    const secretaryAttendee = (attendees ?? []).find(a => a.role === 'secretary')

    // ── 10. Construir ActaData ─────────────────────────────────────────────────
    const acta: ActaData = {
      acta_number: assembly.acta_number ?? '001',
      assembly_type: (assembly.assembly_type ?? 'ordinaria') as 'ordinaria' | 'extraordinaria',
      assembly_title: assembly.title,
      org_name: org.name,
      location: assembly.acta_location ?? 'modalidad virtual',
      scheduled_at: assembly.scheduled_at,
      started_at: assembly.started_at,
      ended_at: assembly.ended_at,
      current_convocatoria: (assembly.current_convocatoria ?? 'primera') as 'primera' | 'segunda',
      quorum_threshold_primera: Number(assembly.quorum_threshold_primera),
      quorum_threshold_segunda: Number(assembly.quorum_threshold_segunda),
      total_coefficient: totalCoef,
      present_coefficient: presentCoefficient,
      quorum_reached: quorumReached,
      president_name: presidentAttendee?.full_name ?? null,
      secretary_name: secretaryAttendee?.full_name ?? null,
      attendees: attendeeRecords,
      poderes: poderRecords,
      motions: motionRecords,
      generated_at: new Date().toISOString(),
    }

    // ── 11. Renderizar PDF ─────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ActaDocument, { data: acta }) as React.ReactElement<any>
    const stream = await renderToStream(element)

    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    const pdfBuffer = Buffer.concat(chunks)
    const filename = `acta-${assembly.acta_number ?? '001'}-${assembly.slug}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    })

  } catch (err) {
    console.error('Error generando acta PDF:', err)
    return NextResponse.json({ error: 'Error generando el acta.' }, { status: 500 })
  }
}
