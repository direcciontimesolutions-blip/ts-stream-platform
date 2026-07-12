// app/api/admin/events/[id]/polls/[pollId]/responses/route.ts — Tally de respuestas (admin)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAdminOrModerator } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pollId: string }> }
) {
  try {
    const { id: eventId, pollId } = await params
    const supabaseAuth = await createServerSupabaseClient()
    const allowed = await verifyAdminOrModerator(eventId, () => supabaseAuth.auth.getUser())
    if (!allowed) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    const [{ data: poll }, { data: responses }] = await Promise.all([
      supabase.from('polls').select('*').eq('id', pollId).eq('event_id', eventId).single(),
      supabase.from('poll_responses').select('response').eq('poll_id', pollId),
    ])

    if (!poll) return NextResponse.json({ error: 'Poll no encontrado.' }, { status: 404 })

    const total = responses?.length ?? 0

    if (poll.type === 'multiple_choice') {
      const options = poll.options as { id: string; text: string }[]
      const counts: Record<string, number> = {}
      options.forEach((o) => { counts[o.id] = 0 })
      responses?.forEach((r) => {
        const optId = (r.response as { option_id?: string }).option_id
        if (optId && counts[optId] !== undefined) counts[optId]++
      })
      return NextResponse.json({
        type: 'multiple_choice',
        total,
        options: options.map((o) => ({
          id: o.id,
          text: o.text,
          count: counts[o.id] ?? 0,
          pct: total > 0 ? Math.round((counts[o.id] ?? 0) / total * 100) : 0,
        })),
      })
    }

    if (poll.type === 'rating') {
      const ratings = responses?.map((r) => (r.response as { rating?: number }).rating ?? 0) ?? []
      const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
      const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      ratings.forEach((v) => { if (v >= 1 && v <= 5) dist[v]++ })
      return NextResponse.json({ type: 'rating', total, avg: Math.round(avg * 10) / 10, distribution: dist })
    }

    // open
    const texts = responses?.map((r) => (r.response as { text?: string }).text ?? '').filter(Boolean) ?? []
    return NextResponse.json({ type: 'open', total, responses: texts })
  } catch (err) {
    console.error('Error GET poll responses:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
