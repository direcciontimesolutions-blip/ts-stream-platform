// lib/event-live-state.ts — Estado derivado de un evento (draft/live/ended)
//
// Por qué existe: antes, "live" dependía 100% de que alguien (humano o script)
// cambiara `events.status` en el momento exacto. Esto obligaba a automatizaciones
// externas (cron + endpoint + secreto) solo para voltear un campo que no dispara
// ningún efecto secundario real — status solo controla qué ve el asistente en la
// página (confirmado: grep de "status" en /app y /lib, sin envío de emails,
// notificaciones, activación de grabación, ni nada fuera de gating de acceso/render).
//
// Con start_at/end_at ya existentes en la tabla `events` (NOT NULL desde 001_schema.sql),
// el evento puede "encenderse" y "apagarse" solo comparando la hora actual contra esas
// columnas — cero infraestructura, cero ventana de fallo si un cron no corre.
//
// `status` se conserva para lo que SÍ es una decisión humana real:
//   - 'live' manual: el admin quiere activar el evento YA, sin esperar start_at
//     (ej. el evento arrancó antes de lo previsto).
//   - 'ended' manual: el admin quiere cerrar el evento ANTES de end_at
//     (ej. el evento terminó antes de lo previsto, o hay que cortar el acceso).
//
// Regla resultante (status 'ended' siempre gana; luego live = manual O ventana horaria):
//   isEnded = status === 'ended' || (end_at && now > end_at)
//   isLive  = !isEnded && (status === 'live' || (start_at && now >= start_at))
//   isDraft = !isLive && !isEnded

export type EventStatus = 'draft' | 'live' | 'ended'

export interface EventLiveState {
  isLive: boolean
  isDraft: boolean
  isEnded: boolean
}

export function getEventLiveState(
  status: string | null | undefined,
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  now: Date = new Date()
): EventLiveState {
  const startTime = startAt ? new Date(startAt).getTime() : null
  const endTime = endAt ? new Date(endAt).getTime() : null
  const nowTime = now.getTime()

  const isEnded =
    status === 'ended' || (endTime !== null && !Number.isNaN(endTime) && nowTime > endTime)

  const isLive =
    !isEnded &&
    (status === 'live' || (startTime !== null && !Number.isNaN(startTime) && nowTime >= startTime))

  const isDraft = !isLive && !isEnded

  return { isLive, isDraft, isEnded }
}
