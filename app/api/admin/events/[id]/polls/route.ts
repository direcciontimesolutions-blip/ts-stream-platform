// app/api/admin/events/[id]/polls/route.ts — Listar y crear polls

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

async function auth(eventId: string) {
  const supabaseAuth = await createServerSupabaseClient()
  const allowed = await verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
  return allowed
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    if (!await auth(eventId)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('polls')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET polls:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params
    if (!await auth(eventId)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const body = await req.json() as {
      question?: string
      type?: string
      options?: { id: string; text: string }[]
      show_results?: boolean
    }

    const question = body.question?.trim()
    if (!question) return NextResponse.json({ error: 'La pregunta es requerida.' }, { status: 400 })

    const validTypes = ['multiple_choice', 'open', 'rating']
    if (!body.type || !validTypes.includes(body.type))
      return NextResponse.json({ error: 'Tipo de poll inválido.' }, { status: 400 })

    if (body.type === 'multiple_choice') {
      const opts = body.options ?? []
      if (opts.length < 2 || opts.length > 5)
        return NextResponse.json({ error: 'Se requieren entre 2 y 5 opciones.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('polls')
      .insert({
        event_id: eventId,
        question,
        type: body.type,
        options: body.type === 'multiple_choice' ? (body.options ?? []) : [],
        show_results: body.show_results ?? true,
        status: 'draft',
      })
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error POST poll:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
