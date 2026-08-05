// app/api/admin/stream/status/[videoId]/route.ts — GET: estado de procesamiento de un video subido
// Chequeo manual (boton "Verificar estado" en el admin) — sin webhook todavia, ver nota en
// lib/cloudflare-stream.ts sobre por que el manejo de webhooks queda para cuando haya token real.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getVideoStatus } from '@/lib/cloudflare-stream'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { videoId } = await params
    const status = await getVideoStatus(videoId)
    return NextResponse.json(status)
  } catch (err) {
    console.error('Error consultando estado de video Cloudflare Stream:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
