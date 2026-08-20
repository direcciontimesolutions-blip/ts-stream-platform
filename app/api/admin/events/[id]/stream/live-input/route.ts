// app/api/admin/events/[id]/stream/live-input/route.ts
//
// POST: crea un Live Input de Cloudflare Stream (destino RTMPS para vMix). Body opcional
// { role: 'primary' | 'backup' } — 'primary' (default) escribe cloudflare_stream_id (el
// que ven los asistentes, getSignedIframeUrl lo usa igual que un uid de VOD); 'backup'
// escribe cloudflare_stream_id_backup — un segundo Live Input que vMix alimenta EN
// PARALELO desde el arranque (vMix soporta 5 salidas de stream simultaneas), para que ante
// una falla del principal el cambio sea instantaneo (swap de uid activo, sin esperar
// reconexion) y sin salir de Cloudflare — nunca se sacrifica el control de acceso de las
// URLs firmadas, a diferencia de un respaldo en YouTube. Las credenciales RTMPS se
// devuelven UNA sola vez, Cloudflare no las vuelve a mostrar despues.
//
// GET: estado de conexion actual. ?role=backup consulta el Live Input de respaldo.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminUser, createServiceRoleClient } from '@/lib/supabase/server'
import { createLiveInput, getLiveInputStatus } from '@/lib/cloudflare-stream'

type Role = 'primary' | 'backup'

function columnFor(role: Role) {
  return role === 'backup' ? 'cloudflare_stream_id_backup' : 'cloudflare_stream_id'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdminUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as { role?: Role }
    const role: Role = body.role === 'backup' ? 'backup' : 'primary'
    const column = columnFor(role)

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

    const live = await createLiveInput({ name: `${event.title}${role === 'backup' ? ' (respaldo)' : ''}` })

    const { error: updateError } = await supabase
      .from('events')
      .update({ [column]: live.uid })
      .eq('id', eventId)

    if (updateError) {
      return NextResponse.json({ error: 'Live input creado pero no se pudo guardar en el evento.' }, { status: 500 })
    }

    return NextResponse.json({
      uid: live.uid,
      rtmpsUrl: live.rtmpsUrl,
      rtmpsStreamKey: live.rtmpsStreamKey,
      role,
    })
  } catch (err) {
    console.error('Error creando Live Input de Cloudflare Stream:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdminUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const role: Role = req.nextUrl.searchParams.get('role') === 'backup' ? 'backup' : 'primary'
    const column = columnFor(role)

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()
    const { data: event, error: fetchError } = await supabase
      .from('events')
      .select('cloudflare_stream_id, cloudflare_stream_id_backup')
      .eq('id', eventId)
      .single()

    const uid = event ? (event as Record<string, string | null>)[column] : null

    if (fetchError || !uid) {
      return NextResponse.json({ error: `Este evento no tiene un Live Input de ${role === 'backup' ? 'respaldo' : 'principal'} creado todavia.` }, { status: 404 })
    }

    const status = await getLiveInputStatus(uid)
    return NextResponse.json({ ...status, role })
  } catch (err) {
    console.error('Error consultando estado del Live Input:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
