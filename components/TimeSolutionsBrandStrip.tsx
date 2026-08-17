// components/TimeSolutionsBrandStrip.tsx — Bloque de marca Time Solutions (logo+link+WhatsApp)
// Compartido entre la pagina de registro (franja lateral, variant="strip") y el
// reproductor /watch (footer compacto, variant="footer") para no mantener dos copias
// del mismo diseno. Ver commit 4fba45e para el origen del diseno "strip".

import Image from 'next/image'

const WHATSAPP_ICON_PATH =
  'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91S17.5 2 12.04 2Zm5.8 14.11c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.13.11-1.82-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.58-.36.77-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.75 1.24 1.61 2.01 1.11 1 2.04 1.31 2.33 1.46.29.15.46.13.63-.08.17-.21.71-.83.9-1.12.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.29.14.48.21.55.33.07.13.07.75-.17 1.43Z'

interface TimeSolutionsBrandStripProps {
  variant?: 'strip' | 'footer'
}

export default function TimeSolutionsBrandStrip({ variant = 'strip' }: TimeSolutionsBrandStripProps) {
  if (variant === 'footer') {
    // Version compacta y horizontal — para el footer angosto del reproductor (/watch),
    // que no debe distraer del contenido del video.
    return (
      <div className="flex items-center justify-center gap-3 sm:gap-4 px-4 py-3 flex-wrap">
        <a
          href="https://timesolutions.com.co"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 rounded-lg px-1 py-1 -m-1 transition-colors hover:bg-white/[0.04]"
        >
          <Image
            src="/ts-logo.png"
            alt="Time Solutions"
            width={18}
            height={22}
            className="h-[22px] w-auto object-contain shrink-0"
          />
          <span className="text-white/35 text-xs group-hover:text-white/60 transition-colors">
            Powered by <span className="font-semibold">Time Solutions</span>
          </span>
        </a>

        <a
          href="https://wa.me/573505761435"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/35 hover:text-white/65 hover:border-white/20 hover:bg-white/[0.06] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
            <path d={WHATSAPP_ICON_PATH} />
          </svg>
          <span>¿Quieres esto para tu evento?</span>
        </a>
      </div>
    )
  }

  // "strip" — bloque original de la pagina de registro (franja lateral superior)
  return (
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

      {/* CTA WhatsApp — trafico de marketing de la plataforma, va al chatbot que califica leads (no al numero humano) */}
      <a
        href="https://wa.me/573505761435"
        target="_blank"
        rel="noopener noreferrer"
        className="self-start inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/45 hover:text-white/75 hover:border-white/20 hover:bg-white/[0.07] transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
          <path d={WHATSAPP_ICON_PATH} />
        </svg>
        <span>¿Quieres esto para tu evento? Escríbenos</span>
      </a>
    </div>
  )
}
