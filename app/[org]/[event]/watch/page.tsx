// app/[org]/[event]/watch/page.tsx — Portal del evento (player)
// Esta ruta esta protegida por el middleware — si llega aqui el JWT es valido

import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAttendeeToken } from '@/lib/auth'
import { getEventLiveState } from '@/lib/event-live-state'
import BrandedLayout from '@/components/BrandedLayout'
import EventPlayer from '@/components/EventPlayer'
import type { Organization } from '@/types'

interface PageProps {
  params: Promise<{ org: string; event: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { event } = await params
  return {
    title: `Viendo evento — ${event}`,
    robots: { index: false, follow: false },
  }
}

export default async function WatchPage({ params }: PageProps) {
  const { org, event } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get('ts_stream_token')?.value

  if (!token) {
    redirect(`/${org}/${event}`)
  }

  const jwtPayload = await verifyAttendeeToken(token)
  if (!jwtPayload) {
    redirect(`/${org}/${event}`)
  }

  const supabase = createServiceRoleClient()

  // Verificar que la sesion no fue revocada (kick) — corrección de seguridad obligatoria
  // El JWT sigue siendo criptograficamente valido aunque el admin haya kickeado al asistente,
  // por eso verificamos kicked_at en la BD en cada render del servidor.
  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('kicked_at, logout_at, last_ping_at, login_at')
    .eq('id', jwtPayload.sessionId)
    .single()

  // Sesión kickeada o cerrada — redirigir sin tocar cookies server-side
  // (Next.js RSC no permite mutar cookies; el borrado lo maneja el API route de logout)
  if (sessionRow?.kicked_at) {
    redirect(`/${org}/${event}?kicked=1`)
  }

  if (sessionRow?.logout_at) {
    redirect(`/${org}/${event}`)
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const lastActivity = sessionRow?.last_ping_at ?? sessionRow?.login_at
  if (!lastActivity || lastActivity < fiveMinutesAgo) {
    redirect(`/${org}/${event}`)
  }

  // Obtener el evento con branding y org
  // Mismo criterio de Plan B que en la pagina de acceso (app/[org]/[event]/page.tsx):
  // si la BD no responde (no si el evento realmente no existe), en vez de tronar con
  // notFound() redirigimos a la pagina de acceso, que ya sabe mostrar el respaldo con
  // el link directo de transmision — asi no duplicamos esa pantalla aqui.
  let organization: {
    id: string
    name: string
    slug: string
    logo_url: string | null
    primary_color: string
    secondary_color: string
  } | null = null
  let dbUnavailable = false

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, logo_url, primary_color, secondary_color')
      .eq('slug', org)
      .single()

    if (error && error.code !== 'PGRST116') {
      dbUnavailable = true
    } else {
      organization = data
    }
  } catch {
    dbUnavailable = true
  }

  if (dbUnavailable) {
    redirect(`/${org}/${event}`)
  }

  if (!organization) {
    notFound()
  }

  let eventData: {
    id: string
    title: string
    slug: string
    status: string
    start_at: string
    end_at: string
    streaming_tier: 'youtube' | 'cloudflare' | 'teams'
    youtube_url: string | null
    cloudflare_stream_id: string | null
    branding: Record<string, unknown> | null
    chat_enabled: boolean
  } | null = null

  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, slug, status, start_at, end_at, streaming_tier, youtube_url, cloudflare_stream_id, branding, chat_enabled')
      .eq('organization_id', organization.id)
      .eq('slug', event)
      .single()

    if (error && error.code !== 'PGRST116') {
      dbUnavailable = true
    } else {
      eventData = data
    }
  } catch {
    dbUnavailable = true
  }

  if (dbUnavailable) {
    redirect(`/${org}/${event}`)
  }

  if (!eventData) {
    notFound()
  }

  const { isLive } = getEventLiveState(eventData.status, eventData.start_at, eventData.end_at)
  if (!isLive) {
    redirect(`/${org}/${event}`)
  }

  const branding = (eventData.branding ?? {}) as {
    primary_color?: string
    secondary_color?: string
    logo_url?: string
    background_color?: string
    agenda_url?: string
  }

  return (
    <BrandedLayout
      branding={branding}
      organization={organization as Organization}
      eventTitle={eventData.title}
      fullHeight
    >
      <EventPlayer
        sessionId={jwtPayload.sessionId}
        eventId={eventData.id}
        youtubeUrl={eventData.youtube_url}
        cloudflareStreamId={eventData.cloudflare_stream_id}
        streamingTier={eventData.streaming_tier}
        attendeeName={jwtPayload.name}
        chatEnabled={eventData.chat_enabled ?? false}
        agendaUrl={branding.agenda_url ?? null}
        org={org}
        event={event}
      />
    </BrandedLayout>
  )
}
