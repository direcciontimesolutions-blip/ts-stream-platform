// components/BrandedLayout.tsx — Aplica branding del evento (colores, logo)

import type { EventBranding, EventSponsor, Organization } from '@/types'
import Image from 'next/image'
import TimeSolutionsBrandStrip from './TimeSolutionsBrandStrip'

interface BrandedLayoutProps {
  children: React.ReactNode
  branding: EventBranding
  organization: Pick<Organization, 'name' | 'logo_url' | 'primary_color' | 'secondary_color'>
  eventTitle?: string
  fullHeight?: boolean
  sponsors?: EventSponsor[]
}

export default function BrandedLayout({
  children,
  branding,
  organization,
  eventTitle,
  fullHeight = false,
  sponsors = [],
}: BrandedLayoutProps) {
  const primaryColor = branding.primary_color ?? organization.primary_color
  const secondaryColor = branding.secondary_color ?? organization.secondary_color
  const logoUrl = branding.logo_url ?? organization.logo_url
  // Header de /watch va sobre fondo oscuro sin caja blanca detras (a diferencia de
  // la landing de registro, que si tiene bg-white detras del logo) — usar la variante
  // blanca si el evento la tiene configurada, con fallback al logo normal para no
  // romper organizaciones que aun no tengan variante oscura.
  const headerLogoUrl = branding.logo_url_dark ?? logoUrl
  const bgColor = branding.background_color ?? '#0A0A0F'
  const diamondSponsors = sponsors.filter((s) => s.tier === 'diamond')
  const regularSponsors = sponsors.filter((s) => s.tier !== 'diamond')

  return (
    <div
      className={fullHeight ? 'h-screen overflow-hidden flex flex-col' : 'min-h-screen flex flex-col'}
      style={{
        backgroundColor: bgColor,
        '--brand-primary': primaryColor,
        '--brand-secondary': secondaryColor,
      } as React.CSSProperties}
    >
      {/* Header con branding */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {headerLogoUrl ? (
            <Image
              src={headerLogoUrl}
              alt={`Logo ${organization.name}`}
              width={140}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          ) : (
            <span
              className="text-lg font-semibold tracking-tight"
              style={{ color: primaryColor }}
            >
              {organization.name}
            </span>
          )}
          {eventTitle && (
            <>
              <span className="text-white/30 text-sm">|</span>
              <span className="text-white/70 text-sm font-medium">{eventTitle}</span>
            </>
          )}
        </div>
        <div
          className="h-1 w-24 rounded-full"
          style={{ backgroundColor: primaryColor }}
          aria-hidden="true"
        />
      </header>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col min-h-0">{children}</main>

      {/* Patrocinadores — franja compacta de una sola fila, no debe competir con el reproductor.
          Mismo criterio visual que la landing (app/[org]/[event]/page.tsx): GSK/diamante destacado,
          el resto en fila con contenedor blanco detras de cada logo — reusa branding.sponsors,
          sin datos duplicados ni hardcodeados. Vive entre el player y el footer de Time Solutions
          para no restarle protagonismo al video (que ya tiene su propio bloque arriba). */}
      {sponsors.length > 0 && (
        <div className="border-t border-white/10 bg-black/20 shrink-0">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2">
            {diamondSponsors.map((sponsor) => (
              <div
                key={sponsor.name}
                className="bg-white rounded-md px-3 py-1.5 flex items-center justify-center shadow-sm"
                title={`${sponsor.name} — Patrocinador diamante`}
              >
                <Image
                  src={sponsor.logo_url}
                  alt={sponsor.name}
                  width={90}
                  height={32}
                  className="h-6 w-auto object-contain"
                />
              </div>
            ))}

            {diamondSponsors.length > 0 && regularSponsors.length > 0 && (
              <span className="hidden sm:block w-px h-5 bg-white/10" aria-hidden="true" />
            )}

            {regularSponsors.map((sponsor) => (
              <div
                key={sponsor.name}
                className="bg-white rounded px-2 py-1 flex items-center justify-center"
                title={sponsor.name}
              >
                <Image
                  src={sponsor.logo_url}
                  alt={sponsor.name}
                  width={64}
                  height={24}
                  className="h-3.5 w-auto object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer — mismo tratamiento de marca que la pagina de registro, version compacta */}
      <footer className="border-t border-white/10 shrink-0">
        <TimeSolutionsBrandStrip variant="footer" />
      </footer>
    </div>
  )
}
