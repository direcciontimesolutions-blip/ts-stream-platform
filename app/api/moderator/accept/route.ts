// app/api/moderator/accept/route.ts — Aceptar invitacion de moderador, emitir JWT

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signModeratorToken, MODERATOR_COOKIE } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(
      '<html><body><p>Link invalido. Solicita una nueva invitacion al administrador.</p></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const supabase = createServiceRoleClient()

  const { data: moderator, error } = await supabase
    .from('event_moderators')
    .select('id, event_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (error || !moderator) {
    return new NextResponse(
      '<html><body><p>Link invalido o expirado.</p></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (new Date(moderator.expires_at) < new Date()) {
    return new NextResponse(
      '<html><body><p>Este link ha expirado. Solicita una nueva invitacion.</p></body></html>',
      { status: 410, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Marcar como aceptado (idempotente si ya fue aceptado)
  if (!moderator.accepted_at) {
    await supabase
      .from('event_moderators')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', moderator.id)
  }

  // Emitir JWT de moderador con el rol real de la DB
  const jwt = await signModeratorToken({
    moderatorId: moderator.id,
    eventId: moderator.event_id,
    email: moderator.email,
    role: moderator.role as 'moderator' | 'co_host',
  })

  // Redirigir al panel de moderador con el JWT en cookie
  const response = NextResponse.redirect(
    new URL(`/moderator/${moderator.event_id}`, req.url)
  )

  response.cookies.set(
    MODERATOR_COOKIE.name,
    jwt,
    MODERATOR_COOKIE.options
  )

  return response
}
