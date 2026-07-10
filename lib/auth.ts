// lib/auth.ts — JWT helpers para sesiones de asistentes y moderadores (jose)

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { AttendeeJWTPayload, ModeratorJWTPayload } from '@/types'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production-64chars-minimum'
)

// ─── Asistentes ────────────────────────────────────────────────────────────

const ATTENDEE_COOKIE_NAME = 'ts_stream_token'
const ATTENDEE_MAX_AGE = 60 * 60 * 24 // 24 horas

export async function signAttendeeToken(
  payload: Omit<AttendeeJWTPayload, 'iat' | 'exp'>
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ATTENDEE_MAX_AGE}s`)
    .sign(JWT_SECRET)
}

export async function verifyAttendeeToken(
  token: string
): Promise<AttendeeJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as AttendeeJWTPayload
  } catch {
    return null
  }
}

export const ATTENDEE_COOKIE = {
  name: ATTENDEE_COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: ATTENDEE_MAX_AGE,
    path: '/',
  },
}

// ─── Moderadores ───────────────────────────────────────────────────────────

const MODERATOR_COOKIE_NAME = 'ts_moderator_token'
const MODERATOR_MAX_AGE = 60 * 60 * 12 // 12 horas

export async function signModeratorToken(
  payload: Omit<ModeratorJWTPayload, 'iat' | 'exp'>
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MODERATOR_MAX_AGE}s`)
    .sign(JWT_SECRET)
}

export async function verifyModeratorToken(
  token: string
): Promise<ModeratorJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const p = payload as unknown as ModeratorJWTPayload
    if (p.role !== 'moderator' && p.role !== 'co_host') return null
    return p
  } catch {
    return null
  }
}

export const MODERATOR_COOKIE = {
  name: MODERATOR_COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: MODERATOR_MAX_AGE,
    path: '/',
  },
}

// ─── Verificación de revocación ────────────────────────────────────────────

/** Devuelve true si el moderador fue revocado o no existe en DB. */
export async function isModeratorRevoked(moderatorId: string): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient()
    const { data } = await supabase
      .from('event_moderators')
      .select('revoked_at')
      .eq('id', moderatorId)
      .maybeSingle()
    if (!data) return true
    return data.revoked_at !== null
  } catch {
    return true
  }
}

/**
 * Verifica JWT de moderador + que no esté revocado.
 * Reemplaza el patrón verifyCoHost en las rutas de cohost/moderator.
 */
export async function verifyModeratorAccess(eventId: string): Promise<ModeratorJWTPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(MODERATOR_COOKIE_NAME)?.value
    if (!token) return null
    const payload = await verifyModeratorToken(token)
    if (!payload || payload.eventId !== eventId) return null
    if (await isModeratorRevoked(payload.moderatorId)) return null
    return payload
  } catch {
    return null
  }
}

// ─── Auth compartida: admin Supabase O moderador JWT ───────────────────────

/**
 * Verifica que quien llama es admin (Supabase session) OR moderador/co_host del evento.
 * Úsalo en endpoints que admin y moderadores comparten (métricas, chat, kick).
 */
export async function verifyAdminOrModerator(
  eventId: string,
  getSupabaseUser: () => Promise<{ data: { user: unknown } }>
): Promise<boolean> {
  // 1. Intentar admin
  const { data: { user } } = await getSupabaseUser()
  if (user) return true

  // 2. Intentar JWT de moderador (con check de revocación)
  const payload = await verifyModeratorAccess(eventId)
  return payload !== null
}
