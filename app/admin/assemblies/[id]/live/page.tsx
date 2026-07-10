'use client'
// app/admin/assemblies/[id]/live/page.tsx — Panel moderador en vivo (pantalla completa)

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Countdown from '@/components/Countdown'
import FloorModeratorPanel from '@/components/assemblies/FloorModeratorPanel'
import type { AssemblyMotion, AssemblyQuorum } from '@/types'

interface LiveAssembly {
  title: string
  status: string
  current_convocatoria: 'primera' | 'segunda'
  organizations: { name: string; primary_color: string }
}

interface QrInfo { token: string; url: string; expires_at: string }

const MOTION_TYPE_LABELS: Record<string, string> = {
  informativo: 'Info', voto_simple: 'Sí/No', voto_plancha: 'Plancha', voto_adhoc: 'Ad-hoc',
}

const DURATION_OPTIONS = [
  { label: 'Sin límite', seconds: 0 },
  { label: '2 min', seconds: 120 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
]

export default function LiveModeratePage() {
  const params = useParams()
  const router = useRouter()
  const assemblyId = params.id as string

  const [assembly, setAssembly] = useState<LiveAssembly | null>(null)
  const [motions, setMotions] = useState<AssemblyMotion[]>([])
  const [quorum, setQuorum] = useState<AssemblyQuorum | null>(null)
  const [qrInfo, setQrInfo] = useState<QrInfo | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // selector de duración: motionId → duracion seleccionada (0 = sin límite)
  const [durationPicker, setDurationPicker] = useState<string | null>(null)
  const [selectedDuration, setSelectedDuration] = useState(300) // default 5 min
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [aRes, mRes, qRes] = await Promise.all([
        fetch(`/api/admin/assemblies/${assemblyId}`),
        fetch(`/api/admin/assemblies/${assemblyId}/motions`),
        fetch(`/api/admin/assemblies/${assemblyId}/quorum`),
      ])
      if (aRes.status === 401) { router.push('/admin'); return }
      if (aRes.ok) {
        const a = await aRes.json()
        setAssembly(a)
      }
      if (mRes.ok) setMotions(await mRes.json())
      if (qRes.ok) setQuorum(await qRes.json())
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }, [assemblyId, router])

  useEffect(() => {
    fetchAll()
    intervalRef.current = setInterval(fetchAll, 10_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchAll])

  async function handleMotionStatus(motionId: string, status: 'open' | 'closed' | 'pending', durationSeconds?: number) {
    setActionLoading(motionId)
    setDurationPicker(null)
    try {
      const body: Record<string, unknown> = { status }
      if (status === 'open' && durationSeconds && durationSeconds > 0) {
        body.duration_seconds = durationSeconds
      }
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/motions/${motionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        setMotions(prev => prev.map(m => m.id === motionId ? { ...m, ...data } : m))
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleStatusChange(next: 'active' | 'ended') {
    setActionLoading('status')
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        const data = await res.json()
        setAssembly(prev => prev ? { ...prev, status: data.status } : prev)
      }
    } finally { setActionLoading(null) }
  }

  async function handleConvocatoria() {
    if (!assembly) return
    const next = assembly.current_convocatoria === 'primera' ? 'segunda' : 'primera'
    const res = await fetch(`/api/admin/assemblies/${assemblyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_convocatoria: next }),
    })
    if (res.ok) setAssembly(prev => prev ? { ...prev, current_convocatoria: next } : prev)
  }

  async function loadQr() {
    if (qrInfo) { setShowQr(v => !v); return }
    const res = await fetch(`/api/admin/assemblies/${assemblyId}/qr`)
    if (res.ok) { setQrInfo(await res.json()); setShowQr(true) }
  }

  async function copyUrl() {
    if (!qrInfo) return
    await navigator.clipboard.writeText(qrInfo.url)
  }

  if (loading || !assembly) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const isActive = assembly.status === 'active'
  const orgColor = assembly.organizations?.primary_color ?? '#7c3aed'
  const openMotion = motions.find(m => m.status === 'open')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Top bar */}
      <header className="flex-shrink-0 bg-gray-900 border-b border-white/10 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/admin/assemblies/${assemblyId}`} className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isActive ? '#4ade80' : '#6b7280' }}
            />
            <div>
              <span className="text-white font-semibold text-sm">{assembly.title}</span>
              <span className="text-gray-500 text-xs ml-2">{assembly.organizations?.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/assemblies/${assemblyId}/sala`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Pantalla sala
            </Link>
            <span className="text-xs text-gray-600">
              {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
            </span>
            {assembly.status === 'draft' && (
              <button
                onClick={() => handleStatusChange('active')}
                disabled={actionLoading === 'status'}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                Iniciar asamblea
              </button>
            )}
            {assembly.status === 'active' && (
              <button
                onClick={() => handleStatusChange('ended')}
                disabled={actionLoading === 'status'}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-gray-600 hover:bg-gray-700 disabled:opacity-60 transition-colors"
              >
                Finalizar
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex gap-0 overflow-hidden">

        {/* Panel izquierdo — Quórum + Controles */}
        <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-white/10 flex flex-col overflow-y-auto">

          {/* Quórum */}
          <div className="p-4 border-b border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quórum</h2>
              <button onClick={handleConvocatoria} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                {assembly.current_convocatoria === 'primera' ? '→ 2ª conv.' : '→ 1ª conv.'}
              </button>
            </div>

            {quorum ? (
              <div className="space-y-3">
                <div className="text-center">
                  <p className={`text-5xl font-bold tabular-nums ${quorum.reached ? 'text-green-400' : 'text-yellow-400'}`}>
                    {quorum.pct.toFixed(1)}
                    <span className="text-2xl">%</span>
                  </p>
                  <p className={`text-xs mt-1 font-medium ${quorum.reached ? 'text-green-500' : 'text-yellow-500'}`}>
                    {quorum.reached ? '✓ Quórum alcanzado' : `Requiere ${quorum.threshold.toFixed(1)}%`}
                  </p>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${quorum.reached ? 'bg-green-500' : 'bg-yellow-500'}`}
                    style={{ width: `${Math.min(100, quorum.threshold > 0 ? (quorum.pct / quorum.threshold) * 100 : 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-white">{quorum.connected_count}</p>
                    <p className="text-xs text-gray-600">Conectados</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-blue-400">{quorum.presencial_count}</p>
                    <p className="text-xs text-gray-600">Presencial</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 text-center">
                  {assembly.current_convocatoria === 'primera' ? '1ª' : '2ª'} convocatoria
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-5xl font-bold text-gray-700">—</p>
                <p className="text-xs text-gray-600 mt-1">Sin datos</p>
              </div>
            )}
          </div>

          {/* Turno de palabra */}
          {isActive && (
            <div className="p-4 border-b border-white/10">
              <FloorModeratorPanel assemblyId={assemblyId} />
            </div>
          )}

          {/* Presencial QR */}
          <div className="p-4 border-b border-white/10 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Acceso presencial</h2>
            <button
              onClick={loadQr}
              className="w-full px-3 py-2 rounded-lg text-xs font-medium text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              {showQr ? 'Ocultar URL' : '🔗 Mostrar URL de check-in'}
            </button>
            {showQr && qrInfo && (
              <div className="space-y-2">
                <div className="bg-white/5 border border-white/10 rounded-lg p-2">
                  <p className="text-xs text-gray-400 break-all font-mono leading-relaxed">{qrInfo.url}</p>
                </div>
                <button
                  onClick={copyUrl}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                >
                  Copiar URL
                </button>
                <p className="text-xs text-gray-600">Genera un QR con esta URL desde cualquier app generadora.</p>
              </div>
            )}
          </div>

          {/* Punto activo */}
          {openMotion && (
            <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">● Votación abierta</h2>
                {openMotion.closes_at && (
                  <Countdown
                    closesAt={openMotion.closes_at}
                    onExpire={fetchAll}
                  />
                )}
              </div>
              <p className="text-sm text-white font-medium">{openMotion.title}</p>
              {openMotion.duration_seconds && (
                <p className="text-xs text-yellow-600">
                  {Math.floor(openMotion.duration_seconds / 60)} min programados
                </p>
              )}
              <button
                onClick={() => handleMotionStatus(openMotion.id, 'closed')}
                disabled={actionLoading === openMotion.id}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white bg-gray-600 hover:bg-gray-700 disabled:opacity-60 transition-colors"
              >
                {actionLoading === openMotion.id ? '...' : 'Cerrar votación'}
              </button>
            </div>
          )}
        </aside>

        {/* Panel derecho — Orden del día */}
        <main className="flex-1 overflow-y-auto p-5">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Orden del día</h2>
              <span className="text-xs text-gray-600">{motions.length} puntos</span>
            </div>

            {motions.length === 0 ? (
              <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
                <p className="text-gray-500 text-sm">No hay puntos en el orden del día.</p>
                <Link href={`/admin/assemblies/${assemblyId}`} className="text-purple-400 text-sm mt-2 block">
                  Ir al panel para agregar →
                </Link>
              </div>
            ) : (
              motions.map((motion, idx) => (
                <div
                  key={motion.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    motion.status === 'open'
                      ? 'bg-yellow-500/5 border-yellow-500/30'
                      : motion.status === 'closed'
                      ? 'bg-white/3 border-white/5'
                      : 'bg-gray-900 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600 text-sm w-6 flex-shrink-0 text-center">{idx + 1}</span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white">{motion.title}</p>
                        <span className="text-xs text-gray-600">{MOTION_TYPE_LABELS[motion.motion_type]}</span>
                        {motion.motion_type !== 'informativo' && (
                          <span className="text-xs text-gray-700">
                            {motion.majority_type === 'calificada' ? `${motion.majority_pct}% cal.` : 'simple'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Estado */}
                      <span className={`text-xs font-medium ${
                        motion.status === 'open' ? 'text-yellow-400' : motion.status === 'closed' ? 'text-blue-400' : 'text-gray-600'
                      }`}>
                        {motion.status === 'open' ? '● Abierta' : motion.status === 'closed' ? 'Cerrada' : 'Pendiente'}
                      </span>

                      {/* Botón de acción */}
                      {motion.motion_type !== 'informativo' && (
                        <>
                          {motion.status === 'pending' && !openMotion && (
                            <div className="flex flex-col items-end gap-1.5">
                              {durationPicker === motion.id ? (
                                // Selector de duración inline
                                <div className="flex flex-wrap gap-1.5 justify-end">
                                  {DURATION_OPTIONS.map(opt => (
                                    <button
                                      key={opt.seconds}
                                      onClick={() => handleMotionStatus(motion.id, 'open', opt.seconds)}
                                      disabled={!!actionLoading}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                                        selectedDuration === opt.seconds
                                          ? 'bg-green-600 border-green-500 text-white'
                                          : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                  <button
                                    onClick={() => setDurationPicker(null)}
                                    className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300 transition-colors"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setDurationPicker(motion.id); setSelectedDuration(300) }}
                                  disabled={!!actionLoading}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 transition-colors"
                                >
                                  Abrir votación ▾
                                </button>
                              )}
                            </div>
                          )}
                          {motion.status === 'pending' && openMotion && (
                            <span className="text-xs text-gray-600 italic">Espera</span>
                          )}
                          {motion.status === 'open' && (
                            <div className="flex items-center gap-2">
                              {motion.closes_at && (
                                <Countdown closesAt={motion.closes_at} onExpire={fetchAll} />
                              )}
                              <button
                                onClick={() => handleMotionStatus(motion.id, 'closed')}
                                disabled={!!actionLoading}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gray-600 hover:bg-gray-700 disabled:opacity-60 transition-colors"
                              >
                                {actionLoading === motion.id ? '...' : 'Cerrar'}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
