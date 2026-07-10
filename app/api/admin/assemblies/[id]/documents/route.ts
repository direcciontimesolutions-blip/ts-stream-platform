// app/api/admin/assemblies/[id]/documents/route.ts — Documentos descargables de la asamblea

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

    const { data, error } = await supabase
      .from('assembly_documents')
      .select('id, title, url, order_index, created_at')
      .eq('assembly_id', assemblyId)
      .order('order_index')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET documents:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const body = await req.json() as { title: string; url: string; order_index?: number }

    if (!body.title?.trim() || !body.url?.trim())
      return NextResponse.json({ error: 'Título y URL son requeridos.' }, { status: 400 })

    try { new URL(body.url) } catch {
      return NextResponse.json({ error: 'URL inválida.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('assembly_documents')
      .insert({
        assembly_id: assemblyId,
        title: body.title.trim(),
        url: body.url.trim(),
        order_index: body.order_index ?? 0,
      })
      .select('id, title, url, order_index, created_at')
      .single()

    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Error.' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Error POST document:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
