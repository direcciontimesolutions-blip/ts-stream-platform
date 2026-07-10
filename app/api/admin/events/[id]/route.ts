// app/api/admin/events/[id]/route.ts — GET detalle / PATCH status

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
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        organizations (id, name, slug, logo_url, primary_color, secondary_color)
      `)
      .eq('id', id)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    return NextResponse.json(event)
  } catch (err) {
    console.error('Error obteniendo evento:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json() as { status?: string; youtube_url?: string; branding?: Record<string, unknown> }

    const allowedFields: Record<string, unknown> = {}
    if (body.status && ['draft', 'live', 'ended'].includes(body.status)) {
      allowedFields.status = body.status
    }
    if (body.youtube_url !== undefined) allowedFields.youtube_url = body.youtube_url
    if (body.branding !== undefined) allowedFields.branding = body.branding

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: 'Ningun campo valido para actualizar.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: event, error } = await supabase
      .from('events')
      .update(allowedFields)
      .eq('id', id)
      .select('id, title, slug, status')
      .single()

    if (error || !event) {
      return NextResponse.json({ error: error?.message ?? 'Error al actualizar.' }, { status: 500 })
    }

    return NextResponse.json(event)
  } catch (err) {
    console.error('Error actualizando evento:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
