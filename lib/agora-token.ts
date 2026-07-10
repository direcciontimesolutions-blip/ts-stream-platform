// lib/agora-token.ts — Generación de tokens RTC de Agora (server-side only)

import { RtcTokenBuilder, RtcRole } from 'agora-token'

const APP_ID = process.env.AGORA_APP_ID!
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE!

export { APP_ID }

// UUID → uint32 para Agora UID (Agora requiere integer)
export function uuidToAgoraUid(uuid: string): number {
  const hex = uuid.replace(/-/g, '').slice(0, 8)
  return (parseInt(hex, 16) >>> 0) % 2_147_483_647 // Signed 32-bit safe
}

export function generateRtcToken(
  channelName: string,
  uid: number,
  ttlSeconds = 3600
): string {
  if (!APP_ID || !APP_CERTIFICATE) {
    throw new Error('AGORA_APP_ID y AGORA_APP_CERTIFICATE son requeridos.')
  }
  const expireAt = Math.floor(Date.now() / 1000) + ttlSeconds
  return RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    expireAt,
    expireAt
  )
}
