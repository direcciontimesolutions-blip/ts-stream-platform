// app/[org]/[event]/page.tsx — Portal de acceso al evento (v2 — split-screen template)

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAttendeeToken } from '@/lib/auth'
import { getEventLiveState } from '@/lib/event-live-state'
import LoginForm from '@/components/LoginForm'
import OpenRegisterForm from '@/components/OpenRegisterForm'
import EventCarousel from '@/components/EventCarousel'

interface PageProps {
  params: Promise<{ org: string; event: string }>
  searchParams: Promise<{ kicked?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { org, event } = await params
  const supabase = createServiceRoleClient()

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('slug', org)
    .single()

  const { data: eventData } = await supabase
    .from('events')
    .select('title')
    .eq('slug', event)
    .single()

  return {
    title: eventData?.title
      ? `${eventData.title} — ${organization?.name ?? 'Evento'}`
      : 'Acceso al evento',
  }
}

export default async function EventLoginPage({ params, searchParams }: PageProps) {
  const { org, event } = await params
  const { kicked } = await searchParams
  const supabase = createServiceRoleClient()

  // 1. Organización
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, primary_color, secondary_color')
    .eq('slug', org)
    .single()

  if (orgError || !organization) {
    notFound()
  }

  // 2. Evento
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, title, slug, status, start_at, end_at, branding, description')
    .eq('organization_id', organization.id)
    .eq('slug', event)
    .single()

  if (eventError || !eventData) {
    notFound()
  }

  const { isDraft, isEnded, isLive } = getEventLiveState(
    eventData.status,
    eventData.start_at,
    eventData.end_at
  )

  // 3. Redirigir si ya tiene sesión válida y evento está live
  if (!kicked && isLive) {
    const cookieStore = await cookies()
    const token = cookieStore.get('ts_stream_token')?.value
    if (token) {
      const payload = await verifyAttendeeToken(token)
      if (payload) {
        const { data: sessionCheck } = await supabase
          .from('sessions')
          .select('kicked_at, logout_at')
          .eq('id', payload.sessionId)
          .maybeSingle()
        if (sessionCheck && !sessionCheck.kicked_at && !sessionCheck.logout_at) {
          redirect(`/${org}/${event}/watch`)
        }
      }
    }
  }

  const branding = (eventData.branding ?? {}) as {
    primary_color?: string
    secondary_color?: string
    logo_url?: string
    background_color?: string
    open_registration?: boolean
    carousel_images?: string[]
  }

  const isOpenRegistration = branding.open_registration === true

  const primaryColor = branding.primary_color ?? organization.primary_color
  const bgColor = branding.background_color ?? '#0C0C14'
  const logoUrl = branding.logo_url ?? organization.logo_url
  const carouselImages = branding.carousel_images ?? []

  return (
    <div style={{ backgroundColor: bgColor }}>
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ backgroundColor: bgColor }}
    >
      {/* ── Panel izquierdo: identidad del evento ── */}
      <div
        className="relative lg:w-[58%] flex flex-col items-center justify-center px-10 py-20 overflow-hidden"
        style={{
          background: `radial-gradient(ellipse 80% 70% at 35% 55%, ${primaryColor}18 0%, transparent 100%), ${bgColor}`,
        }}
      >
        {/* Barra accent superior */}
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ backgroundColor: primaryColor }}
        />

        {/* Círculo decorativo inferior */}
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-[0.04] pointer-events-none"
          style={{ backgroundColor: primaryColor }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-col items-center max-w-lg text-center">
          {/* Logo del cliente */}
          {logoUrl ? (
            <div className="mb-10 bg-white rounded-2xl px-8 py-5 inline-flex items-center justify-center shadow-lg">
              <Image
                src={logoUrl}
                alt={`Logo ${organization.name}`}
                width={220}
                height={88}
                className="h-[88px] w-auto object-contain"
                priority
              />
            </div>
          ) : (
            <div className="mb-10 flex flex-col items-center gap-3">
              <span
                className="text-2xl font-bold tracking-tight"
                style={{ color: primaryColor }}
              >
                {organization.name}
              </span>
              <div className="w-8 h-[2px]" style={{ backgroundColor: primaryColor }} />
            </div>
          )}

          {/* Nombre del evento */}
          <h1 className="text-3xl lg:text-[2.6rem] font-bold text-white leading-tight">
            {eventData.title}
          </h1>

          {eventData.description && (
            <p className="mt-4 text-white/45 text-sm leading-relaxed max-w-xs">
              {eventData.description}
            </p>
          )}

          {/* Badge En vivo */}
          {isLive && (
            <div className="mt-7 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
              <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">
                En vivo
              </span>
            </div>
          )}
        </div>

        {/* Footer Powered by */}
        <div className="absolute bottom-7 left-0 right-0 flex justify-center">
          <span className="text-white/20 text-xs tracking-wide">
            Powered by Time Solutions
          </span>
        </div>
      </div>

      {/* ── Panel derecho: Time Solutions + formulario ── */}
      <div
        className="lg:w-[42%] flex flex-col relative"
        style={{ borderLeft: `1px solid ${primaryColor}22` }}
      >
        {/* Franja Time Solutions — publicidad de la plataforma */}
        <div className="px-8 pt-7 pb-5 border-b border-white/[0.06]">
          <div className="flex flex-col gap-3">
            {/* Isotipo + marca — un solo elemento clickeable hacia el sitio de Time Solutions */}
            <a
              href="https://timesolutions.com.co"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 -m-1 p-1 rounded-lg transition-colors hover:bg-white/[0.03]"
            >
              {/* Isotipo Time Solutions (El Instante Partido) — PNG con alpha real, se adapta a cualquier color de fondo */}
              <div className="shrink-0">
                <Image
                  src="/ts-logo.png"
                  alt="Time Solutions"
                  width={46}
                  height={56}
                  className="h-14 w-auto object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-white/50 text-xs font-semibold tracking-wide group-hover:text-white/70 transition-colors">
                  Plataforma by Time Solutions
                </span>
                <span className="text-white/30 text-xs group-hover:text-white/55 transition-colors truncate">
                  timesolutions.com.co
                </span>
              </div>
            </a>

            {/* CTA WhatsApp — tráfico de marketing de la plataforma, va al chatbot que califica leads (no al número humano) */}
            <a
              href="https://wa.me/573505761435"
              target="_blank"
              rel="noopener noreferrer"
              className="self-start inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/45 hover:text-white/75 hover:border-white/20 hover:bg-white/[0.07] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91S17.5 2 12.04 2Zm5.8 14.11c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2.01 1.11 1 2.04 1.31 2.33 1.46.29.15.46.13.63-.08.17-.21.71-.83.9-1.12.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.29.14.48.21.55.33.07.13.07.75-.17 1.43Z" />
              </svg>
              <span>¿Quieres esto para tu evento? Escríbenos</span>
            </a>
          </div>
        </div>

        {/* Área del formulario — centrada en el espacio restante */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
          <div className="w-full max-w-sm space-y-5">
            {/* Mensajes de estado */}
            {isDraft && (
              <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-5 text-center space-y-1">
                <p className="text-yellow-300 font-medium text-sm">Evento no disponible aún</p>
                <p className="text-yellow-300/60 text-xs">El evento comenzará pronto. Vuelve más tarde.</p>
              </div>
            )}

            {isEnded && (
              <div className="bg-white/5 border border-white/15 rounded-xl p-5 text-center space-y-1">
                <p className="text-white/80 font-medium text-sm">Este evento ha finalizado</p>
                <p className="text-white/40 text-xs">Gracias por tu participación.</p>
              </div>
            )}

            {kicked === '1' && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-5 text-center space-y-1">
                <p className="text-red-300 font-medium text-sm">Acceso revocado</p>
                <p className="text-red-300/60 text-xs">El organizador ha finalizado tu acceso al evento.</p>
              </div>
            )}

            {/* Tarjeta del formulario */}
            {isLive && !kicked && (
              <div
                className="rounded-2xl p-7"
                style={{
                  background: 'rgba(255,255,255,0.035)',
                  border: `1px solid ${primaryColor}30`,
                  borderTop: `2px solid ${primaryColor}`,
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.2em] mb-5"
                  style={{ color: `${primaryColor}CC` }}
                >
                  {isOpenRegistration ? 'Registro' : 'Acceso al evento'}
                </p>
                {isOpenRegistration ? (
                  <OpenRegisterForm
                    org={org}
                    event={event}
                    primaryColor={primaryColor}
                  />
                ) : (
                  <LoginForm
                    org={org}
                    event={event}
                    primaryColor={primaryColor}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* ── Sección de carrusel informativo (agenda, patrocinadores, cómo participar) ── */}
      {carouselImages.length > 0 && (
        <EventCarousel
          images={carouselImages}
          primaryColor={primaryColor}
          eventTitle={eventData.title}
        />
      )}
    </div>
  )
}
