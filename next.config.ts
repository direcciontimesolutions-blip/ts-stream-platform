import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
    ],
  },
  // Permite que YouTube embeds se carguen en iframes
  //
  // /embed/* queda afuera a proposito: es la pagina publica pensada para
  // vivir DENTRO del <iframe> de un proveedor externo (ver app/embed/[eventId]/
  // page.tsx) — con SAMEORIGIN puesto, ningun navegador la habria dejado
  // cargar fuera de live.timesolutions.com.co. El control de acceso real de
  // esa pagina es el token de lib/provider-embed.ts, no el origen del frame.
  async headers() {
    return [
      {
        source: '/((?!embed).*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ]
  },
}

export default nextConfig
