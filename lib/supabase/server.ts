// lib/supabase/server.ts — Supabase client para Server Components y API Routes

import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { resolveUserWithRetry } from './auth-retry'

// Client con sesion del usuario (usa anon key + cookies)
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component: set no esta disponible, se ignora
          }
        },
      },
    }
  )
}

// Verifica el usuario admin autenticado para rutas API de /admin/*. Reemplaza el patron
// "verifyAdmin()" que estaba duplicado (copy-paste) en cada ruta admin — un solo fallo
// transitorio de auth.getUser() (red/timeout/5xx) ya no se trata como sesion invalida,
// ver lib/supabase/auth-retry.ts para el detalle del fix.
export async function verifyAdminUser() {
  const supabase = await createServerSupabaseClient()
  return resolveUserWithRetry(async () => {
    const { data, error } = await supabase.auth.getUser()
    return { user: data.user, error }
  })
}

// Client con service role (bypass RLS) — SOLO usar en API routes del servidor
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
