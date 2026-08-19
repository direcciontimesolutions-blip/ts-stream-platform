// app/api/admin/events/[id]/send-certificates/route.ts
//
// GET cuenta cuantos asistentes son elegibles a certificado (>= 30 min conectado, umbral
// confirmado por la SCP Antioquia para el Primer Simposio en Pediatria) — lo usa el panel
// admin para mostrar el conteo, sin generar ni enviar nada. Sigue funcionando igual que
// siempre, reusa lib/attendee-metrics.ts (mismo calculo que el CSV de metricas, para que
// los numeros nunca se desincronicen).
//
// POST YA NO GENERA CERTIFICADOS DESDE AQUI (cambio 19 ago 2026). Este evento usa el
// diseño OFICIAL del certificado entregado por la SCP (PPTX real, ver
// produccion/simposio-pediatria/certificado.pptx), que solo puede reproducirse con
// fidelidad exacta abriendo ese PPTX y editandolo via automatizacion COM de PowerPoint —
// eso requiere Windows + PowerPoint instalado, algo que Vercel (Linux, donde corre este
// endpoint) no puede ejecutar. El viejo generador (react-pdf sobre una imagen de fondo
// PROVISIONAL "NO OFICIAL") vivia en lib/certificate-pdf.tsx y quedo movido, sin uso, a
// lib/_deprecated/certificate-pdf.tsx.
//
// El pipeline real ahora es LOCAL: scripts/certificates/ (3 pasos — exportar elegibles,
// generar PDFs via COM, enviar correos), ejecutado por el equipo tecnico de Time Solutions
// desde esta misma maquina Windows con PowerPoint instalado, nunca desde este endpoint.
// Ver scripts/certificates/README.md. POST devuelve 501 con esta explicacion en vez de
// simular un envio real o (peor) enviar de nuevo la plantilla provisional incorrecta.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getAttendeeMetrics, CERTIFICATE_ELIGIBILITY_SECONDS } from '@/lib/attendee-metrics'

// GET — solo cuenta cuantos asistentes son elegibles hoy, sin enviar nada. Lo usa el
// panel admin como informacion (el envio real ya no se dispara desde el panel, ver POST).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params

    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const rows = await getAttendeeMetrics(eventId)
    const eligibles = rows.filter((r) => r.totalSeconds >= CERTIFICATE_ELIGIBILITY_SECONDS)
    const sinCorreo = eligibles.filter((r) => !r.email?.trim()).length

    return NextResponse.json({
      total_asistentes: rows.length,
      elegibles: eligibles.length,
      elegibles_sin_correo: sinCorreo,
      umbral_minutos: CERTIFICATE_ELIGIBILITY_SECONDS / 60,
    })
  } catch (err) {
    console.error('Error contando elegibles de certificados:', err)
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 })
  }
}

// POST — DESHABILITADO a proposito. Ver comentario de cabecera del archivo: el diseño
// oficial de la SCP solo puede generarse via automatizacion COM de PowerPoint, que no
// corre en Vercel. Responde 501 con instrucciones en vez de generar/enviar nada — nunca
// "responde 200 pero no hizo lo que decia" y nunca vuelve a usar la plantilla provisional
// vieja por accidente.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params

  const supabaseAuth = await createServerSupabaseClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  return NextResponse.json(
    {
      error:
        'Este evento usa el diseño OFICIAL del certificado de la SCP (PowerPoint), que solo se puede generar ' +
        'con automatización de PowerPoint (COM) — eso requiere Windows con PowerPoint instalado y no puede ' +
        'correr en este servidor (Vercel/Linux). La generación y el envío se ejecutan localmente por el equipo ' +
        'técnico de Time Solutions con scripts/certificates/ (ver scripts/certificates/README.md en el repo). ' +
        'Este endpoint no genera ni envía nada.',
      event_id: eventId,
      pipeline_local: 'scripts/certificates/README.md',
    },
    { status: 501 }
  )
}
