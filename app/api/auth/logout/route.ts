// app/api/auth/logout/route.ts — Logout de asistente (clear cookie)

import { NextResponse } from 'next/server'
import { ATTENDEE_COOKIE } from '@/lib/auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ATTENDEE_COOKIE.name, '', {
    ...ATTENDEE_COOKIE.options,
    maxAge: 0,
  })
  return response
}
