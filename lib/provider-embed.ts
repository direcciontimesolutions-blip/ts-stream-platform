// lib/provider-embed.ts — Token de acceso para el embed que se le entrega
// a un proveedor externo (ej. cuando otra plataforma opera el evento y
// nosotros solo le damos el <iframe> de video, quedando como respaldo).
//
// Mismo patron que lib/fallback-stream.ts: el secreto vive en una variable
// de entorno por organizacion+evento, no en la base de datos — asi se puede
// revocar/rotar cambiando una sola variable en Vercel, sin tocar codigo ni
// afectar a otros eventos.

function normalizeForEnvVar(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function providerEmbedTokenEnvVarName(orgSlug: string, eventSlug: string): string {
  return `PROVIDER_EMBED_TOKEN_${normalizeForEnvVar(orgSlug)}_${normalizeForEnvVar(eventSlug)}`
}

export function getProviderEmbedToken(orgSlug: string, eventSlug: string): string | null {
  const value = process.env[providerEmbedTokenEnvVarName(orgSlug, eventSlug)]
  return value && value.trim().length > 0 ? value.trim() : null
}

// Comparacion en tiempo constante — un token de proveedor vive semanas/meses
// en su plataforma, vale la pena cerrar la puerta a timing attacks aunque el
// riesgo practico sea bajo.
export function timingSafeTokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
