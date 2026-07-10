// app/api/assembly/[org]/[assembly]/vote/route.ts — Emitir voto

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAssemblyTokenFromRequest } from '@/lib/assembly-auth'
import { logAudit } from '@/lib/assembly-audit'

const VALID_SIMPLE_VALUES = ['si', 'no', 'abstencion']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; assembly: string }> }
) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const payload = await getAssemblyTokenFromRequest(req)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    if (payload.org !== orgSlug || payload.assembly !== assemblySlug)
      return NextResponse.json({ error: 'Token inválido.' }, { status: 403 })

    const body = await req.json() as { motion_id: string; vote_value: string }

    if (!body.motion_id || !body.vote_value?.trim())
      return NextResponse.json({ error: 'Datos de voto incompletos.' }, { status: 400 })

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? null

    const supabase = createServiceRoleClient()

    // Verificar la moción está abierta
    const { data: motion } = await supabase
      .from('assembly_motions')
      .select('id, motion_type, status, assembly_id, closes_at')
      .eq('id', body.motion_id)
      .single()

    if (!motion) return NextResponse.json({ error: 'Punto de agenda no encontrado.' }, { status: 404 })
    if (motion.assembly_id !== payload.assemblyId) return NextResponse.json({ error: 'Punto no pertenece a esta asamblea.' }, { status: 403 })
    if (motion.status !== 'open') return NextResponse.json({ error: 'La votación no está abierta.' }, { status: 409 })
    if (motion.closes_at && motion.closes_at < new Date().toISOString())
      return NextResponse.json({ error: 'El tiempo de votación ya expiró.' }, { status: 409 })
    if (motion.motion_type === 'informativo')
      return NextResponse.json({ error: 'Los puntos informativos no tienen votación.' }, { status: 400 })

    // Validar vote_value según tipo
    if (motion.motion_type === 'voto_simple' && !VALID_SIMPLE_VALUES.includes(body.vote_value)) {
      return NextResponse.json({ error: 'Valor de voto inválido. Use: si, no, abstencion.' }, { status: 400 })
    }
    if (motion.motion_type === 'voto_plancha') {
      const { data: option } = await supabase
        .from('assembly_plancha_options')
        .select('id')
        .eq('id', body.vote_value)
        .eq('motion_id', body.motion_id)
        .single()
      if (!option) return NextResponse.json({ error: 'Plancha no válida.' }, { status: 400 })
    }

    // Unidad propia del asistente
    const ownUnitId = payload.unitId

    // Unidades que representa via poderes
    const { data: myPoderes } = await supabase
      .from('assembly_poderes')
      .select('granting_unit_id')
      .eq('assembly_id', payload.assemblyId)
      .eq('receiving_attendee_id', payload.sub)

    const representedUnitIds = (myPoderes ?? []).map(p => p.granting_unit_id)
    const allUnitIds = [...(ownUnitId ? [ownUnitId] : []), ...representedUnitIds]

    if (allUnitIds.length === 0)
      return NextResponse.json({ error: 'No tienes unidades registradas para votar.' }, { status: 403 })

    // Obtener coeficientes
    const { data: units } = await supabase
      .from('assembly_units')
      .select('id, coefficient')
      .in('id', allUnitIds)

    const coefMap = new Map((units ?? []).map(u => [u.id, Number(u.coefficient)]))

    // Insertar voto por cada unidad (upsert) con IP para trazabilidad legal
    const votes = allUnitIds.map(unitId => ({
      motion_id: body.motion_id,
      assembly_id: payload.assemblyId,
      unit_id: unitId,
      cast_by_attendee_id: payload.sub,
      vote_value: body.vote_value,
      coefficient_weight: coefMap.get(unitId) ?? 0,
      ip_address: ip,
    }))

    const { error } = await supabase
      .from('assembly_votes')
      .upsert(votes, { onConflict: 'motion_id,unit_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const totalCoef = allUnitIds.reduce((s, uid) => s + (coefMap.get(uid) ?? 0), 0)

    await logAudit(supabase, {
      assembly_id: payload.assemblyId,
      attendee_id: payload.sub,
      action: 'vote',
      details: {
        motion_id: body.motion_id,
        vote_value: body.vote_value,
        units_voted: allUnitIds.length,
        total_coefficient: Math.round(totalCoef * 1000000) / 1000000,
      },
      ip_address: ip,
    })

    return NextResponse.json({
      ok: true,
      units_voted: allUnitIds.length,
      total_coefficient: Math.round(totalCoef * 1000000) / 1000000,
    })
  } catch (err) {
    console.error('Error POST assembly vote:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
