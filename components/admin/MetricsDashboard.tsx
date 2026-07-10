'use client'
// components/admin/MetricsDashboard.tsx — Metricas + asistentes conectados + kick

import { useState, useEffect, useCallback } from 'react'
import { formatDuration } from '@/lib/utils'
import type { EventMetrics, ConnectedAttendee } from '@/types'

interface MetricsDashboardProps {
  eventId: string
  status: 'draft' | 'live' | 'ended'
  onKick?: () => void
}

function timeAgo(isoDate: string): string {
  const secs = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

export default function MetricsDashboard({ eventId, status, onKick }: MetricsDashboardProps) {
  const [metrics, setMetrics] = useState<EventMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [kickedNames, setKickedNames] = useState<Set<string>>(new Set())

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/metrics`)
      if (res.ok) {
        const data: EventMetrics = await res.json()
        setMetrics(data)
        setLastUpdate(new Date())
        // Limpiar kicks locales — si el usuario reaparece en métricas (ej. tras restaurar acceso), mostrar botón nuevamente
        setKickedNames(new Set())
      }
    } catch {
      // fallo silencioso
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    fetchMetrics()
    if (status === 'live') {
      const interval = setInterval(fetchMetrics, 30_000)
      return () => clearInterval(interval)
    }
  }, [fetchMetrics, status])

  async function handleKick(attendee: ConnectedAttendee) {
    if (kickingId) return
    if (!confirm(`¿Expulsar a ${attendee.full_name} del evento?`)) return

    setKickingId(attendee.attendeeId)
    try {
      const res = await fetch(
        `/api/admin/events/${eventId}/attendees/${attendee.attendeeId}/kick`,
        { method: 'POST' }
      )
      if (res.ok) {
        setKickedNames((prev) => new Set(prev).add(attendee.attendeeId))
        await fetchMetrics()
        onKick?.()
      }
    } catch {
      // fallo silencioso
    } finally {
      setKickingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const cards = [
    {
      label: 'Conectados ahora',
      value: metrics?.connected_now ?? 0,
      color: status === 'live' ? 'text-green-400' : 'text-white/50',
      pulse: status === 'live' && (metrics?.connected_now ?? 0) > 0,
    },
    {
      label: 'Total ingresaron',
      value: metrics?.total_joined ?? 0,
      color: 'text-blue-400',
      pulse: false,
    },
    {
      label: 'Duracion promedio',
      value: formatDuration(metrics?.avg_duration_seconds ?? null),
      color: 'text-purple-400',
      pulse: false,
    },
  ]

  const connected = metrics?.connected_attendees ?? []

  return (
    <div className="space-y-6">
      {/* Tarjetas de metricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-xs font-medium uppercase tracking-wider">
                {card.label}
              </span>
              {card.pulse && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
              )}
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Lista de asistentes conectados */}
      {status === 'live' && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              En vivo ahora
            </h3>
            <button
              onClick={fetchMetrics}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Actualizar
            </button>
          </div>

          {connected.length === 0 ? (
            <div className="px-5 py-6 text-center text-gray-500 text-sm">
              Ningún asistente conectado
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {connected.map((att) => (
                <div
                  key={att.sessionId}
                  className={`flex items-center justify-between px-5 py-3 transition-colors ${
                    kickedNames.has(att.attendeeId) ? 'opacity-40' : 'hover:bg-white/3'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{att.full_name}</p>
                      <p className="text-xs text-gray-500 font-mono">{att.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <span className="text-xs text-gray-500 hidden sm:block">
                      {timeAgo(att.login_at)}
                    </span>
                    {!kickedNames.has(att.attendeeId) && (
                      <button
                        onClick={() => handleKick(att)}
                        disabled={kickingId === att.attendeeId}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                        aria-label={`Expulsar a ${att.full_name}`}
                      >
                        {kickingId === att.attendeeId ? '...' : 'Expulsar'}
                      </button>
                    )}
                    {kickedNames.has(att.attendeeId) && (
                      <span className="text-xs text-red-400/60">Expulsado</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lastUpdate && (
        <p className="text-white/25 text-xs text-right">
          Actualizado: {lastUpdate.toLocaleTimeString('es-CO')}
          {status === 'live' && ' · Cada 30s'}
        </p>
      )}
    </div>
  )
}
