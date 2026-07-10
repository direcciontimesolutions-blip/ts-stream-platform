// app/api/assembly/config/route.ts — Configuración pública para el portal de asambleas
// El App ID de Agora no es secreto (es público por diseño de Agora)

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    agoraAppId: process.env.AGORA_APP_ID ?? '',
  })
}
