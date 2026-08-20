// lib/supabase/auth-retry.ts — Helper compartido para no confundir un fallo transitorio
// de Supabase Auth (red, timeout, 5xx) con una sesion realmente invalida.
//
// Bug que corrige: en proxy.ts (middleware) y en el patron "verifyAdmin()" duplicado en
// las rutas API de /admin/*, un solo fallo de auth.getUser() (aunque sea de red, no de
// sesion) se trataba igual que "sesion invalida" y expulsaba al admin al login. Con un
// polling de 30s en el panel (app/admin/events/[id]/page.tsx), un solo hipo de red podia
// desloguear a un admin con sesion perfectamente valida.
//
// Sin dependencias de next/headers ni de un runtime especifico: se usa tanto desde
// Server Components/API routes (Node runtime, via lib/supabase/server.ts) como desde el
// middleware (Edge runtime, proxy.ts), que arman su propio cliente Supabase distinto.

/**
 * Distingue "sesion realmente invalida/ausente" (no reintentar, es un resultado real)
 * de "fallo transitorio" (red, timeout, error 5xx de Supabase — vale la pena reintentar).
 *
 * Cuando no hay error explicito (usuario simplemente no autenticado, primera visita)
 * tampoco es transitorio: no hay nada que reintentar, el resultado ya es definitivo.
 */
export function isTransientAuthError(error: unknown): boolean {
  if (!error) return false

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').toLowerCase()
      : String(error).toLowerCase()

  // Estos mensajes indican que Supabase SI pudo evaluar la sesion y concluyo que
  // es invalida de verdad (no es un problema de conectividad) — no reintentar.
  const definitivePatterns = [
    'auth session missing',
    'session missing',
    'session_not_found',
    'invalid jwt',
    'invalid claim',
    'jwt expired',
    'refresh_token_not_found',
    'invalid refresh token',
  ]
  if (definitivePatterns.some((p) => message.includes(p))) return false

  // Cualquier otra cosa (fetch failed, network error, timeout, 500/502/503/504,
  // "server error", etc.) se trata como transitorio por defecto — el sesgo correcto
  // es evitar expulsar a un admin con sesion valida por un hipo de red.
  return true
}

/**
 * Ejecuta getUser una vez; si falla y el fallo parece transitorio, reintenta una sola
 * vez tras una pausa breve antes de concluir "no autorizado". Un solo fallo aislado
 * (ej. un timeout puntual de Supabase) ya no expulsa a un admin con sesion valida.
 */
export async function resolveUserWithRetry<T>(
  getUser: () => Promise<{ user: T | null; error: unknown }>
): Promise<T | null> {
  const first = await safeGetUser(getUser)
  if (first.user) return first.user
  if (!isTransientAuthError(first.error)) return null

  await new Promise((resolve) => setTimeout(resolve, 300))
  const second = await safeGetUser(getUser)
  return second.user
}

async function safeGetUser<T>(
  getUser: () => Promise<{ user: T | null; error: unknown }>
): Promise<{ user: T | null; error: unknown }> {
  try {
    return await getUser()
  } catch (err) {
    // auth.getUser() puede lanzar (no solo devolver {error}) ante fallos de red reales.
    return { user: null, error: err }
  }
}
