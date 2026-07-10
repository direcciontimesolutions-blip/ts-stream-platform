// scripts/seed-prueba.mjs
// Importa datos de prueba: Torres de Santa Bárbara PH
// Uso: node scripts/seed-prueba.mjs
// Requiere: .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── Leer .env.local manualmente ───────────────────────────────────────────────
function loadEnv(file) {
  try {
    const content = readFileSync(file, 'utf-8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = val
    }
    return env
  } catch { return {} }
}

const env = { ...loadEnv(join(ROOT, '.env.local')), ...process.env }
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
})

// ── Parsear CSV ───────────────────────────────────────────────────────────────
function parseCSV(filePath, fields) {
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n').slice(1)
  return lines
    .map(line => {
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
      return Object.fromEntries(fields.map((f, i) => [f, parts[i] ?? '']))
    })
    .filter(row => Object.values(row).some(v => v))
}

// ── Agenda de una asamblea ordinaria Ley 675/2001 ────────────────────────────
const AGENDA = [
  { title: 'Verificación del quórum', motion_type: 'informativo' },
  { title: 'Instalación de la asamblea y designación del Presidente y Secretario', motion_type: 'voto_simple', majority_type: 'simple', majority_pct: 50 },
  { title: 'Lectura y aprobación del Orden del Día', motion_type: 'voto_simple', majority_type: 'simple', majority_pct: 50 },
  { title: 'Informe de gestión de la Administración — período 2024', motion_type: 'informativo' },
  { title: 'Informe del Revisor Fiscal — período 2024', motion_type: 'informativo' },
  { title: 'Presentación de estados financieros a 31 de diciembre de 2024', motion_type: 'informativo' },
  { title: 'Aprobación de estados financieros y distribución de excedentes / déficit 2024', motion_type: 'voto_simple', majority_type: 'simple', majority_pct: 50 },
  { title: 'Presentación y aprobación del Presupuesto de ingresos y gastos 2025', motion_type: 'voto_simple', majority_type: 'simple', majority_pct: 50 },
  { title: 'Aprobación de cuota extraordinaria para mantenimiento de áreas comunes', motion_type: 'voto_simple', majority_type: 'calificada', majority_pct: 70 },
  { title: 'Elección del Consejo de Administración — período 2025-2027', motion_type: 'voto_plancha', majority_type: 'simple', majority_pct: 50,
    plancha_options: ['Plancha 1 — Lista de candidatos A', 'Plancha 2 — Lista de candidatos B', 'Voto en blanco'] },
  { title: 'Elección del Revisor Fiscal — período 2025-2026', motion_type: 'voto_simple', majority_type: 'simple', majority_pct: 50 },
  { title: 'Propuestas y auxilios de copropietarios', motion_type: 'informativo' },
  { title: 'Proposiciones y varios', motion_type: 'informativo' },
  { title: 'Lectura y aprobación del acta de la asamblea', motion_type: 'voto_simple', majority_type: 'simple', majority_pct: 50 },
  { title: 'Clausura', motion_type: 'informativo' },
]

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Iniciando seed — Torres de Santa Bárbara PH\n')

  // ── 1. Organización ──────────────────────────────────────────────────────
  console.log('1️⃣  Organización...')
  const ORG_SLUG = 'torres-santa-barbara'
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', ORG_SLUG)
    .single()

  let orgId
  if (existingOrg) {
    orgId = existingOrg.id
    console.log(`   ✓ Org existente: ${existingOrg.name} (${orgId})`)
  } else {
    const { data: newOrg, error } = await supabase
      .from('organizations')
      .insert({
        name: 'Torres de Santa Bárbara PH',
        slug: ORG_SLUG,
        primary_color: '#1d4ed8',
      })
      .select('id')
      .single()
    if (error) { console.error('❌ Error creando org:', error.message); process.exit(1) }
    orgId = newOrg.id
    console.log(`   ✓ Org creada: ${orgId}`)
  }

  // ── 2. Asamblea ──────────────────────────────────────────────────────────
  console.log('2️⃣  Asamblea...')
  const ASM_SLUG = 'asamblea-ordinaria-2025'
  const { data: existingAsm } = await supabase
    .from('assemblies')
    .select('id, title')
    .eq('slug', ASM_SLUG)
    .eq('organization_id', orgId)
    .single()

  let asmId
  if (existingAsm) {
    asmId = existingAsm.id
    console.log(`   ✓ Asamblea existente: ${existingAsm.title} (${asmId})`)
  } else {
    const { data: newAsm, error } = await supabase
      .from('assemblies')
      .insert({
        organization_id: orgId,
        title: 'Asamblea General Ordinaria 2025 — Torres de Santa Bárbara PH',
        slug: ASM_SLUG,
        scheduled_at: new Date('2025-03-29T09:00:00-05:00').toISOString(),
        status: 'draft',
        total_coefficient: 98.8696,
        quorum_threshold_primera: 0.5001,
        quorum_threshold_segunda: 0.25,
        current_convocatoria: 'primera',
        assembly_type: 'ordinaria',
      })
      .select('id')
      .single()
    if (error) { console.error('❌ Error creando asamblea:', error.message); process.exit(1) }
    asmId = newAsm.id
    console.log(`   ✓ Asamblea creada: ${asmId}`)
  }

  // ── 3. Agenda ────────────────────────────────────────────────────────────
  console.log('3️⃣  Agenda (15 puntos)...')
  const { count: existingMotions } = await supabase
    .from('assembly_motions')
    .select('id', { count: 'exact', head: true })
    .eq('assembly_id', asmId)

  if (existingMotions && existingMotions > 0) {
    console.log(`   ✓ ${existingMotions} puntos ya existentes, saltando`)
  } else {
    for (let i = 0; i < AGENDA.length; i++) {
      const item = AGENDA[i]
      const { data: motion, error } = await supabase
        .from('assembly_motions')
        .insert({
          assembly_id: asmId,
          title: item.title,
          motion_type: item.motion_type,
          majority_type: item.majority_type ?? 'simple',
          majority_pct: item.majority_pct ?? 50,
          order_index: i,
          status: 'pending',
        })
        .select('id')
        .single()
      if (error) { console.error(`❌ Error punto ${i+1}:`, error.message); continue }

      if (item.plancha_options?.length && motion) {
        const opts = item.plancha_options.map((name, idx) => ({
          motion_id: motion.id,
          name,
          order_index: idx,
        }))
        await supabase.from('assembly_plancha_options').insert(opts)
      }
      process.stdout.write('.')
    }
    console.log(`\n   ✓ ${AGENDA.length} puntos creados`)
  }

  // ── 4. Unidades ──────────────────────────────────────────────────────────
  console.log('4️⃣  Unidades...')
  const unitsCSV = parseCSV(join(ROOT, 'prueba_asamblea', 'unidades.csv'), ['unit_number', 'owner_name', 'coefficient'])
  console.log(`   ${unitsCSV.length} unidades en CSV`)

  const { count: existingUnits } = await supabase
    .from('assembly_units')
    .select('id', { count: 'exact', head: true })
    .eq('assembly_id', asmId)

  if (existingUnits && existingUnits > 0) {
    console.log(`   ✓ ${existingUnits} unidades ya existentes, saltando`)
  } else {
    // Calcular coef total real
    const totalCoef = unitsCSV.reduce((s, r) => s + parseFloat(r.coefficient || '0'), 0)

    // Insertar en lotes de 50
    const BATCH = 50
    let imported = 0
    for (let i = 0; i < unitsCSV.length; i += BATCH) {
      const batch = unitsCSV.slice(i, i + BATCH).map(r => ({
        assembly_id: asmId,
        unit_number: r.unit_number,
        owner_name: r.owner_name,
        coefficient: parseFloat(r.coefficient) || 0,
      }))
      const { error } = await supabase.from('assembly_units').insert(batch)
      if (error) { console.error(`   ❌ Batch ${i}-${i+BATCH}:`, error.message) }
      else { imported += batch.length; process.stdout.write('.') }
    }
    // Actualizar total_coefficient real
    await supabase.from('assemblies').update({ total_coefficient: Math.round(totalCoef * 10000) / 10000 }).eq('id', asmId)
    console.log(`\n   ✓ ${imported} unidades importadas · coef total: ${Math.round(totalCoef * 10000) / 10000}`)
  }

  // ── 5. Asistentes ────────────────────────────────────────────────────────
  console.log('5️⃣  Asistentes...')
  const attendeesCSV = parseCSV(join(ROOT, 'prueba_asamblea', 'asistentes.csv'), ['unit_number', 'full_name', 'username', 'password'])
  console.log(`   ${attendeesCSV.length} asistentes en CSV`)

  const { count: existingAttendees } = await supabase
    .from('assembly_attendees')
    .select('id', { count: 'exact', head: true })
    .eq('assembly_id', asmId)

  if (existingAttendees && existingAttendees > 0) {
    console.log(`   ✓ ${existingAttendees} asistentes ya existentes, saltando`)
  } else {
    // Obtener mapa unit_number → unit_id
    const { data: unitRows } = await supabase
      .from('assembly_units')
      .select('id, unit_number')
      .eq('assembly_id', asmId)

    const unitMap = Object.fromEntries((unitRows ?? []).map(u => [u.unit_number, u.id]))

    // Hash único por contraseña (Torres2023! es la misma para todos — un solo hash)
    console.log('   Generando hash de contraseña...')
    const passwordHash = await bcrypt.hash('Torres2023!', 12)

    let imported = 0
    let errors = 0
    const BATCH = 20
    for (let i = 0; i < attendeesCSV.length; i += BATCH) {
      const batch = attendeesCSV.slice(i, i + BATCH).map(r => ({
        assembly_id: asmId,
        organization_id: orgId,
        unit_id: unitMap[r.unit_number] ?? null,
        full_name: r.full_name,
        username: r.username,
        password_hash: passwordHash,
        role: 'owner',
      }))
      const { error } = await supabase.from('assembly_attendees').insert(batch)
      if (error) {
        errors++
        console.error(`\n   ❌ Batch ${i}-${i+BATCH}:`, error.message)
      } else {
        imported += batch.length
        process.stdout.write('.')
      }
    }
    console.log(`\n   ✓ ${imported} asistentes importados${errors > 0 ? ` · ${errors} errores de batch` : ''}`)
  }

  // ── Resumen final ────────────────────────────────────────────────────────
  console.log('\n✅ Seed completado\n')
  console.log('─────────────────────────────────────────────────────')
  console.log(`Org slug:       ${ORG_SLUG}`)
  console.log(`Assembly slug:  ${ASM_SLUG}`)
  console.log(`Assembly ID:    ${asmId}`)
  console.log(`Admin URL:      /admin/assemblies/${asmId}`)
  console.log(`Portal URL:     /${ORG_SLUG}/${ASM_SLUG}`)
  console.log(`Contraseña:     Torres2023!`)
  console.log('─────────────────────────────────────────────────────\n')
}

main().catch(err => { console.error('❌ Error fatal:', err); process.exit(1) })
