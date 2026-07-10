// app/api/admin/events/[id]/moderators/route.ts — Gestionar moderadores del evento

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET — lista de moderadores del evento
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: eventId } = await params
    const supabase = createServiceRoleClient()

    const { data } = await supabase
      .from('event_moderators')
      .select('id, email, role, token, invited_at, accepted_at, expires_at, revoked_at')
      .eq('event_id', eventId)
      .order('invited_at', { ascending: false })

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET moderators:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — invitar moderador por email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: eventId } = await params
    const body = await req.json() as { email?: string; role?: string }

    if (!body.email?.trim()) {
      return NextResponse.json({ error: 'Email requerido.' }, { status: 400 })
    }

    const email = body.email.trim().toLowerCase()
    const role = body.role === 'co_host' ? 'co_host' : 'moderator'
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('event_moderators')
      .upsert(
        { event_id: eventId, email, role },
        { onConflict: 'event_id,email', ignoreDuplicates: false }
      )
      .select('id, email, role, token, expires_at')
      .single()

    if (error) {
      console.error('Error creando moderador:', error)
      return NextResponse.json({ error: 'Error al crear invitacion.' }, { status: 500 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const inviteLink = `${appUrl}/api/moderator/accept?token=${data.token}`

    return NextResponse.json({ ok: true, email: data.email, invite_link: inviteLink })
  } catch (err) {
    console.error('Error POST moderator:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
