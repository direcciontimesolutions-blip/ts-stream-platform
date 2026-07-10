// lib/assembly-quorum.ts — Cálculo de quórum reutilizable
import type { SupabaseClient } from '@supabase/supabase-js'

export async function calculateQuorumPct(
  supabase: SupabaseClient,
  assemblyId: string
): Promise<number> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const [{ data: assembly }, { data: sessions }] = await Promise.all([
    supabase
      .from('assemblies')
      .select('total_coefficient')
      .eq('id', assemblyId)
      .single(),
    supabase
      .from('assembly_sessions')
      .select('attendee_id, is_presencial, last_ping_at, created_at')
      .eq('assembly_id', assemblyId)
      .is('logout_at', null)
      .is('kicked_at', null),
  ])

  const totalCoef = Number(assembly?.total_coefficient ?? 0)
  if (totalCoef === 0) return 0

  const activeIds = (sessions ?? [])
    .filter(s => s.is_presencial || (s.last_ping_at ?? s.created_at) >= twoMinutesAgo)
    .map(s => s.attendee_id)

  if (activeIds.length === 0) return 0

  const { data: attendees } = await supabase
    .from('assembly_attendees')
    .select('id, unit_id')
    .in('id', activeIds)

  const activeSet = new Set(activeIds)
  const ownUnitIds = new Set(
    (attendees ?? []).filter(a => a.unit_id).map(a => a.unit_id as string)
  )

  const { data: poderes } = await supabase
    .from('assembly_poderes')
    .select('granting_unit_id, receiving_attendee_id')
    .eq('assembly_id', assemblyId)
    .not('receiving_attendee_id', 'is', null)

  const representedUnitIds = new Set(
    (poderes ?? [])
      .filter(p => p.receiving_attendee_id && activeSet.has(p.receiving_attendee_id))
      .map(p => p.granting_unit_id)
  )

  const allUnitIds = [...new Set([...ownUnitIds, ...representedUnitIds])]
  if (allUnitIds.length === 0) return 0

  const { data: units } = await supabase
    .from('assembly_units')
    .select('coefficient')
    .in('id', allUnitIds)

  const currentCoef = (units ?? []).reduce((s, u) => s + Number(u.coefficient), 0)
  return Math.round((currentCoef / totalCoef) * 10000) / 100
}
