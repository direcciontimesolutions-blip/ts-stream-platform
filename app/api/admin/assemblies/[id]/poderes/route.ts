// app/api/admin/assemblies/[id]/poderes/route.ts — Listar y crear poderes

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

    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('assembly_poderes')
      .select('*, granting_unit:assembly_units(unit_number, owner_name, coefficient)')
      .eq('assembly_id', id)
      .order('created_at')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET poderes:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — crear poder individual o importar desde CSV
// Body: { poderes: [{ unit_number, representative_name }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const body = await req.json() as {
      poderes?: Array<{ unit_number: string; representative_name: string }>
    }

    if (!body.poderes?.length) return NextResponse.json({ error: 'Sin poderes.' }, { status: 400 })

    const supabase = createServiceRoleClient()

    // Obtener mapa de unit_number → unit_id
    const { data: units } = await supabase
      .from('assembly_units')
      .select('id, unit_number')
      .eq('assembly_id', assemblyId)

    const unitMap = new Map((units ?? []).map(u => [u.unit_number.trim(), u.id]))

    const imported: string[] = []
    const errors: Array<{ row: number; unit_number: string; error: string }> = []

    for (let i = 0; i < body.poderes.length; i++) {
      const p = body.poderes[i]
      if (!p.unit_number || !p.representative_name) {
        errors.push({ row: i + 1, unit_number: p.unit_number ?? '?', error: 'Faltan campos.' })
        continue
      }
      const unitId = unitMap.get(p.unit_number.trim())
      if (!unitId) {
        errors.push({ row: i + 1, unit_number: p.unit_number, error: 'Unidad no encontrada.' })
        continue
      }

      const { error } = await supabase.from('assembly_poderes').upsert(
        {
          assembly_id: assemblyId,
          granting_unit_id: unitId,
          representative_name: p.representative_name.trim(),
          verified: true,
        },
        { onConflict: 'assembly_id,granting_unit_id' }
      )
      if (error) errors.push({ row: i + 1, unit_number: p.unit_number, error: error.message })
      else imported.push(p.unit_number)
    }

    return NextResponse.json({ imported: imported.length, errors })
  } catch (err) {
    console.error('Error POST poderes:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
