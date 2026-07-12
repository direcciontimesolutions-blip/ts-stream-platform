// app/api/events/[eventId]/polls/active/route.ts — Poll activo para el asistente (carga inicial)

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAttendeeToken } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('ts_stream_token')?.value
    if (!token) return NextResponse.json({ poll: null })

    const payload = await verifyAttendeeToken(token)
    if (!payload || payload.eventId !== eventId) return NextResponse.json({ poll: null })

    const supabase = createServiceRoleClient()

    const { data: poll } = await supabase
      .from('polls')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .maybeSingle()

    if (!poll) return NextResponse.json({ poll: null })

    // Verificar si el asistente ya respondió
    const { data: existing } = await supabase
      .from('poll_responses')
      .select('response')
      .eq('poll_id', poll.id)
      .eq('attendee_id', payload.attendeeId)
      .maybeSingle()

    // Si show_results está activo, calcular y devolver el tally para todos los asistentes
    if (poll.show_results) {
      const { data: responses } = await supabase
        .from('poll_responses')
        .select('response')
        .eq('poll_id', poll.id)

      const total = responses?.length ?? 0
      let tally = null

      if (poll.type === 'multiple_choice') {
        const options = (poll.options ?? []) as { id: string; text: string }[]
        const counts: Record<string, number> = {}
        options.forEach((o) => { counts[o.id] = 0 })
        responses?.forEach((r) => {
          const optId = (r.response as { option_id?: string }).option_id
          if (optId && counts[optId] !== undefined) counts[optId]++
        })
        tally = {
          type: 'multiple_choice', total,
          options: options.map((o) => ({
            id: o.id, text: o.text,
            count: counts[o.id] ?? 0,
            pct: total > 0 ? Math.round((counts[o.id] ?? 0) / total * 100) : 0,
          })),
        }
      } else if (poll.type === 'rating') {
        const ratings = responses?.map((r) => (r.response as { rating?: number }).rating ?? 0) ?? []
        const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
        tally = { type: 'rating', total, avg: Math.round(avg * 10) / 10 }
      } else {
        tally = { type: 'open', total }
      }

      return NextResponse.json({ poll, already_responded: !!existing, my_response: existing?.response ?? null, tally })
    }

    return NextResponse.json({ poll, already_responded: !!existing, my_response: existing?.response ?? null })
  } catch (err) {
    console.error('Error GET active poll:', err)
    return NextResponse.json({ poll: null })
  }
}
