// app/api/admin/events/[id]/polls/[pollId]/route.ts — Actualizar estado y eliminar poll

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

async function auth(eventId: string) {
  const supabaseAuth = await createServerSupabaseClient()
  return verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pollId: string }> }
) {
  try {
    const { id: eventId, pollId } = await params
    if (!await auth(eventId)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const body = await req.json() as { status?: string; show_results?: boolean }
    const allowed: Record<string, unknown> = {}

    if (body.status && ['draft', 'active', 'closed'].includes(body.status)) {
      allowed.status = body.status
    }
    if (typeof body.show_results === 'boolean') {
      allowed.show_results = body.show_results
    }

    if (Object.keys(allowed).length === 0)
      return NextResponse.json({ error: 'Sin campos válidos.' }, { status: 400 })

    // No permitir activar otro poll si ya hay uno activo en el evento
    if (allowed.status === 'active') {
      const supabase = createServiceRoleClient()
      const { data: activePoll } = await supabase
        .from('polls')
        .select('id')
        .eq('event_id', eventId)
        .eq('status', 'active')
        .neq('id', pollId)
        .maybeSingle()

      if (activePoll)
        return NextResponse.json({ error: 'Ya hay un poll activo en este evento. Ciérralo primero.' }, { status: 409 })
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('polls')
      .update(allowed)
      .eq('id', pollId)
      .eq('event_id', eventId)
      .select('*')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'No encontrado.' }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error PATCH poll:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pollId: string }> }
) {
  try {
    const { id: eventId, pollId } = await params
    if (!await auth(eventId)) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    const { data: poll } = await supabase
      .from('polls')
      .select('status')
      .eq('id', pollId)
      .eq('event_id', eventId)
      .single()

    if (poll?.status === 'active')
      return NextResponse.json({ error: 'No se puede eliminar un poll activo.' }, { status: 409 })

    const { error } = await supabase
      .from('polls')
      .delete()
      .eq('id', pollId)
      .eq('event_id', eventId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE poll:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
