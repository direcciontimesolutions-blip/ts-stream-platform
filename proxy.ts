// proxy.ts — Subdomain routing + protección de rutas (Next.js 16)

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { createServerClient } from '@supabase/ssr'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production-64chars-minimum'
)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') ?? ''

  // ── Subdomain routing ──────────────────────────────────────────────────────
  // asambleas.timesolutions.com.co/* → /assemblies/*
  if (hostname.startsWith('asambleas.')) {
    const url = request.nextUrl.clone()
    const originalPath = url.pathname

    // Las rutas /api/* pasan sin reescribir (son las mismas API routes de Next.js)
    if (originalPath.startsWith('/api/')) return NextResponse.next()

    // Rutas de la asamblea — watch requiere ts_assembly_token
    if (originalPath.match(/^\/[^/]+\/[^/]+\/watch/)) {
      const token = request.cookies.get('ts_assembly_token')?.value
      if (!token) {
        const segments = originalPath.split('/').filter(Boolean)
        const org = segments[0]
        const assembly = segments[1]
        url.pathname = `/assemblies/${org}/${assembly}`
        return NextResponse.redirect(url)
      }
      try {
        await jwtVerify(token, JWT_SECRET)
      } catch {
        const segments = originalPath.split('/').filter(Boolean)
        const org = segments[0]
        const assembly = segments[1]
        url.pathname = `/assemblies/${org}/${assembly}`
        const res = NextResponse.redirect(url)
        res.cookies.delete('ts_assembly_token')
        return res
      }
    }

    // Reescribir al módulo de asambleas
    url.pathname = `/assemblies${originalPath === '/' ? '' : originalPath}`
    return NextResponse.rewrite(url)
  }

  // ── Rutas admin — verificar sesión Supabase ────────────────────────────────
  if (
    pathname.startsWith('/admin/dashboard') ||
    pathname.startsWith('/admin/events') ||
    pathname.startsWith('/admin/organizations') ||
    pathname.startsWith('/admin/assemblies')
  ) {
    const response = NextResponse.next()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const loginUrl = new URL('/admin', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return response
  }

  // ── Watch portal streaming — verificar ts_stream_token ────────────────────
  const watchPattern = /^\/[^/]+\/[^/]+\/watch/
  if (watchPattern.test(pathname)) {
    const token = request.cookies.get('ts_stream_token')?.value
    if (!token) {
      const segments = pathname.split('/').filter(Boolean)
      return NextResponse.redirect(new URL(`/${segments[0]}/${segments[1]}`, request.url))
    }
    try {
      await jwtVerify(token, JWT_SECRET)
      return NextResponse.next()
    } catch {
      const segments = pathname.split('/').filter(Boolean)
      const res = NextResponse.redirect(new URL(`/${segments[0]}/${segments[1]}`, request.url))
      res.cookies.delete('ts_stream_token')
      return res
    }
  }

  // ── Panel moderador streaming — verificar ts_moderator_token ──────────────
  if (pathname.startsWith('/moderator/') && !pathname.startsWith('/moderator/accept')) {
    const token = request.cookies.get('ts_moderator_token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/moderator/accept', request.url))
    }
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const eventIdInPath = pathname.split('/').filter(Boolean)[1]
      if (payload.eventId !== eventIdInPath) {
        const res = NextResponse.redirect(new URL('/moderator/accept', request.url))
        res.cookies.delete('ts_moderator_token')
        return res
      }
      return NextResponse.next()
    } catch {
      const res = NextResponse.redirect(new URL('/moderator/accept', request.url))
      res.cookies.delete('ts_moderator_token')
      return res
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
