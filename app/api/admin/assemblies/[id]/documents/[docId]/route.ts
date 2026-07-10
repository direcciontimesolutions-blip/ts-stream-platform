// app/api/admin/assemblies/[id]/documents/[docId]/route.ts — Eliminar documento

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { docId } = await params
    const supabase = createServiceRoleClient()

    const { error } = await supabase
      .from('assembly_documents')
      .delete()
      .eq('id', docId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error DELETE document:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
