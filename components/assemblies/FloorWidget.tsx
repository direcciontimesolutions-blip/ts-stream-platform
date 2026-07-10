'use client'
// components/assemblies/FloorWidget.tsx — Widget de turno de palabra para asistentes

import { useState, useEffect, useRef, useCallback } from 'react'

interface FloorRequest {
  id: string
  status: 'pending' | 'granted' | 'revoked' | 'ended'
  agora_token: string | null
  agora_channel: string | null
  agora_uid: number | null
  requested_at: string
  granted_at: string | null
}

interface Props {
  orgSlug: string
  assemblySlug: string
  assemblyStatus: string
}

type AgoraRTC = typeof import('agora-rtc-sdk-ng').default
type IAgoraRTCClient = import('agora-rtc-sdk-ng').IAgoraRTCClient
type IMicrophoneAudioTrack = import('agora-rtc-sdk-ng').IMicrophoneAudioTrack
type ICameraVideoTrack = import('agora-rtc-sdk-ng').ICameraVideoTrack

export default function FloorWidget({ orgSlug, assemblySlug, assemblyStatus }: Props) {
  const [request, setRequest] = useState<FloorRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [inChannel, setInChannel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agoraAppId, setAgoraAppId] = useState('')

  const agoraRef = useRef<AgoraRTC | null>(null)
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null)
  const camTrackRef = useRef<ICameraVideoTrack | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const localVideoRef = useRef<HTMLDivElement>(null)
  const joiningRef = useRef(false) // previene doble-join por race condition

  const floorBase = `/api/assembly/${orgSlug}/${assemblySlug}/floor`

  // ── Cargar Agora SDK + App ID (solo browser) ───────────────────────────────
  useEffect(() => {
    import('agora-rtc-sdk-ng').then(m => { agoraRef.current = m.default })
    fetch('/api/assembly/config')
      .then(r => r.json())
      .then(d => setAgoraAppId(d.agoraAppId ?? ''))
      .catch(() => {})
  }, [])

  // ── Polling del estado del request ─────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(floorBase)
      if (!res.ok) return
      const { request: r } = await res.json() as { request: FloorRequest | null }
      setRequest(r)

      // Si fue revocado externamente, limpiar el canal
      if (r === null || r.status === 'revoked') {
        leaveChannel()
      }
    } catch {}
  }, [floorBase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchStatus])

  // ── Unirse al canal Agora cuando el token llega ────────────────────────────
  useEffect(() => {
    if (
      request?.status === 'granted' &&
      request.agora_token &&
      request.agora_channel &&
      request.agora_uid !== null &&
      !inChannel &&
      !joiningRef.current &&   // bloquea re-entradas durante el join async
      !clientRef.current &&    // bloquea si ya hay cliente activo
      agoraRef.current
    ) {
      joinChannel(request.agora_channel, request.agora_token, request.agora_uid)
    }
  }, [request, inChannel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Limpiar al desmontar ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      leaveChannel()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agora: unirse ──────────────────────────────────────────────────────────
  async function joinChannel(channel: string, token: string, uid: number) {
    if (!agoraRef.current) return
    joiningRef.current = true  // bloqueo sincrónico inmediato
    setError(null)
    try {
      const AgoraRTC = agoraRef.current
      AgoraRTC.setLogLevel(4) // silent en producción

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      await client.join(agoraAppId, channel, token, uid)

      const [micTrack, camTrack] = await AgoraRTC.createMicrophoneAndCameraTracks()
      micTrackRef.current = micTrack
      camTrackRef.current = camTrack

      await client.publish([micTrack, camTrack])

      // Mostrar video local
      if (localVideoRef.current) {
        camTrack.play(localVideoRef.current)
      }

      setInChannel(true)
    } catch (err) {
      console.error('Error joining Agora channel:', err)
      setError('No se pudo activar el micrófono/cámara. Verifica permisos del navegador.')
      joiningRef.current = false  // liberar en error para permitir reintento
      clientRef.current = null
    }
  }

  // ── Agora: salir ───────────────────────────────────────────────────────────
  function leaveChannel() {
    if (micTrackRef.current) { micTrackRef.current.stop(); micTrackRef.current.close() }
    if (camTrackRef.current) { camTrackRef.current.stop(); camTrackRef.current.close() }
    if (clientRef.current) { clientRef.current.leave().catch(() => {}) }
    micTrackRef.current = null
    camTrackRef.current = null
    clientRef.current = null
    setInChannel(false)
  }

  // ── Acciones ───────────────────────────────────────────────────────────────
  async function handleRequest() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(floorBase, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al solicitar la palabra.')
        if (data.request) setRequest(data.request) // ya tenía request activo
      } else {
        setRequest(data.request)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleHangup() {
    setLoading(true)
    leaveChannel()
    try {
      await fetch(floorBase, { method: 'DELETE' })
      setRequest(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleWithdraw() {
    setLoading(true)
    try {
      await fetch(floorBase, { method: 'DELETE' })
      setRequest(null)
    } finally {
      setLoading(false)
    }
  }

  async function toggleMic() {
    if (!micTrackRef.current) return
    const next = !micOn
    await micTrackRef.current.setEnabled(next)
    setMicOn(next)
  }

  async function toggleCam() {
    if (!camTrackRef.current) return
    const next = !camOn
    await camTrackRef.current.setEnabled(next)
    setCamOn(next)
  }

  if (assemblyStatus !== 'active') return null

  // ── UI ─────────────────────────────────────────────────────────────────────

  // Sin request activo
  if (!request) {
    return (
      <div className="mt-4 border border-white/10 rounded-xl p-4 bg-white/5">
        <p className="text-xs text-gray-400 mb-3">¿Deseas intervenir en la asamblea?</p>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button
          onClick={handleRequest}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          <span>✋</span>
          {loading ? 'Enviando...' : 'Solicitar la palabra'}
        </button>
      </div>
    )
  }

  // Request pendiente
  if (request.status === 'pending') {
    return (
      <div className="mt-4 border border-yellow-500/30 rounded-xl p-4 bg-yellow-500/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="animate-pulse">✋</span>
            <div>
              <p className="text-sm font-medium text-yellow-300">Mano levantada</p>
              <p className="text-xs text-gray-400">Esperando que el moderador te conceda la palabra…</p>
            </div>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Retirar
          </button>
        </div>
      </div>
    )
  }

  // Request concedido — en canal Agora
  if (request.status === 'granted') {
    return (
      <div className="mt-4 border border-green-500/40 rounded-xl p-4 bg-green-500/5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-sm font-semibold text-green-300">Tienes la palabra</p>
        </div>

        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        {!inChannel && !error && (
          <p className="text-xs text-gray-400 mb-3">Activando micrófono y cámara…</p>
        )}

        {/* Video local */}
        <div
          ref={localVideoRef}
          className="w-full aspect-video bg-black rounded-lg overflow-hidden mb-3"
          style={{ display: inChannel && camOn ? 'block' : 'none' }}
        />

        {inChannel && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleMic}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                micOn
                  ? 'bg-white/10 hover:bg-white/20 text-white'
                  : 'bg-red-600/80 hover:bg-red-500 text-white'
              }`}
            >
              {micOn ? '🎙️ Mic activo' : '🔇 Mic silenciado'}
            </button>
            <button
              onClick={toggleCam}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                camOn
                  ? 'bg-white/10 hover:bg-white/20 text-white'
                  : 'bg-red-600/80 hover:bg-red-500 text-white'
              }`}
            >
              {camOn ? '📷 Cámara activa' : '📵 Cámara apagada'}
            </button>
            <button
              onClick={handleHangup}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors ml-auto"
            >
              📵 Colgar
            </button>
          </div>
        )}
      </div>
    )
  }

  return null
}
