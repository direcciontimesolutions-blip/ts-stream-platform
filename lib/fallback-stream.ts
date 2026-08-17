// lib/fallback-stream.ts — Plan B de acceso cuando falla la consulta a Supabase
//
// Si la app carga bien pero la query a `organizations`/`events` falla por un
// problema de conexion/timeout con la base de datos (no porque el evento no
// exista), mostramos un link directo a la transmision en vez de tronar.
//
// El link vive en una variable de entorno de Vercel, NO en la base de datos:
// si el problema es justo que la BD no responde, no podemos leer el link
// desde ahi. Se configura una vez por evento (ver README/memoria del evento).
//
// El nombre de la variable incluye organizacion Y evento (no solo el evento)
// porque la plataforma es multi-tenant por diseno (`[org]/[event]`) — dos
// organizaciones distintas podrian tener un evento con el mismo slug, y sin
// el slug de la org sus fallbacks colisionarian en la misma variable.

function normalizeForEnvVar(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function fallbackStreamEnvVarName(orgSlug: string, eventSlug: string): string {
  return `FALLBACK_STREAM_URL_${normalizeForEnvVar(orgSlug)}_${normalizeForEnvVar(eventSlug)}`
}

export function getFallbackStreamUrl(orgSlug: string, eventSlug: string): string | null {
  const varName = fallbackStreamEnvVarName(orgSlug, eventSlug)
  const value = process.env[varName]
  return value && value.trim().length > 0 ? value.trim() : null
}
