// app/[org]/[event]/page.tsx — Portal de acceso al evento (v2 — split-screen template)

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAttendeeToken } from '@/lib/auth'
import LoginForm from '@/components/LoginForm'
import OpenRegisterForm from '@/components/OpenRegisterForm'

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
    .select('id, title, slug, status, branding, description')
    .eq('organization_id', organization.id)
    .eq('slug', event)
    .single()

  if (eventError || !eventData) {
    notFound()
  }

  // 3. Redirigir si ya tiene sesión válida y evento está live
  if (!kicked && eventData.status === 'live') {
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
  }

  const isDraft = eventData.status === 'draft'
  const isEnded = eventData.status === 'ended'
  const isLive = eventData.status === 'live'
  const isOpenRegistration = branding.open_registration === true

  const primaryColor = branding.primary_color ?? organization.primary_color
  const bgColor = branding.background_color ?? '#0C0C14'
  const logoUrl = branding.logo_url ?? organization.logo_url

  return (
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
          <div className="flex items-center gap-3">
            {/* Logo T8ME con mix-blend-mode screen — el fondo negro desaparece */}
            <div className="shrink-0">
              <Image
                src="/ts-logo.png"
                alt="Time Solutions"
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
                style={{ mixBlendMode: 'screen' } as React.CSSProperties}
                priority
              />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-white/50 text-xs font-semibold tracking-wide">
                Plataforma by Time Solutions
              </span>
              <a
                href="https://timesolutions.com.co"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 text-xs hover:text-white/55 transition-colors truncate"
              >
                timesolutions.com.co
              </a>
              <a
                href="https://wa.me/573008999352"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 text-xs hover:text-white/55 transition-colors"
              >
                WhatsApp +57 300 899 9352
              </a>
            </div>
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
  )
}
