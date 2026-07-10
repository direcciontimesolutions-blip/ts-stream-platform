// app/api/admin/assemblies/route.ts — Listar y crear asambleas

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('assemblies')
      .select('*, organizations(id, name, slug, primary_color)')
      .order('scheduled_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET assemblies:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const body = await req.json() as {
      organization_id?: string
      title?: string
      slug?: string
      description?: string
      scheduled_at?: string
      quorum_threshold_primera?: number
      quorum_threshold_segunda?: number
      total_coefficient?: number
    }

    if (!body.organization_id || !body.title || !body.slug || !body.scheduled_at) {
      return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
    }

    const slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('assemblies')
      .insert({
        organization_id: body.organization_id,
        title: body.title.trim(),
        slug,
        description: body.description?.trim() || null,
        scheduled_at: body.scheduled_at,
        quorum_threshold_primera: body.quorum_threshold_primera ?? 0.500100,
        quorum_threshold_segunda: body.quorum_threshold_segunda ?? 0.000000,
        total_coefficient: body.total_coefficient ?? 1.000000,
      })
      .select('id, title, slug, status, scheduled_at, organization_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error POST assembly:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
