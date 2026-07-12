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

    return NextResponse.json({ poll, already_responded: !!existing, my_response: existing?.response ?? null })
  } catch (err) {
    console.error('Error GET active poll:', err)
    return NextResponse.json({ poll: null })
  }
}
