// app/api/cohost/[eventId]/attendees/import/route.ts — Co-host: importar asistentes por CSV

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { verifyModeratorAccess } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { parseCSV, generatePassword } from '@/lib/utils'
import type { ImportResult } from '@/types'

async function verifyCoHost(eventId: string) {
  const payload = await verifyModeratorAccess(eventId)
  if (!payload || payload.role !== 'co_host') return null
  return payload
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const payload = await verifyCoHost(eventId)
    if (!payload) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

    const body = await req.json() as { csv?: string }
    if (!body.csv || typeof body.csv !== 'string') {
      return NextResponse.json({ error: 'CSV requerido en body.csv' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, organization_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Evento no encontrado.' }, { status: 404 })
    }

    const rows = parseCSV(body.csv)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV vacío o sin datos válidos.' }, { status: 400 })
    }

    const result: ImportResult = { imported: 0, errors: [] }
    const BCRYPT_ROUNDS = 10

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2
      const full_name = row['full_name']?.trim()
      const username = row['username']?.trim().toLowerCase()
      const email = row['email']?.trim() || null
      const rawPassword = row['password']?.trim() || generatePassword()

      if (!full_name) {
        result.errors.push({ row: rowNum, username: username ?? '', error: 'full_name es requerido' })
        continue
      }
      if (!username) {
        result.errors.push({ row: rowNum, username: '', error: 'username es requerido' })
        continue
      }

      try {
        const password_hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS)
        const { error: insertError } = await supabase
          .from('attendees')
          .insert({ event_id: eventId, organization_id: event.organization_id, full_name, email, username, password_hash, role: 'attendee' })

        if (insertError) {
          result.errors.push({
            row: rowNum,
            username,
            error: insertError.code === '23505'
              ? `El username "${username}" ya existe en este evento`
              : insertError.message,
          })
          continue
        }
        result.imported++
      } catch (err) {
        result.errors.push({ row: rowNum, username, error: `Error: ${err instanceof Error ? err.message : 'desconocido'}` })
      }
    }

    return NextResponse.json(result, { status: result.imported > 0 ? 200 : 400 })
  } catch (err) {
    console.error('Error importando asistentes (cohost):', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}
