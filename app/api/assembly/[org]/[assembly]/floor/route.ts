// app/api/assembly/[org]/[assembly]/floor/route.ts — Solicitar / retirar / consultar turno de palabra

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAssemblyTokenFromRequest } from '@/lib/assembly-auth'

type Params = { params: Promise<{ org: string; assembly: string }> }

// GET — estado actual del request propio
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const payload = await getAssemblyTokenFromRequest(req)
    if (!payload || payload.org !== orgSlug || payload.assembly !== assemblySlug)
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('assembly_floor_requests')
      .select('id, status, agora_token, agora_channel, agora_uid, requested_at, granted_at')
      .eq('assembly_id', payload.assemblyId)
      .eq('attendee_id', payload.sub)
      .in('status', ['pending', 'granted'])
      .maybeSingle()

    return NextResponse.json({ request: data ?? null })
  } catch (err) {
    console.error('Error GET floor:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — solicitar la palabra
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const payload = await getAssemblyTokenFromRequest(req)
    if (!payload || payload.org !== orgSlug || payload.assembly !== assemblySlug)
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // Verificar asamblea activa
    const { data: asm } = await supabase
      .from('assemblies')
      .select('status')
      .eq('id', payload.assemblyId)
      .single()

    if (!asm || asm.status !== 'active')
      return NextResponse.json({ error: 'La asamblea no está activa.' }, { status: 409 })

    // Verificar si ya tiene un request activo
    const { data: existing } = await supabase
      .from('assembly_floor_requests')
      .select('id, status')
      .eq('assembly_id', payload.assemblyId)
      .eq('attendee_id', payload.sub)
      .in('status', ['pending', 'granted'])
      .maybeSingle()

    if (existing)
      return NextResponse.json({ error: 'Ya tienes una solicitud activa.', request: existing }, { status: 409 })

    // Obtener número de unidad del asistente
    const { data: attendee } = await supabase
      .from('assembly_attendees')
      .select('full_name, unit_id, assembly_units(unit_number)')
      .eq('id', payload.sub)
      .single()

    const units = attendee?.assembly_units as unknown as { unit_number: string }[] | { unit_number: string } | null
    const unitNumber = Array.isArray(units) ? (units[0]?.unit_number ?? null) : (units?.unit_number ?? null)

    const { data: request, error } = await supabase
      .from('assembly_floor_requests')
      .insert({
        assembly_id: payload.assemblyId,
        attendee_id: payload.sub,
        attendee_name: payload.name,
        unit_number: unitNumber,
        status: 'pending',
      })
      .select('id, status, requested_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, request })
  } catch (err) {
    console.error('Error POST floor:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// DELETE — retirar solicitud / colgar
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const payload = await getAssemblyTokenFromRequest(req)
    if (!payload || payload.org !== orgSlug || payload.assembly !== assemblySlug)
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from('assembly_floor_requests')
      .update({ status: 'ended', revoked_at: new Date().toISOString() })
      .eq('assembly_id', payload.assemblyId)
      .eq('attendee_id', payload.sub)
      .in('status', ['pending', 'granted'])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE floor:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
