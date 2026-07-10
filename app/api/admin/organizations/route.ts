// app/api/admin/organizations/route.ts — Listar organizaciones

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const service = createServiceRoleClient()
    const { data } = await service
      .from('organizations')
      .select('id, name, slug, primary_color, logo_url')
      .order('name')

    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
