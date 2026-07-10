'use client'
// app/admin/assemblies/[id]/sala/page.tsx — Pantalla sala (proyector en vivo)

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import QRCode from 'react-qr-code'
import Countdown from '@/components/Countdown'

type AgoraRTC = typeof import('agora-rtc-sdk-ng').default
type IAgoraRTCClient = import('agora-rtc-sdk-ng').IAgoraRTCClient
type IRemoteVideoTrack = import('agora-rtc-sdk-ng').IRemoteVideoTrack

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FloorRequest {
  id: string
  attendee_name: string
  unit_number: string | null
  status: 'pending' | 'granted'
  requested_at: string
  granted_at: string | null
}

interface SalaData {
  assembly: {
    id: string
    title: string
    slug: string
    status: string
    scheduled_at: string
    current_convocatoria: string
    stream_url: string | null
    org: { name: string; slug: string; primary_color: string }
  }
  quorum: {
    pct: number
    threshold: number
    reached: boolean
    connected_count: number
    presencial_count: number
    current_coef: number
    total_coef: number
  }
  motions: Array<{
    id: string
    title: string
    description: string | null
    motion_type: string
    status: string
    order_index: number
    closes_at: string | null
    closed_at: string | null
    quorum_at_open: number | null
    quorum_at_close: number | null
    plancha_options: Array<{ id: string; name: string; order_index: number }>
    tally: Record<string, number>
    voted_units: number
  }>
  floor_requests: FloorRequest[]
  sala_agora: { app_id: string; channel: string; token: string; uid: number } | null
}

const MOTION_ICONS: Record<string, string> = {
  pending: '○', open: '▶', closed: '✓',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-500', open: 'text-yellow-400', closed: 'text-green-400',
}
const VOTE_LABELS: Record<string, string> = {
  si: 'Sí', no: 'No', abstencion: 'Abstención',
}

function toEmbedUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const vid = u.searchParams.get('v') ?? u.pathname.split('/').pop()
      return vid ? `https://www.youtube.com/embed/${vid}?autoplay=1&mute=0` : null
    }
    return url
  } catch { return url }
}

function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="font-mono tabular-nums">{time}</span>
}

function TallyBars({ motion, accentColor }: { motion: SalaData['motions'][0]; accentColor: string }) {
  const { tally, plancha_options, motion_type, voted_units } = motion
  const total = Object.values(tally).reduce((s, v) => s + v, 0)

  const entries: Array<{ label: string; value: number; color: string; id: string }> =
    motion_type === 'voto_plancha'
      ? plancha_options.map((o, i) => ({
          id: o.id, label: o.name, value: tally[o.id] ?? 0,
          color: i === 0 ? accentColor : i === 1 ? '#22d3ee' : i === 2 ? '#fb923c' : '#a78bfa',
        }))
      : ['si', 'no', 'abstencion'].map(k => ({
          id: k, label: VOTE_LABELS[k], value: tally[k] ?? 0,
          color: k === 'si' ? '#22c55e' : k === 'no' ? '#ef4444' : '#6b7280',
        }))

  if (total === 0 && voted_units === 0)
    return <p className="text-gray-600 text-xl">Sin votos registrados</p>

  return (
    <div className="space-y-4 w-full">
      {entries.map(e => {
        const pct = total > 0 ? (e.value / total) * 100 : 0
        return (
          <div key={e.id} className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-white text-2xl font-medium">{e.label}</span>
              <span className="text-3xl font-bold tabular-nums" style={{ color: e.color }}>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: e.color }} />
            </div>
          </div>
        )
      })}
      <p className="text-gray-500 text-base pt-1">{voted_units} unidades · {total.toFixed(4)} coef.</p>
    </div>
  )
}

function FloorPanel({ requests, accentColor }: { requests: FloorRequest[]; accentColor: string }) {
  const granted = requests.filter(r => r.status === 'granted')
  const pending = requests.filter(r => r.status === 'pending')

  return (
    <div className="space-y-4">
      {granted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest font-medium" style={{ color: accentColor }}>Hablando ahora</p>
          {granted.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl px-4 py-3 border animate-pulse" style={{ borderColor: accentColor + '60', backgroundColor: accentColor + '15' }}>
              <span className="text-2xl">🎤</span>
              <div>
                <p className="text-white font-bold text-xl">{r.attendee_name}</p>
                {r.unit_number && <p className="text-white/50 text-base">{r.unit_number}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest font-medium text-gray-500">En espera ({pending.length})</p>
          {pending.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl px-4 py-3 bg-white/5 border border-white/10">
              <span className="text-gray-500 font-bold text-xl w-6">{i + 1}</span>
              <div>
                <p className="text-white/80 font-medium text-lg">{r.attendee_name}</p>
                {r.unit_number && <p className="text-gray-600 text-sm">{r.unit_number}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {requests.length === 0 && (
        <p className="text-gray-600 text-lg">Sin solicitudes de palabra</p>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function SalaPage() {
  const params = useParams()
  const router = useRouter()
  const assemblyId = params.id as string

  const [data, setData] = useState<SalaData | null>(null)
  const [error, setError] = useState(false)
  const [showStream, setShowStream] = useState(false)
  const [showFloor, setShowFloor] = useState(false)
  const [showQr, setShowQr] = useState(true)
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)
  const fetchRef = useRef<(() => void) | undefined>(undefined)

  // ── Agora sala viewer ──────────────────────────────────────────────────────
  const agoraRef = useRef<AgoraRTC | null>(null)
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null)
  const remoteVideoTrackRef = useRef<IRemoteVideoTrack | null>(null)
  const joinedChannelRef = useRef<string | null>(null)

  const fetchSala = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/sala`)
      if (res.status === 401) { router.push('/admin'); return }
      if (!res.ok) { setError(true); return }
      setData(await res.json())
    } catch { setError(true) }
  }, [assemblyId, router])

  fetchRef.current = fetchSala

  // Cargar SDK Agora (browser only)
  useEffect(() => {
    import('agora-rtc-sdk-ng').then(m => { agoraRef.current = m.default })
    return () => { leaveAgora() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Unirse/salir de Agora cuando cambia el canal del speaker activo
  useEffect(() => {
    if (!data) return
    const sa = data.sala_agora
    if (sa) {
      if (joinedChannelRef.current !== sa.channel) joinAgoraAsViewer(sa)
    } else {
      leaveAgora()
    }
  }, [data?.sala_agora?.channel]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSala()
    const interval = setInterval(() => fetchRef.current?.(), 5000)
    return () => clearInterval(interval)
  }, [fetchSala])

  async function leaveAgora() {
    if (agoraClientRef.current) {
      await agoraClientRef.current.leave().catch(() => {})
      agoraClientRef.current = null
    }
    joinedChannelRef.current = null
    remoteVideoTrackRef.current = null
    setHasRemoteVideo(false)
  }

  async function joinAgoraAsViewer(sa: { app_id: string; channel: string; token: string; uid: number }) {
    if (!agoraRef.current) return
    await leaveAgora()
    const AgoraRTC = agoraRef.current
    AgoraRTC.setLogLevel(4)
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    agoraClientRef.current = client

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType)
      if (mediaType === 'video' && user.videoTrack) {
        remoteVideoTrackRef.current = user.videoTrack
        setHasRemoteVideo(true)
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play() // audio siempre, sin DOM
      }
    })

    client.on('user-unpublished', (_, mediaType) => {
      if (mediaType === 'video') {
        remoteVideoTrackRef.current = null
        setHasRemoteVideo(false)
      }
    })

    try {
      await client.join(sa.app_id, sa.channel, sa.token, sa.uid)
      joinedChannelRef.current = sa.channel
    } catch (err) {
      console.error('Sala Agora join error:', err)
      agoraClientRef.current = null
      joinedChannelRef.current = null
    }
  }

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-red-400 text-xl">Error cargando datos de sala</p>
    </div>
  )
  if (!data) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const { assembly, quorum, motions, floor_requests, sala_agora } = data
  const accent = assembly.org.primary_color ?? '#7c3aed'
  const openMotion = motions.find(m => m.status === 'open')
  const joinUrl = `https://live.timesolutions.com.co/${assembly.org.slug}/${assembly.slug}`
  const joinUrlShort = `live.timesolutions.com.co/${assembly.org.slug}/${assembly.slug}`
  const embedUrl = toEmbedUrl(assembly.stream_url)
  const quorumBarPct = quorum.threshold > 0 ? Math.min(100, (quorum.pct / quorum.threshold) * 100) : 100
  const activeFloor = floor_requests.filter(r => r.status === 'granted' || r.status === 'pending')

  return (
    <div className="min-h-screen bg-[#06060e] text-white flex flex-col select-none overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>

      {/* ── TOP BAR ── */}
      <header className="flex items-center justify-between px-8 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
          <span className="text-white/70 text-lg font-medium">{assembly.org.name}</span>
          <span className="text-white/30">·</span>
          <span className="text-white text-lg font-semibold truncate max-w-[500px]">{assembly.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Toggle QR */}
          <button
            onClick={() => setShowQr(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              showQr ? 'text-white border-white/30 bg-white/10' : 'text-white/40 border-white/10 hover:border-white/30 hover:text-white/70'
            }`}
            title="Mostrar/ocultar QR"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5a.5.5 0 11-1 0 .5.5 0 011 0zM12 8a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            QR
          </button>
          {/* Toggle transmisión */}
          {embedUrl && (
            <button
              onClick={() => setShowStream(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                showStream ? 'text-white border-transparent' : 'text-white/40 border-white/10 hover:border-white/30 hover:text-white/70'
              }`}
              style={showStream ? { backgroundColor: accent + '30', borderColor: accent + '60', color: accent } : {}}
              title="Mostrar/ocultar transmisión"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Transmisión
            </button>
          )}
          {/* Toggle turno de palabra */}
          <button
            onClick={() => setShowFloor(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              showFloor ? 'text-white border-transparent' : 'text-white/40 border-white/10 hover:border-white/30 hover:text-white/70'
            }`}
            style={showFloor ? { backgroundColor: '#f59e0b30', borderColor: '#f59e0b60', color: '#f59e0b' } : {}}
            title="Mostrar/ocultar turno de palabra"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            Turno de palabra
            {activeFloor.length > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{activeFloor.length}</span>
            )}
          </button>
          <span className={`text-sm font-medium px-3 py-1 rounded-full border ${
            assembly.status === 'active' ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-gray-500/40 text-gray-400'
          }`}>
            {assembly.status === 'active' ? '● En curso' : assembly.status === 'ended' ? 'Finalizada' : 'Pendiente'}
          </span>
          <span className="text-white/50 text-xl"><Clock /></span>
        </div>
      </header>

      {/* ── STREAM PANEL (cuando está activo) ── */}
      {showStream && embedUrl && (
        <div className="shrink-0 bg-black border-b border-white/10" style={{ height: '40vh' }}>
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {/* ── MAIN GRID ── */}
      <main className="flex-1 grid overflow-hidden" style={{
        gridTemplateColumns: showFloor
          ? (showQr ? '2fr 3fr 1.5fr' : '1fr 3fr 1.5fr')
          : (showQr ? '2fr 3fr' : '1fr 3fr')
      }}>

        {/* ── COLUMNA IZQUIERDA: Quórum + QR ── */}
        <div className="flex flex-col justify-between p-8 border-r border-white/10 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <p className="text-white/40 text-sm uppercase tracking-widest font-medium mb-2">Quórum</p>
              <p className="font-black tabular-nums leading-none"
                style={{ fontSize: 'clamp(4rem, 8vw, 8rem)', color: quorum.reached ? '#22c55e' : accent }}>
                {quorum.pct.toFixed(1)}%
              </p>
              <p className="text-white/40 text-lg mt-1">Umbral: {quorum.threshold.toFixed(1)}%</p>
            </div>
            <div className="space-y-2">
              <div className="h-5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${quorumBarPct}%`, backgroundColor: quorum.reached ? '#22c55e' : accent }} />
              </div>
              {quorum.reached
                ? <p className="text-green-400 text-lg font-semibold">✓ Quórum alcanzado</p>
                : <p className="text-white/40 text-lg">Faltan {(quorum.threshold - quorum.pct).toFixed(1)}%</p>}
            </div>
            <div className="flex items-center gap-6 text-xl text-white/60">
              <span><span className="text-white font-bold text-2xl">{quorum.connected_count}</span> conectados</span>
              {quorum.presencial_count > 0 && (
                <span><span className="text-white font-bold text-2xl">{quorum.presencial_count}</span> presencial</span>
              )}
            </div>
            <p className="text-white/30 text-base capitalize">
              {quorum.current_coef.toFixed(4)} / {quorum.total_coef.toFixed(4)} · {assembly.current_convocatoria} convocatoria
            </p>
          </div>

          {/* QR grande (toggle) */}
          {showQr && (
            <div className="space-y-4 mt-8">
              <div className="bg-white p-4 rounded-2xl w-full">
                <QRCode
                  value={joinUrl}
                  size={512}
                  bgColor="#ffffff"
                  fgColor="#06060e"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              <div>
                <p className="text-white/30 text-sm mb-0.5">Únete desde tu celular:</p>
                <p className="text-white/60 text-sm font-mono break-all">{joinUrlShort}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── COLUMNA CENTRAL: Votación / Agenda ── */}
        <div className="flex flex-col p-8 overflow-hidden border-r border-white/10">
          {openMotion ? (
            <div className="flex flex-col h-full space-y-8">
              <div className="space-y-5">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-yellow-400 text-lg font-semibold animate-pulse">● VOTACIÓN ABIERTA</span>
                  {openMotion.closes_at && (
                    <span className="text-yellow-300 text-2xl font-bold font-mono">
                      <Countdown closesAt={openMotion.closes_at} onExpire={() => {}} />
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-white/40 text-sm uppercase tracking-widest mb-2">Punto {openMotion.order_index + 1}</p>
                  <h2 className="text-white font-bold leading-tight" style={{ fontSize: 'clamp(1.6rem, 3vw, 3.2rem)' }}>
                    {openMotion.title}
                  </h2>
                  {openMotion.description && (
                    <p className="text-white/50 text-xl mt-3">{openMotion.description}</p>
                  )}
                </div>
                {openMotion.quorum_at_open !== null && (
                  <p className="text-white/30 text-base">Quórum al abrir: {openMotion.quorum_at_open.toFixed(1)}%</p>
                )}
              </div>
              <TallyBars motion={openMotion} accentColor={accent} />
            </div>
          ) : (
            <div className="h-full flex flex-col space-y-4">
              <p className="text-white/40 text-sm uppercase tracking-widest font-medium">Orden del día</p>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {motions.map((m, idx) => {
                  const hasTally = Object.keys(m.tally).length > 0
                  const total = Object.values(m.tally).reduce((s, v) => s + v, 0)
                  const winnerEntry = hasTally ? Object.entries(m.tally).sort((a, b) => b[1] - a[1])[0] : null
                  const winnerPct = winnerEntry && total > 0 ? (winnerEntry[1] / total) * 100 : 0
                  const winnerLabel = winnerEntry
                    ? (m.motion_type === 'voto_plancha'
                        ? m.plancha_options.find(o => o.id === winnerEntry[0])?.name ?? winnerEntry[0]
                        : VOTE_LABELS[winnerEntry[0]] ?? winnerEntry[0])
                    : null
                  return (
                    <div key={m.id} className={`flex items-center gap-4 rounded-xl px-5 py-4 border transition-colors ${
                      m.status === 'open' ? 'bg-yellow-500/10 border-yellow-500/30' :
                      m.status === 'closed' ? 'bg-green-500/5 border-green-500/10' : 'bg-white/3 border-white/5'
                    }`}>
                      <span className={`text-2xl font-bold w-8 shrink-0 ${STATUS_COLORS[m.status]}`}>{MOTION_ICONS[m.status]}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold truncate ${
                          m.status === 'open' ? 'text-white text-xl' :
                          m.status === 'closed' ? 'text-white/70 text-lg' : 'text-white/40 text-lg'
                        }`}>{idx + 1}. {m.title}</p>
                        {m.status === 'closed' && winnerLabel && (
                          <p className="text-green-400 text-sm mt-0.5">{winnerLabel} — {winnerPct.toFixed(1)}%</p>
                        )}
                      </div>
                      {m.status === 'open' && <span className="text-yellow-400 text-base shrink-0 animate-pulse">En curso</span>}
                      {m.status === 'closed' && m.quorum_at_close !== null && (
                        <span className="text-white/30 text-sm shrink-0">Q:{m.quorum_at_close.toFixed(1)}%</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA: Turno de palabra + video speaker (toggle) ── */}
        {showFloor && (
          <div className="p-8 overflow-y-auto border-l border-white/10">
            <p className="text-white/40 text-sm uppercase tracking-widest font-medium mb-5">Turno de palabra</p>

            {/* Video del speaker vía Agora */}
            {hasRemoteVideo && (
              <div
                className="w-full aspect-video bg-black rounded-xl overflow-hidden mb-6 border border-white/10"
                ref={(el) => {
                  if (el && remoteVideoTrackRef.current) {
                    remoteVideoTrackRef.current.play(el)
                  }
                }}
              />
            )}

            <FloorPanel requests={activeFloor} accentColor={accent} />
          </div>
        )}
      </main>
    </div>
  )
}
