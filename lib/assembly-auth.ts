// lib/assembly-auth.ts — JWT helpers para el portal de asambleas

import { jwtVerify, SignJWT } from 'jose'
import type { NextRequest } from 'next/server'

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET es requerido en producción.')
}
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production-64chars-minimum'
)

export interface AssemblyTokenPayload {
  sub: string          // attendeeId
  assemblyId: string
  sessionId: string
  unitId: string | null
  role: string
  name: string
  org: string          // org slug
  assembly: string     // assembly slug
}

export async function signAssemblyToken(payload: AssemblyTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(JWT_SECRET)
}

export async function verifyAssemblyToken(token: string): Promise<AssemblyTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as AssemblyTokenPayload
  } catch {
    return null
  }
}

export async function getAssemblyTokenFromRequest(req: NextRequest): Promise<AssemblyTokenPayload | null> {
  const token = req.cookies.get('ts_assembly_token')?.value
  if (!token) return null
  return verifyAssemblyToken(token)
}
