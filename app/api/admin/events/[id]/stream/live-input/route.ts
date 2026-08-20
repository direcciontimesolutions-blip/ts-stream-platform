// app/api/admin/events/[id]/stream/live-input/route.ts
//
// POST: crea un Live Input de Cloudflare Stream (destino RTMPS para vMix) y lo asocia
// al evento (mismo campo cloudflare_stream_id que ya usa el flujo VOD — getSignedIframeUrl
// funciona igual para un uid de live input que para uno de video subido). Las credenciales
// RTMPS (url + stream key) se devuelven UNA sola vez en la respuesta — Cloudflare no las
// vuelve a mostrar despues, hay que copiarlas a vMix en el momento.
//
// GET: estado de conexion actual del Live Input (si vMix esta transmitiendo ahora mismo).

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminUser, createServiceRoleClient } from '@/lib/supabase/server'
import { createLiveInput, getLiveInputStatus } from '@/lib/cloudflare-stream'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdminUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('id, title')
      .eq('id', eventId)
      .single()

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const live = await createLiveInput({ name: event.title })

    const { error: updateError } = await supabase
      .from('events')
      .update({ cloudflare_stream_id: live.uid })
      .eq('id', eventId)

    if (updateError) {
      return NextResponse.json({ error: 'Live input creado pero no se pudo guardar en el evento.' }, { status: 500 })
    }

    return NextResponse.json({
      uid: live.uid,
      rtmpsUrl: live.rtmpsUrl,
      rtmpsStreamKey: live.rtmpsStreamKey,
    })
  } catch (err) {
    console.error('Error creando Live Input de Cloudflare Stream:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdminUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('cloudflare_stream_id')
      .eq('id', eventId)
      .single()

    if (fetchError || !event?.cloudflare_stream_id) {
      return NextResponse.json({ error: 'Este evento no tiene un Live Input creado todavia.' }, { status: 404 })
    }

    const status = await getLiveInputStatus(event.cloudflare_stream_id)
    return NextResponse.json(status)
  } catch (err) {
    console.error('Error consultando estado del Live Input:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
