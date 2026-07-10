// app/api/admin/assemblies/[id]/qr/route.ts — Generar y obtener token QR de registro presencial

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const supabase = createServiceRoleClient()

    // Obtener o crear token QR
    let { data: qr } = await supabase
      .from('assembly_qr_tokens')
      .select('id, token, expires_at')
      .eq('assembly_id', assemblyId)
      .single()

    if (!qr) {
      const { data: created } = await supabase
        .from('assembly_qr_tokens')
        .insert({ assembly_id: assemblyId })
        .select('id, token, expires_at')
        .single()
      qr = created
    }

    if (!qr) return NextResponse.json({ error: 'Error generando QR.' }, { status: 500 })

    // Obtener info de la asamblea para construir la URL
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('slug, organizations(slug)')
      .eq('id', assemblyId)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })

    const orgSlug = (assembly.organizations as unknown as { slug: string } | null)?.slug ?? ''
    const assemblySlug = assembly.slug
    const baseUrl = process.env.NEXT_PUBLIC_ASAMBLEAS_URL ?? 'https://asambleas.timesolutions.com.co'
    const checkinUrl = `${baseUrl}/${orgSlug}/${assemblySlug}/checkin?token=${qr.token}`

    return NextResponse.json({ token: qr.token, url: checkinUrl, expires_at: qr.expires_at })
  } catch (err) {
    console.error('Error GET qr:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const supabase = createServiceRoleClient()

    await supabase.from('assembly_qr_tokens').delete().eq('assembly_id', assemblyId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE qr:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
