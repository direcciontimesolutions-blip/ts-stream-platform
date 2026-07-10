// app/api/admin/assemblies/[id]/route.ts — GET detalle / PATCH estado

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
      .from('assemblies')
      .select('*, organizations(id, name, slug, logo_url, primary_color, secondary_color)')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error GET assembly:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id } = await params
    const body = await req.json() as {
      status?: string
      current_convocatoria?: string
      title?: string
      description?: string
      scheduled_at?: string
      quorum_threshold_primera?: number
      quorum_threshold_segunda?: number
      total_coefficient?: number
      assembly_type?: string
      acta_number?: string
      acta_location?: string
      stream_url?: string | null
    }

    const allowed: Record<string, unknown> = {}
    if (body.status && ['draft', 'active', 'ended'].includes(body.status))
      allowed.status = body.status
    if (body.current_convocatoria && ['primera', 'segunda'].includes(body.current_convocatoria))
      allowed.current_convocatoria = body.current_convocatoria
    if (body.title) allowed.title = body.title.trim()
    if (body.description !== undefined) allowed.description = body.description || null
    if (body.scheduled_at) allowed.scheduled_at = body.scheduled_at
    if (body.quorum_threshold_primera !== undefined) allowed.quorum_threshold_primera = body.quorum_threshold_primera
    if (body.quorum_threshold_segunda !== undefined) allowed.quorum_threshold_segunda = body.quorum_threshold_segunda
    if (body.total_coefficient !== undefined) allowed.total_coefficient = body.total_coefficient
    if (body.assembly_type && ['ordinaria', 'extraordinaria'].includes(body.assembly_type))
      allowed.assembly_type = body.assembly_type
    if (body.acta_number !== undefined) allowed.acta_number = body.acta_number || null
    if (body.acta_location !== undefined) allowed.acta_location = body.acta_location || null
    if (body.stream_url !== undefined) allowed.stream_url = body.stream_url || null

    if (Object.keys(allowed).length === 0)
      return NextResponse.json({ error: 'Sin campos válidos.' }, { status: 400 })

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('assemblies')
      .update(allowed)
      .eq('id', id)
      .select('id, title, slug, status, current_convocatoria')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Error.' }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error PATCH assembly:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
