// components/BrandedLayout.tsx — Aplica branding del evento (colores, logo)

import type { EventBranding, Organization } from '@/types'
import Image from 'next/image'

interface BrandedLayoutProps {
  children: React.ReactNode
  branding: EventBranding
  organization: Pick<Organization, 'name' | 'logo_url' | 'primary_color' | 'secondary_color'>
  eventTitle?: string
  fullHeight?: boolean
}

export default function BrandedLayout({
  children,
  branding,
  organization,
  eventTitle,
  fullHeight = false,
}: BrandedLayoutProps) {
  const primaryColor = branding.primary_color ?? organization.primary_color
  const secondaryColor = branding.secondary_color ?? organization.secondary_color
  const logoUrl = branding.logo_url ?? organization.logo_url
  const bgColor = branding.background_color ?? '#0A0A0F'

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
          {logoUrl ? (
            <Image
              src={logoUrl}
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

      {/* Footer minimal */}
      <footer className="text-center py-4 text-white/20 text-xs">
        Powered by Time Solutions
      </footer>
    </div>
  )
}
