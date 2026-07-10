// app/api/admin/events/route.ts — GET lista de eventos / POST crear evento

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
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    const { data: events, error } = await supabase
      .from('events')
      .select(`
        id, title, slug, status, streaming_tier, start_at, end_at, created_at,
        organizations (id, name, slug, primary_color)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(events)
  } catch (err) {
    console.error('Error listando eventos:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyAdmin()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const body = await req.json() as {
      organization_id?: string
      title?: string
      slug?: string
      description?: string | null
      start_at?: string
      end_at?: string
      streaming_tier?: 'youtube' | 'cloudflare'
      youtube_url?: string | null
      branding?: Record<string, string | null>
    }

    const {
      organization_id,
      title,
      slug,
      description,
      start_at,
      end_at,
      streaming_tier = 'youtube',
      youtube_url,
      branding = {},
    } = body

    if (!organization_id || !title || !slug || !start_at || !end_at) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: organization_id, title, slug, start_at, end_at.' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    const { data: event, error } = await supabase
      .from('events')
      .insert({
        organization_id,
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        description: description ?? null,
        start_at,
        end_at,
        streaming_tier,
        youtube_url: youtube_url ?? null,
        branding,
        status: 'draft',
      })
      .select('id, title, slug, status')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe un evento con ese slug para esta organizacion.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(event, { status: 201 })
  } catch (err) {
    console.error('Error creando evento:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
