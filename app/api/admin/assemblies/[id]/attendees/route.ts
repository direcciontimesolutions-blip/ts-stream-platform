// app/api/admin/assemblies/[id]/attendees/route.ts — Gestionar asistentes

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

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
      .from('assembly_attendees')
      .select('id, full_name, username, unit_id, role, attendance_type, created_at, assembly_units(unit_number)')
      .eq('assembly_id', assemblyId)
      .order('created_at')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Error GET attendees:', err)
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
    const body = await req.json() as {
      attendees: Array<{
        unit_number?: string
        full_name: string
        username: string
        password: string
        role?: string
      }>
    }

    if (!Array.isArray(body.attendees) || body.attendees.length === 0)
      return NextResponse.json({ error: 'Sin asistentes.' }, { status: 400 })

    const supabase = createServiceRoleClient()

    // Obtener la organización de la asamblea
    const { data: assembly } = await supabase
      .from('assemblies')
      .select('organization_id')
      .eq('id', assemblyId)
      .single()

    if (!assembly) return NextResponse.json({ error: 'Asamblea no encontrada.' }, { status: 404 })

    // Obtener mapa unit_number → unit_id
    const { data: units } = await supabase
      .from('assembly_units')
      .select('id, unit_number')
      .eq('assembly_id', assemblyId)

    const unitMap = new Map((units ?? []).map(u => [u.unit_number, u.id]))

    const errors: string[] = []
    let imported = 0

    for (const row of body.attendees) {
      if (!row.full_name?.trim() || !row.username?.trim() || !row.password?.trim()) {
        errors.push(`Fila incompleta: ${JSON.stringify(row)}`)
        continue
      }

      const unitId = row.unit_number ? (unitMap.get(row.unit_number.trim()) ?? null) : null
      const passwordHash = await bcrypt.hash(row.password, 10)
      const role = ['owner', 'observer', 'secretary', 'president'].includes(row.role ?? '')
        ? row.role : 'owner'

      const { error } = await supabase
        .from('assembly_attendees')
        .upsert({
          assembly_id: assemblyId,
          organization_id: assembly.organization_id,
          full_name: row.full_name.trim(),
          username: row.username.trim(),
          password_hash: passwordHash,
          unit_id: unitId,
          role,
          attendance_type: 'virtual',
        }, { onConflict: 'assembly_id,username' })

      if (error) errors.push(`${row.username}: ${error.message}`)
      else imported++
    }

    return NextResponse.json({ imported, errors }, { status: imported > 0 ? 201 : 400 })
  } catch (err) {
    console.error('Error POST attendees:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
