// app/api/embed/[eventId]/stream-url/route.ts — GET: URL firmada de reproduccion
// para el iframe que consume un PROVEEDOR EXTERNO (no un asistente de la
// plataforma) — sin cookie de sesion, gateado por un token propio del
// proveedor (ver lib/provider-embed.ts).
//
// Firma con la llave de embed (CLOUDFLARE_STREAM_EMBED_SIGNING_KEY_ID/PEM),
// separada de la de asistentes, y expone directo el `cloudflare_stream_id`
// ACTUAL del evento — el mismo campo que actualiza el failover admin
// (app/api/admin/events/[id]/stream/failover/route.ts). La pagina publica
// que consume este endpoint (app/embed/[eventId]/page.tsx) reconsulta cada
// 60s igual que EventPlayer.tsx, asi que un failover llega solo, sin que el
// proveedor tenga que hacer nada.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSignedIframeUrl, embedSigningKey } from '@/lib/cloudflare-stream'
import { getProviderEmbedToken, timingSafeTokenEquals } from '@/lib/provider-embed'

const MARGIN_SECONDS = 3 * 60 * 60 // 3h de margen despues de end_at, por si el evento se extiende
const DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60 // si el evento no tiene end_at, tope generoso de 24h

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params
    const token = req.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { data: event, error } = await supabase
      .from('events')
      .select('slug, streaming_tier, cloudflare_stream_id, status, start_at, end_at, organizations (slug)')
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const org = event.organizations as unknown as { slug: string } | { slug: string }[] | null
    const orgSlug = Array.isArray(org) ? org[0]?.slug : org?.slug
    if (!orgSlug) {
      return NextResponse.json({ error: 'Evento sin organizacion asociada.' }, { status: 500 })
    }

    const expectedToken = getProviderEmbedToken(orgSlug, event.slug)
    if (!expectedToken || !timingSafeTokenEquals(token, expectedToken)) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    if (event.streaming_tier !== 'cloudflare' || !event.cloudflare_stream_id) {
      return NextResponse.json({ error: 'Este evento no usa Cloudflare Stream.' }, { status: 400 })
    }

    const expiresInSeconds = event.end_at
      ? Math.max(
          60 * 30, // minimo 30 min, por si end_at ya paso pero el evento sigue vivo en la practica
          Math.floor((new Date(event.end_at).getTime() - Date.now()) / 1000) + MARGIN_SECONDS
        )
      : DEFAULT_EXPIRY_SECONDS

    const iframeUrl = await getSignedIframeUrl(event.cloudflare_stream_id, expiresInSeconds, embedSigningKey())

    return NextResponse.json({ iframeUrl, uid: event.cloudflare_stream_id })
  } catch (err) {
    console.error('Error generando URL de embed para proveedor externo:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
