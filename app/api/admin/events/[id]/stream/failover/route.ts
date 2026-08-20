// app/api/admin/events/[id]/stream/failover/route.ts
//
// POST: intercambia el Live Input activo (cloudflare_stream_id) con el de respaldo
// (cloudflare_stream_id_backup). El respaldo ya viene recibiendo la misma señal en
// paralelo desde vMix (ver comentario de live-input/route.ts), asi que el swap es
// instantaneo — los asistentes empiezan a ver el respaldo en su proximo refresh de la
// URL firmada (hasta 6h de vigencia del token actual, o inmediato si recargan la pagina).
//
// Requiere que ambos uid existan (si no hay respaldo creado, no hay a donde hacer swap).

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminUser, createServiceRoleClient } from '@/lib/supabase/server'

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
      .select('cloudflare_stream_id, cloudflare_stream_id_backup')
      .eq('id', eventId)
      .single()

    if (fetchError || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    if (!event.cloudflare_stream_id_backup) {
      return NextResponse.json({ error: 'Este evento no tiene un Live Input de respaldo creado.' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('events')
      .update({
        cloudflare_stream_id: event.cloudflare_stream_id_backup,
        cloudflare_stream_id_backup: event.cloudflare_stream_id,
      })
      .eq('id', eventId)

    if (updateError) {
      return NextResponse.json({ error: 'No se pudo hacer el cambio.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      newActiveUid: event.cloudflare_stream_id_backup,
      previousUid: event.cloudflare_stream_id,
    })
  } catch (err) {
    console.error('Error en failover de Live Input:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
