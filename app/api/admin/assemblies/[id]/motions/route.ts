// app/api/admin/assemblies/[id]/motions/route.ts — Listar y crear puntos del orden del día

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

    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('assembly_motions')
      .select('*, plancha_options:assembly_plancha_options(id, name, description, order_index)')
      .eq('assembly_id', id)
      .order('order_index')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-cierre de votaciones cuyo temporizador expiró
    const nowStr = new Date().toISOString()
    const expired = (data ?? []).filter(m => m.status === 'open' && m.closes_at && m.closes_at < nowStr)
    if (expired.length > 0) {
      await supabase
        .from('assembly_motions')
        .update({ status: 'closed', closed_at: nowStr, closes_at: null })
        .in('id', expired.map(m => m.id))
      expired.forEach(m => { m.status = 'closed'; m.closed_at = nowStr; m.closes_at = null })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET motions:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const body = await req.json() as {
      title?: string
      description?: string
      motion_type?: string
      majority_type?: string
      majority_pct?: number
      plancha_options?: Array<{ name: string; description?: string }>
    }

    if (!body.title) return NextResponse.json({ error: 'Título requerido.' }, { status: 400 })

    const motionType = ['informativo', 'voto_simple', 'voto_plancha', 'voto_adhoc'].includes(body.motion_type ?? '')
      ? body.motion_type : 'informativo'
    const majorityType = ['simple', 'calificada'].includes(body.majority_type ?? '') ? body.majority_type : 'simple'

    const supabase = createServiceRoleClient()

    // Obtener el siguiente order_index
    const { count } = await supabase
      .from('assembly_motions')
      .select('id', { count: 'exact', head: true })
      .eq('assembly_id', assemblyId)

    const { data: motion, error } = await supabase
      .from('assembly_motions')
      .insert({
        assembly_id: assemblyId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        motion_type: motionType,
        majority_type: majorityType,
        majority_pct: body.majority_pct ?? 50.00,
        order_index: (count ?? 0),
      })
      .select('*')
      .single()

    if (error || !motion) return NextResponse.json({ error: error?.message ?? 'Error.' }, { status: 500 })

    // Insertar opciones de plancha si aplica
    if (motionType === 'voto_plancha' && body.plancha_options?.length) {
      const options = body.plancha_options.map((opt, idx) => ({
        motion_id: motion.id,
        name: opt.name.trim(),
        description: opt.description?.trim() || null,
        order_index: idx,
      }))
      await supabase.from('assembly_plancha_options').insert(options)
    }

    return NextResponse.json(motion, { status: 201 })
  } catch (err) {
    console.error('Error POST motion:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
