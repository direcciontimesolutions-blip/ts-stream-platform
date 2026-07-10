// app/api/admin/assemblies/[id]/floor/route.ts — Moderador: ver manos y conceder/revocar palabra

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import { generateRtcToken, uuidToAgoraUid, APP_ID } from '@/lib/agora-token'

type Params = { params: Promise<{ id: string }> }

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET — lista de requests activos (pending + granted)
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('assembly_floor_requests')
      .select('id, attendee_id, attendee_name, unit_number, status, requested_at, granted_at')
      .eq('assembly_id', assemblyId)
      .in('status', ['pending', 'granted'])
      .order('requested_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET admin floor:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// PATCH ?requestId=... — conceder o revocar
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('requestId')
    if (!requestId) return NextResponse.json({ error: 'requestId requerido.' }, { status: 400 })

    const body = await req.json() as { status: 'granted' | 'revoked' }
    if (!['granted', 'revoked'].includes(body.status))
      return NextResponse.json({ error: 'status debe ser granted o revoked.' }, { status: 400 })

    const supabase = createServiceRoleClient()

    // Verificar que el request pertenece a esta asamblea
    const { data: floorReq } = await supabase
      .from('assembly_floor_requests')
      .select('id, attendee_id, status')
      .eq('id', requestId)
      .eq('assembly_id', assemblyId)
      .single()

    if (!floorReq) return NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 })

    if (body.status === 'revoked') {
      const { error } = await supabase
        .from('assembly_floor_requests')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', requestId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, status: 'revoked' })
    }

    // status === 'granted': generar token Agora
    const channelName = `asm-${assemblyId}`
    const agoraUid = uuidToAgoraUid(floorReq.attendee_id)
    const agoraToken = generateRtcToken(channelName, agoraUid, 3600)

    const { error } = await supabase
      .from('assembly_floor_requests')
      .update({
        status: 'granted',
        agora_token: agoraToken,
        agora_channel: channelName,
        agora_uid: agoraUid,
        granted_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'granted', agora_channel: channelName, agora_uid: agoraUid })
  } catch (err) {
    console.error('Error PATCH admin floor:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// DELETE ?requestId=... — eliminar request (limpiar historial)
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const { searchParams } = new URL(req.url)
    const requestId = searchParams.get('requestId')
    if (!requestId) return NextResponse.json({ error: 'requestId requerido.' }, { status: 400 })

    const supabase = createServiceRoleClient()
    await supabase
      .from('assembly_floor_requests')
      .delete()
      .eq('id', requestId)
      .eq('assembly_id', assemblyId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE admin floor:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
