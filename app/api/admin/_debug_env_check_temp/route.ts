// TEMPORAL — endpoint de verificacion de env vars sensibles, se elimina apenas
// se confirme el fix de FALLBACK_STREAM_URL_SCP_ANTIOQUIA_... (17 ago 2026).
// NUNCA expone valores, solo si estan presentes y su longitud en caracteres.
// Protegido por un token descartable hardcodeado (no reusa ningun secreto
// real del proyecto) para que este chequeo no dependa de que otra variable
// sensible ya funcione.

import { NextRequest, NextResponse } from 'next/server'

const DEBUG_TOKEN = 'ce38f273792a141d73efee5bbe2d3f6210e1bc19c26d8229'

const VARS_TO_CHECK = [
  'FALLBACK_STREAM_URL_SCP_ANTIOQUIA_PRIMER_SIMPOSIO_PEDIATRIA_MEDICOS_GENERALES',
  'SMTP_EMAIL',
  'SMTP_APP_PASSWORD',
  'EMERGENCY_BROADCAST_KEY',
]

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const result = VARS_TO_CHECK.map((name) => {
    const value = process.env[name]
    return {
      variable: name,
      presente: !!value && value.trim().length > 0,
      longitud: value ? value.length : 0,
    }
  })

  return NextResponse.json({ ok: true, checks: result })
}
