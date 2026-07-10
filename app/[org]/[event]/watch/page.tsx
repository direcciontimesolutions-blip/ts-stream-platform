// app/[org]/[event]/watch/page.tsx — Portal del evento (player)
// Esta ruta esta protegida por el middleware — si llega aqui el JWT es valido

import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAttendeeToken, ATTENDEE_COOKIE } from '@/lib/auth'
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

  if (sessionRow?.kicked_at) {
    cookieStore.delete(ATTENDEE_COOKIE.name)
    redirect(`/${org}/${event}?kicked=1`)
  }

  // Si otra sesión tomó el control (logout_at seteado por un login posterior), redirigir a login
  if (sessionRow?.logout_at) {
    cookieStore.delete(ATTENDEE_COOKIE.name)
    redirect(`/${org}/${event}`)
  }

  // Si el heartbeat lleva más de 5 min sin actualizar, la sesión se considera abandonada.
  // Forzar re-login para evitar que un browser reabierto reactive una sesión
  // que otro dispositivo pudo haber tomado mientras estaba cerrado.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const lastActivity = sessionRow?.last_ping_at ?? sessionRow?.login_at
  if (!lastActivity || lastActivity < fiveMinutesAgo) {
    cookieStore.delete(ATTENDEE_COOKIE.name)
    redirect(`/${org}/${event}`)
  }

  // Obtener el evento con branding y org
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, primary_color, secondary_color')
    .eq('slug', org)
    .single()

  if (orgError || !organization) {
    notFound()
  }

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, title, slug, status, streaming_tier, youtube_url, branding, chat_enabled')
    .eq('organization_id', organization.id)
    .eq('slug', event)
    .single()

  if (eventError || !eventData) {
    notFound()
  }

  if (eventData.status !== 'live') {
    redirect(`/${org}/${event}`)
  }

  const branding = (eventData.branding ?? {}) as {
    primary_color?: string
    secondary_color?: string
    logo_url?: string
    background_color?: string
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
        streamingTier={eventData.streaming_tier}
        attendeeName={jwtPayload.name}
        chatEnabled={eventData.chat_enabled ?? false}
        org={org}
        event={event}
      />
    </BrandedLayout>
  )
}
