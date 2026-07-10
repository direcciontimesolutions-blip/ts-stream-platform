// app/api/admin/assemblies/[id]/units/route.ts — Listar e importar unidades CSV

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
      .from('assembly_units')
      .select('*')
      .eq('assembly_id', id)
      .order('unit_number')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET units:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — importar unidades desde CSV
// Body: { units: [{ unit_number, owner_name, coefficient }] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAdmin()
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const { id: assemblyId } = await params
    const body = await req.json() as { units?: Array<{ unit_number: string; owner_name: string; coefficient: number }> }

    if (!body.units?.length) return NextResponse.json({ error: 'Sin unidades.' }, { status: 400 })

    const supabase = createServiceRoleClient()
    const imported: string[] = []
    const errors: Array<{ row: number; unit_number: string; error: string }> = []

    for (let i = 0; i < body.units.length; i++) {
      const u = body.units[i]
      if (!u.unit_number || !u.owner_name || !u.coefficient) {
        errors.push({ row: i + 1, unit_number: u.unit_number ?? '?', error: 'Faltan campos.' })
        continue
      }
      const coef = Number(u.coefficient)
      if (isNaN(coef) || coef <= 0) {
        errors.push({ row: i + 1, unit_number: u.unit_number, error: 'Coeficiente inválido.' })
        continue
      }

      const { error } = await supabase.from('assembly_units').upsert(
        { assembly_id: assemblyId, unit_number: u.unit_number.trim(), owner_name: u.owner_name.trim(), coefficient: coef },
        { onConflict: 'assembly_id,unit_number' }
      )
      if (error) errors.push({ row: i + 1, unit_number: u.unit_number, error: error.message })
      else imported.push(u.unit_number)
    }

    return NextResponse.json({ imported: imported.length, errors })
  } catch (err) {
    console.error('Error POST units:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
