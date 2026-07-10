// app/api/moderator/me/route.ts — Devuelve el rol del moderador autenticado

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyModeratorToken } from '@/lib/auth'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('ts_moderator_token')?.value
    if (!token) return NextResponse.json({ role: null })
    const payload = await verifyModeratorToken(token)
    if (!payload) return NextResponse.json({ role: null })
    return NextResponse.json({ role: payload.role, eventId: payload.eventId })
  } catch {
    return NextResponse.json({ role: null })
  }
}
