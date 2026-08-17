// components/DbFallbackScreen.tsx — Pantalla de respaldo cuando falla la conexion a la base de datos
// No depende de ninguna consulta a Supabase (ni de branding del evento, que pudo no cargar):
// el unico dato que usa es el link de respaldo, leido de una variable de entorno.

interface DbFallbackScreenProps {
  fallbackUrl: string | null
}

export default function DbFallbackScreen({ fallbackUrl }: DbFallbackScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0C0C14] px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div
          className="w-12 h-12 mx-auto rounded-full bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-yellow-400 text-xl font-semibold">!</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-white text-lg font-semibold">
            Estamos resolviendo un problema técnico
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            No pudimos cargar la página de acceso en este momento. Intenta recargar en unos segundos.
          </p>
        </div>

        {fallbackUrl && (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-[#0C0C14] font-semibold text-sm px-6 py-3.5 w-full hover:bg-white/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Ver transmisión
          </a>
        )}

        <p className="text-white/25 text-xs">
          Si el problema persiste, escríbenos por{' '}
          <a
            href="https://wa.me/573505761435"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/50 transition-colors"
          >
            WhatsApp
          </a>
          .
        </p>
      </div>
    </div>
  )
}
