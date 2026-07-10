// app/[org]/[event]/page.tsx — Login de asistentes al evento

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyAttendeeToken } from '@/lib/auth'
import BrandedLayout from '@/components/BrandedLayout'
import LoginForm from '@/components/LoginForm'
import type { Organization } from '@/types'

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

  // Si ya hay sesión válida y no es un kicked redirect, ir directo al watch.
  // Verificar también en BD que la sesión no fue invalidada (logout_at / kicked_at).
  if (!kicked) {
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

  // 1. Buscar organizacion por slug
  const { data: organization, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, primary_color, secondary_color')
    .eq('slug', org)
    .single()

  if (orgError || !organization) {
    notFound()
  }

  // 2. Buscar evento por org_id + slug
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, title, slug, status, branding, description')
    .eq('organization_id', organization.id)
    .eq('slug', event)
    .single()

  if (eventError || !eventData) {
    notFound()
  }

  const branding = (eventData.branding ?? {}) as {
    primary_color?: string
    secondary_color?: string
    logo_url?: string
    background_color?: string
  }

  // Estado del evento — mensajes correspondientes
  const isDraft = eventData.status === 'draft'
  const isEnded = eventData.status === 'ended'
  const isLive = eventData.status === 'live'

  const primaryColor =
    branding.primary_color ?? organization.primary_color

  return (
    <BrandedLayout
      branding={branding}
      organization={organization as Organization}
      eventTitle={eventData.title}
    >
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Titulo del evento */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white leading-tight">
              {eventData.title}
            </h1>
            {eventData.description && (
              <p className="text-white/50 text-sm">{eventData.description}</p>
            )}
          </div>

          {/* Indicador de estado */}
          {isLive && (
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
              <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">
                En vivo
              </span>
            </div>
          )}

          {/* Estados no-live: mostrar mensaje amable */}
          {isDraft && (
            <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-5 text-center space-y-2">
              <p className="text-yellow-300 font-medium">Evento no disponible aun</p>
              <p className="text-yellow-300/60 text-sm">
                El evento comenzara pronto. Vuelve mas tarde.
              </p>
            </div>
          )}

          {isEnded && (
            <div className="bg-white/5 border border-white/15 rounded-xl p-5 text-center space-y-2">
              <p className="text-white/80 font-medium">Este evento ha finalizado</p>
              <p className="text-white/40 text-sm">
                Gracias por tu participacion.
              </p>
            </div>
          )}

          {/* Mensaje de acceso revocado */}
          {kicked === '1' && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-5 text-center space-y-2">
              <p className="text-red-300 font-medium">Acceso revocado</p>
              <p className="text-red-300/60 text-sm">
                El organizador ha finalizado tu acceso al evento.
              </p>
            </div>
          )}

          {/* Formulario de login — solo si el evento esta live */}
          {isLive && !kicked && (
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <LoginForm
                org={org}
                event={event}
                primaryColor={primaryColor}
              />
            </div>
          )}
        </div>
      </div>
    </BrandedLayout>
  )
}
