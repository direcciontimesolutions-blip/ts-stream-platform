// app/api/events/[eventId]/polls/[pollId]/respond/route.ts — Respuesta del asistente

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAttendeeToken } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; pollId: string }> }
) {
  try {
    const { eventId, pollId } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('ts_stream_token')?.value
    if (!token) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const payload = await verifyAttendeeToken(token)
    if (!payload || payload.eventId !== eventId)
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const supabase = createServiceRoleClient()

    // Verificar que el poll existe, pertenece al evento y está activo
    const { data: poll } = await supabase
      .from('polls')
      .select('id, type, options, status, show_results')
      .eq('id', pollId)
      .eq('event_id', eventId)
      .single()

    if (!poll || poll.status !== 'active')
      return NextResponse.json({ error: 'Poll no disponible.' }, { status: 404 })

    const body = await req.json() as { option_id?: string; text?: string; rating?: number }

    // Validar según tipo
    let response: Record<string, unknown>
    if (poll.type === 'multiple_choice') {
      if (!body.option_id) return NextResponse.json({ error: 'Opción requerida.' }, { status: 400 })
      const options = poll.options as { id: string }[]
      if (!options.find((o) => o.id === body.option_id))
        return NextResponse.json({ error: 'Opción inválida.' }, { status: 400 })
      response = { option_id: body.option_id }
    } else if (poll.type === 'rating') {
      const rating = Number(body.rating)
      if (!rating || rating < 1 || rating > 5)
        return NextResponse.json({ error: 'Calificación debe ser 1-5.' }, { status: 400 })
      response = { rating }
    } else {
      const text = body.text?.trim()
      if (!text || text.length > 300)
        return NextResponse.json({ error: 'Respuesta requerida (máx 300 caracteres).' }, { status: 400 })
      response = { text }
    }

    // Upsert — si ya respondió, actualiza (solo mientras el poll esté activo)
    const { error } = await supabase
      .from('poll_responses')
      .upsert({ poll_id: pollId, attendee_id: payload.attendeeId, response }, { onConflict: 'poll_id,attendee_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Si show_results, devolver tally para que el asistente vea los resultados
    if (poll.show_results) {
      const { data: responses } = await supabase
        .from('poll_responses')
        .select('response')
        .eq('poll_id', pollId)

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
          ok: true,
          tally: {
            type: 'multiple_choice',
            total,
            options: options.map((o) => ({
              id: o.id,
              text: o.text,
              count: counts[o.id] ?? 0,
              pct: total > 0 ? Math.round((counts[o.id] ?? 0) / total * 100) : 0,
            })),
          },
        })
      }

      if (poll.type === 'rating') {
        const ratings = responses?.map((r) => (r.response as { rating?: number }).rating ?? 0) ?? []
        const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
        return NextResponse.json({ ok: true, tally: { type: 'rating', total, avg: Math.round(avg * 10) / 10 } })
      }

      return NextResponse.json({ ok: true, tally: { type: 'open', total } })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error POST poll respond:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
