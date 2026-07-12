'use client'
// app/assemblies/[org]/[assembly]/watch/page.tsx — Sala de asamblea para asistentes

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Countdown from '@/components/Countdown'
import FloorWidget from '@/components/assemblies/FloorWidget'
import { createClient } from '@/lib/supabase/client'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface PlanchaOption { id: string; name: string; description: string | null }

interface Motion {
  id: string
  title: string
  description: string | null
  motion_type: 'informativo' | 'voto_simple' | 'voto_plancha' | 'voto_adhoc'
  status: 'pending' | 'open' | 'closed'
  majority_type: 'simple' | 'calificada'
  majority_pct: number
  order_index: number
  closes_at: string | null
  duration_seconds: number | null
  plancha_options: PlanchaOption[]
  tally: Record<string, number>
  my_vote: string | null
  represented_votes: Array<{ unit_id: string; unit_number: string; vote: string | null }>
}

interface AssemblyDocument {
  id: string
  title: string
  url: string
  order_index: number
}

interface AssemblyState {
  assembly: {
    id: string
    title: string
    status: 'draft' | 'active' | 'ended'
    current_convocatoria: 'primera' | 'segunda'
    stream_url: string | null
    org_name: string
    org_color: string
  }
  quorum: {
    pct: number
    threshold: number
    reached: boolean
    connected_count: number
  }
  motions: Motion[]
  documents: AssemblyDocument[]
  attendee: {
    id: string
    name: string
    unit_number: string | null
    role: string
    represented_units: Array<{ unit_id: string; unit_number: string }>
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const VOTE_LABELS: Record<string, string> = {
  si: 'Sí', no: 'No', abstencion: 'Abstención',
}

const MOTION_TYPE_LABELS: Record<string, string> = {
  informativo: 'Informativo', voto_simple: 'Votación', voto_plancha: 'Plancha', voto_adhoc: 'Ad-hoc',
}

function toEmbedUrl(url: string): string {
  try {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`
    return url
  } catch { return url }
}

function QuorumBar({ pct, threshold, reached }: { pct: number; threshold: number; reached: boolean }) {
  const fill = threshold > 0 ? Math.min(100, (pct / threshold) * 100) : 100
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{pct.toFixed(1)}% presente</span>
        <span className={reached ? 'text-green-400 font-semibold' : 'text-yellow-400'}>
          {reached ? '✓ Quórum alcanzado' : `Falta ${(threshold - pct).toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${reached ? 'bg-green-500' : 'bg-yellow-500'}`}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  )
}

function TallyBar({ motion, totalCoef }: { motion: Motion; totalCoef?: number }) {
  const entries = Object.entries(motion.tally)
  if (entries.length === 0) return <p className="text-xs text-gray-600">Sin votos aún.</p>

  const total = entries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="space-y-1.5 mt-2">
      {entries.sort((a, b) => b[1] - a[1]).map(([val, coef]) => {
        const pct = total > 0 ? (coef / total) * 100 : 0
        const label = motion.motion_type === 'voto_plancha'
          ? (motion.plancha_options.find(p => p.id === val)?.name ?? val)
          : (VOTE_LABELS[val] ?? val)
        return (
          <div key={val} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{label}</span>
              <span className="text-gray-500">{pct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${val === 'si' ? 'bg-green-500' : val === 'no' ? 'bg-red-500' : 'bg-gray-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
      {totalCoef && (
        <p className="text-xs text-gray-600 pt-1">
          Coef. participante: {((total / totalCoef) * 100).toFixed(1)}% del total
        </p>
      )}
    </div>
  )
}

// ── Componente de voto ─────────────────────────────────────────────────────────

function VotePanel({
  motion, orgColor, onVote, voting,
}: {
  motion: Motion
  orgColor: string
  onVote: (motionId: string, value: string) => Promise<void>
  voting: string | null
}) {
  const hasVoted = motion.my_vote !== null

  if (motion.motion_type === 'informativo') return null
  if (motion.status !== 'open') return null

  const isVoting = voting === motion.id

  if (motion.motion_type === 'voto_simple') {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Tu voto</p>
        <div className="flex gap-3">
          {(['si', 'no', 'abstencion'] as const).map(val => (
            <button
              key={val}
              onClick={() => onVote(motion.id, val)}
              disabled={isVoting}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-60 ${
                motion.my_vote === val
                  ? val === 'si'
                    ? 'bg-green-600 border-green-500 text-white'
                    : val === 'no'
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-gray-600 border-gray-500 text-white'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              {isVoting && motion.my_vote !== val ? (
                <span className="flex items-center justify-center gap-1">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              ) : (
                <>{VOTE_LABELS[val]}{motion.my_vote === val && ' ✓'}</>
              )}
            </button>
          ))}
        </div>
        {hasVoted && (
          <p className="text-xs text-gray-500">Puedes cambiar tu voto mientras la votación esté abierta.</p>
        )}
      </div>
    )
  }

  if (motion.motion_type === 'voto_plancha') {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Selecciona una plancha</p>
        <div className="space-y-2">
          {motion.plancha_options.map(opt => (
            <button
              key={opt.id}
              onClick={() => onVote(motion.id, opt.id)}
              disabled={isVoting}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all disabled:opacity-60 ${
                motion.my_vote === opt.id
                  ? 'border-purple-500 bg-purple-500/15 text-white'
                  : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{opt.name}</p>
                  {opt.description && <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>}
                </div>
                {motion.my_vote === opt.id && <span className="text-purple-400 text-sm">✓</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // voto_adhoc — campo libre
  return (
    <AdhocVotePanel motion={motion} onVote={onVote} isVoting={isVoting} />
  )
}

function AdhocVotePanel({ motion, onVote, isVoting }: {
  motion: Motion
  onVote: (motionId: string, value: string) => Promise<void>
  isVoting: boolean
}) {
  const [val, setVal] = useState(motion.my_vote ?? '')

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">Tu voto</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Escribe tu voto..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
        />
        <button
          onClick={() => val.trim() && onVote(motion.id, val.trim())}
          disabled={isVoting || !val.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {isVoting ? '...' : 'Votar'}
        </button>
      </div>
      {motion.my_vote && <p className="text-xs text-gray-500">Tu voto actual: "{motion.my_vote}"</p>}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function AssemblyWatchPage() {
  const params = useParams()
  const org = params.org as string
  const assembly = params.assembly as string

  const [state, setState] = useState<AssemblyState | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)  // motionId en progreso
  const [voteError, setVoteError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [voteAlert, setVoteAlert] = useState<string | null>(null) // título de nueva votación abierta
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const openMotionIdsRef = useRef<Set<string>>(new Set())

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/assembly/${org}/${assembly}/state`)
      if (res.status === 401) { window.location.href = `/assemblies/${org}/${assembly}`; return }
      if (res.ok) {
        const data: AssemblyState = await res.json()
        setState(data)
        if (data.assembly.status === 'ended') setEnded(true)
        // Detectar nuevas votaciones abiertas
        const newOpenIds = new Set(data.motions.filter(m => m.status === 'open').map(m => m.id))
        data.motions.forEach(m => {
          if (m.status === 'open' && !openMotionIdsRef.current.has(m.id)) {
            setVoteAlert(m.title)
            setTimeout(() => setVoteAlert(null), 8000)
          }
        })
        openMotionIdsRef.current = newOpenIds
      }
    } catch {}
  }, [org, assembly])

  const ping = useCallback(async () => {
    const res = await fetch(`/api/assembly/${org}/${assembly}/ping`, { method: 'POST' })
    if (res.status === 410) setEnded(true)
    if (res.status === 401) window.location.href = `/assemblies/${org}/${assembly}`
  }, [org, assembly])

  useEffect(() => {
    fetchState()
    pingRef.current = setInterval(ping, 30_000)
    pollRef.current = setInterval(fetchState, 15_000)
    return () => {
      if (pingRef.current) clearInterval(pingRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchState, ping])

  // Supabase Realtime — notificación instantánea cuando abre una votación
  useEffect(() => {
    if (!state?.assembly.id) return
    const assemblyId = state.assembly.id
    const supabase = createClient()
    const channel = supabase
      .channel(`motions-${assemblyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'assembly_motions', filter: `assembly_id=eq.${assemblyId}` },
        () => { fetchState() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [state?.assembly.id, fetchState])

  async function handleLogout() {
    await fetch(`/api/assembly/${org}/${assembly}/logout`, { method: 'POST' })
    window.location.href = `/assemblies/${org}/${assembly}`
  }

  async function handleVote(motionId: string, voteValue: string) {
    setVoting(motionId)
    setVoteError(null)
    try {
      const res = await fetch(`/api/assembly/${org}/${assembly}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motion_id: motionId, vote_value: voteValue }),
      })
      const data = await res.json()
      if (!res.ok) { setVoteError(data.error); return }

      // Actualizar optimistamente el estado local
      setState(prev => {
        if (!prev) return prev
        return {
          ...prev,
          motions: prev.motions.map(m => {
            if (m.id !== motionId) return m
            // Revertir voto anterior si lo había
            const newTally = { ...m.tally }
            if (m.my_vote && m.my_vote !== voteValue) {
              const prevCoef = newTally[m.my_vote] ?? 0
              newTally[m.my_vote] = Math.max(0, prevCoef - data.total_coefficient)
            }
            newTally[voteValue] = (newTally[voteValue] ?? 0) + data.total_coefficient
            return { ...m, my_vote: voteValue, tally: newTally }
          }),
        }
      })
    } finally {
      setVoting(null)
    }
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Asamblea finalizada</h1>
          <p className="text-gray-400 text-sm">Gracias por participar. El acta será compartida próximamente.</p>
        </div>
      </div>
    )
  }

  if (!state && !loadError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <p className="text-red-400">Error al cargar la asamblea. Recarga la página.</p>
      </div>
    )
  }

  const { assembly: asm, quorum, motions, documents = [], attendee } = state
  const orgColor = asm.org_color ?? '#7c3aed'
  const openMotions = motions.filter(m => m.status === 'open')
  const hasRepresentation = attendee.represented_units.length > 0
  const hasStream = !!asm.stream_url
  const isTeams = hasStream && asm.stream_url!.includes('teams.microsoft.com')

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* Banner votación abierta - fixed */}
      {voteAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm animate-bounce">
          <div className="bg-yellow-400 text-gray-900 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3">
            <span className="text-xl">🗳️</span>
            <div>
              <p className="font-bold text-sm">¡Votación abierta!</p>
              <p className="text-xs truncate">{voteAlert}</p>
            </div>
          </div>
        </div>
      )}

      {/* Header sticky */}
      <header className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-6 h-6 rounded-md flex-shrink-0" style={{ backgroundColor: orgColor }} />
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{asm.title}</p>
              <p className="text-gray-500 text-xs hidden sm:block">{asm.org_name}</p>
            </div>
            {asm.status === 'active' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-green-400 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                En curso
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`hidden lg:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              quorum.reached ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
            }`}>
              {quorum.reached ? '✓' : '⚠'} Quórum {quorum.pct.toFixed(0)}%
            </span>
            <span className="text-xs text-gray-400 hidden md:block truncate max-w-[120px]">{attendee.name}</span>
            <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Main — 2 columnas en desktop */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full lg:grid lg:grid-cols-[3fr_2fr]">

          {/* ── COLUMNA IZQUIERDA: Video + Asistente + Floor ── */}
          <div className="lg:overflow-y-auto lg:h-[calc(100vh-57px)] p-4 space-y-4">

            {/* Video embebido */}
            {hasStream && (
              <div className="rounded-xl overflow-hidden bg-black w-full" style={{ aspectRatio: '16/9' }}>
                <iframe
                  src={toEmbedUrl(asm.stream_url!)}
                  className="w-full h-full"
                  allow={isTeams
                    ? 'autoplay; camera; microphone; fullscreen'
                    : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'}
                  allowFullScreen
                />
              </div>
            )}

            {/* Tarjeta asistente — compacta */}
            <div className="flex items-center gap-3 bg-gray-900/60 border border-white/[0.06] rounded-xl px-4 py-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ backgroundColor: orgColor }}
              >
                {attendee.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{attendee.name}</p>
                <p className="text-xs text-gray-500">
                  {attendee.unit_number ? `Unidad ${attendee.unit_number}` : attendee.role}
                  {hasRepresentation && (
                    <span className="text-purple-400 ml-1">
                      · +{attendee.represented_units.length} poder{attendee.represented_units.length !== 1 ? 'es' : ''}: {attendee.represented_units.map(u => u.unit_number).join(', ')}
                    </span>
                  )}
                </p>
              </div>
              <span className="text-xs text-gray-600 capitalize flex-shrink-0">{attendee.role}</span>
            </div>

            {/* Quórum — solo móvil */}
            <div className="lg:hidden bg-gray-900 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quórum</h2>
                <span className="text-xs text-gray-600">
                  {asm.current_convocatoria === 'primera' ? '1ª' : '2ª'} conv. · {quorum.connected_count} conectados
                </span>
              </div>
              <QuorumBar pct={quorum.pct} threshold={quorum.threshold} reached={quorum.reached} />
            </div>

            {/* Turno de palabra — desktop en col izquierda */}
            {asm.status === 'active' && (
              <div className="hidden lg:block">
                <FloorWidget orgSlug={org} assemblySlug={assembly} assemblyStatus={asm.status} />
              </div>
            )}
          </div>

          {/* ── COLUMNA DERECHA: Quórum + Agenda ── */}
          <div className="lg:overflow-y-auto lg:h-[calc(100vh-57px)] lg:border-l lg:border-white/10 p-4 space-y-3">

            {/* Quórum — solo desktop */}
            <div className="hidden lg:block bg-gray-900 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quórum</h2>
                <span className="text-xs text-gray-600">
                  {asm.current_convocatoria === 'primera' ? '1ª' : '2ª'} conv. · {quorum.connected_count} conectados
                </span>
              </div>
              <QuorumBar pct={quorum.pct} threshold={quorum.threshold} reached={quorum.reached} />
            </div>

            {/* Alerta votación abierta */}
            {openMotions.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3">
                <p className="text-yellow-400 text-sm font-semibold">
                  {openMotions.length === 1 ? '● Votación abierta' : `● ${openMotions.length} votaciones abiertas`}
                </p>
              </div>
            )}

            {/* Error de voto */}
            {voteError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{voteError}</p>
              </div>
            )}

            {/* Orden del día */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Orden del día</h2>

              {motions.length === 0 ? (
                <div className="bg-gray-900 border border-white/10 rounded-xl p-6 text-center">
                  <p className="text-gray-500 text-sm">El orden del día aún no se ha publicado.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {motions.map((motion, idx) => (
                    <div
                      key={motion.id}
                      className={`bg-gray-900 border rounded-xl transition-colors ${
                        motion.status === 'open'
                          ? 'border-yellow-500/40 p-4'
                          : 'border-white/[0.06] p-3'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-gray-600 text-xs flex-shrink-0 mt-0.5 w-4 text-right">{idx + 1}</span>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium leading-snug ${motion.status === 'open' ? 'text-white' : 'text-gray-400'}`}>
                              {motion.title}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {motion.status === 'open' && (
                                <>
                                  {motion.closes_at && <Countdown closesAt={motion.closes_at} onExpire={fetchState} />}
                                  <span className="text-xs font-semibold text-yellow-400 animate-pulse">● Abierta</span>
                                </>
                              )}
                              {motion.status === 'closed' && <span className="text-xs text-blue-400">Cerrada</span>}
                              {motion.status === 'pending' && <span className="text-xs text-gray-600">{MOTION_TYPE_LABELS[motion.motion_type]}</span>}
                            </div>
                          </div>

                          {motion.description && motion.status === 'open' && (
                            <p className="text-xs text-gray-500">{motion.description}</p>
                          )}

                          {motion.status === 'open' && (
                            <VotePanel motion={motion} orgColor={orgColor} onVote={handleVote} voting={voting} />
                          )}

                          {(motion.status === 'closed' || (motion.status === 'open' && motion.my_vote)) && Object.keys(motion.tally).length > 0 && (
                            <TallyBar motion={motion} />
                          )}

                          {hasRepresentation && motion.represented_votes.length > 0 && motion.status !== 'pending' && (
                            <div className="pt-1.5 border-t border-white/5">
                              <div className="flex flex-wrap gap-1.5">
                                {motion.represented_votes.map(rv => (
                                  <span
                                    key={rv.unit_id}
                                    className={`text-xs px-2 py-0.5 rounded-full border ${
                                      rv.vote ? 'border-purple-500/40 text-purple-400 bg-purple-500/10' : 'border-white/10 text-gray-600'
                                    }`}
                                  >
                                    U{rv.unit_number}{rv.vote ? `: ${VOTE_LABELS[rv.vote] ?? motion.plancha_options.find(o => o.id === rv.vote)?.name ?? rv.vote}` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Documentos de la asamblea */}
            {documents && documents.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Documentos</h2>
                <div className="space-y-1.5">
                  {documents.map(doc => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 bg-gray-900 border border-white/10 rounded-xl px-4 py-3 hover:border-purple-500/40 hover:bg-white/5 transition-colors group"
                    >
                      <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm text-white flex-1">{doc.title}</span>
                      <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-purple-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Turno de palabra — móvil al final */}
            {asm.status === 'active' && (
              <div className="lg:hidden">
                <FloorWidget orgSlug={org} assemblySlug={assembly} assemblyStatus={asm.status} />
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  )
}
