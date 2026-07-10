'use client'
// components/assemblies/FloorModeratorPanel.tsx — Panel de manos levantadas para el moderador

import { useState, useEffect, useCallback, useRef } from 'react'

interface FloorRequest {
  id: string
  attendee_id: string
  attendee_name: string
  unit_number: string | null
  status: 'pending' | 'granted'
  requested_at: string
  granted_at: string | null
}

interface Props {
  assemblyId: string
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default function FloorModeratorPanel({ assemblyId }: Props) {
  const [requests, setRequests] = useState<FloorRequest[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const prevCountRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/floor`)
      if (!res.ok) return
      const data: FloorRequest[] = await res.json()
      // Notificación de nueva mano levantada
      const pending = data.filter(r => r.status === 'pending').length
      if (pending > prevCountRef.current) {
        // Nueva solicitud — vibración si está disponible
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
      }
      prevCountRef.current = pending
      setRequests(data)
    } catch {}
  }, [assemblyId])

  useEffect(() => {
    fetchRequests()
    pollRef.current = setInterval(fetchRequests, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchRequests])

  async function handleGrant(requestId: string) {
    setActionLoading(requestId)
    try {
      await fetch(`/api/admin/assemblies/${assemblyId}/floor?requestId=${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'granted' }),
      })
      fetchRequests()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRevoke(requestId: string) {
    setActionLoading(requestId)
    try {
      await fetch(`/api/admin/assemblies/${assemblyId}/floor?requestId=${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      })
      fetchRequests()
    } finally {
      setActionLoading(null)
    }
  }

  const pending = requests.filter(r => r.status === 'pending')
  const granted = requests.filter(r => r.status === 'granted')

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Turno de palabra</h3>
        {pending.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-300">
            <span className="animate-pulse">✋</span>
            {pending.length} {pending.length === 1 ? 'solicitud' : 'solicitudes'}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {requests.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-3">Sin solicitudes activas</p>
        )}

        {/* Speakers activos */}
        {granted.map(r => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-green-300 truncate">{r.attendee_name}</p>
                {r.unit_number && (
                  <p className="text-xs text-gray-500">Apto {r.unit_number}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => handleRevoke(r.id)}
              disabled={actionLoading === r.id}
              className="flex-shrink-0 px-2.5 py-1 rounded-md bg-red-700/80 hover:bg-red-600 text-white text-xs transition-colors disabled:opacity-50"
            >
              {actionLoading === r.id ? '…' : 'Revocar'}
            </button>
          </div>
        ))}

        {/* Manos levantadas */}
        {pending.map(r => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm">✋</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{r.attendee_name}</p>
                <p className="text-xs text-gray-500">
                  {r.unit_number ? `Apto ${r.unit_number} · ` : ''}{timeAgo(r.requested_at)}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleGrant(r.id)}
              disabled={actionLoading === r.id}
              className="flex-shrink-0 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {actionLoading === r.id ? '…' : 'Conceder'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
