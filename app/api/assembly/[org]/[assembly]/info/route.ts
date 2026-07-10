// app/api/assembly/[org]/[assembly]/info/route.ts — Info pública de la asamblea (sin auth)

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ org: string; assembly: string }> }
) {
  try {
    const { org: orgSlug, assembly: assemblySlug } = await params
    const supabase = createServiceRoleClient()

    const { data } = await supabase
      .from('assemblies')
      .select('id, title, slug, status, scheduled_at, current_convocatoria, branding, organizations(name, slug, primary_color, logo_url)')
      .eq('slug', assemblySlug)
      .eq('organizations.slug', orgSlug)
      .single()

    if (!data) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })

    return NextResponse.json({
      id: data.id,
      title: data.title,
      slug: data.slug,
      status: data.status,
      scheduled_at: data.scheduled_at,
      branding: data.branding,
      org: data.organizations,
    })
  } catch (err) {
    console.error('Error GET assembly info:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
