// app/api/admin/assemblies/[id]/motions/[motionId]/route.ts — Controlar estado de un punto

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/assembly-audit'
import { calculateQuorumPct } from '@/lib/assembly-quorum'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; motionId: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId, motionId } = await params
    const body = await req.json() as { status?: string; title?: string; order_index?: number; duration_seconds?: number }

    const allowed: Record<string, unknown> = {}
    const supabase = createServiceRoleClient()

    if (body.status && ['pending', 'open', 'closed'].includes(body.status)) {
      allowed.status = body.status
      if (body.status === 'open') {
        const openedAt = new Date().toISOString()
        allowed.opened_at = openedAt
        if (body.duration_seconds && body.duration_seconds > 0) {
          allowed.duration_seconds = body.duration_seconds
          allowed.closes_at = new Date(Date.now() + body.duration_seconds * 1000).toISOString()
        } else {
          allowed.duration_seconds = null
          allowed.closes_at = null
        }
        // Snapshot de quórum al abrir — obligatorio para el acta legal
        allowed.quorum_at_open = await calculateQuorumPct(supabase, assemblyId)
      }
      if (body.status === 'closed') {
        allowed.closed_at = new Date().toISOString()
        allowed.closes_at = null
        // Snapshot de quórum al cerrar — refleja quién estaba presente cuando se contaron los votos
        allowed.quorum_at_close = await calculateQuorumPct(supabase, assemblyId)
      }
      if (body.status === 'pending') {
        allowed.opened_at = null
        allowed.closed_at = null
        allowed.duration_seconds = null
        allowed.closes_at = null
      }
    }
    if (body.title) allowed.title = body.title.trim()
    if (body.order_index !== undefined) allowed.order_index = body.order_index

    if (Object.keys(allowed).length === 0)
      return NextResponse.json({ error: 'Sin campos válidos.' }, { status: 400 })

    const { data, error } = await supabase
      .from('assembly_motions')
      .update(allowed)
      .eq('id', motionId)
      .select('*')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Error.' }, { status: 500 })

    if (body.status === 'open' || body.status === 'closed') {
      await logAudit(supabase, {
        assembly_id: assemblyId,
        action: body.status === 'open' ? 'motion_open' : 'motion_close',
        details: {
          motion_id: motionId,
          title: data.title,
          quorum_pct: body.status === 'open' ? allowed.quorum_at_open : allowed.quorum_at_close,
        },
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Error PATCH motion:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; motionId: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { motionId } = await params
    const supabase = createServiceRoleClient()

    // No permitir borrar una moción con votación abierta
    const { data: motion } = await supabase
      .from('assembly_motions')
      .select('status')
      .eq('id', motionId)
      .single()

    if (motion?.status === 'open')
      return NextResponse.json({ error: 'No se puede eliminar una moción con votación abierta.' }, { status: 409 })

    const { error } = await supabase
      .from('assembly_motions')
      .delete()
      .eq('id', motionId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE motion:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
