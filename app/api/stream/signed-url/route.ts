// app/api/stream/signed-url/route.ts — GET: URL firmada de reproduccion para el asistente autenticado
// El eventId sale del JWT de sesion (cookie), nunca de un parametro que el cliente pueda falsear.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyAttendeeToken } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSignedIframeUrl } from '@/lib/cloudflare-stream'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ts_stream_token')?.value
    if (!token) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const payload = await verifyAttendeeToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { data: event, error } = await supabase
      .from('events')
      .select('streaming_tier, cloudflare_stream_id, status')
      .eq('id', payload.eventId)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    if (event.status !== 'live') {
      return NextResponse.json({ error: 'El evento no esta en vivo.' }, { status: 409 })
    }

    if (event.streaming_tier !== 'cloudflare' || !event.cloudflare_stream_id) {
      return NextResponse.json({ error: 'Este evento no usa Cloudflare Stream.' }, { status: 400 })
    }

    const iframeUrl = await getSignedIframeUrl(event.cloudflare_stream_id)
    return NextResponse.json({ iframeUrl })
  } catch (err) {
    console.error('Error generando URL firmada de Cloudflare Stream:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    // Cloudflare Stream aun no esta configurado (faltan env vars) — error explicito, no silencioso
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
