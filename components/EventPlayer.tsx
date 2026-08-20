'use client'
// components/EventPlayer.tsx — YouTube embed + heartbeat + chat + kick detection + polls

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { extractYouTubeVideoId } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@/types'

interface Poll {
  id: string
  question: string
  type: 'multiple_choice' | 'open' | 'rating'
  options: { id: string; text: string }[]
  show_results: boolean
}

interface TallyOption { id: string; text: string; count: number; pct: number }
interface Tally {
  type: string
  total: number
  options?: TallyOption[]
  avg?: number
}

interface EventPlayerProps {
  sessionId: string
  eventId: string
  youtubeUrl: string | null
  cloudflareStreamId?: string | null
  streamingTier: 'youtube' | 'cloudflare' | 'teams'
  attendeeName: string
  chatEnabled: boolean
  agendaUrl?: string | null
  org: string
  event: string
}

export default function EventPlayer({
  sessionId,
  eventId,
  youtubeUrl,
  cloudflareStreamId,
  streamingTier,
  attendeeName,
  chatEnabled,
  agendaUrl,
  org,
  event,
}: EventPlayerProps) {
  const endedRef = useRef(false)
  const teamsWrapperRef = useRef<HTMLDivElement>(null)

  // Alto/ancho maximo real del player, medido contra el contenedor flex que lo
  // envuelve (no adivinado con un "100vh - constante"). El wrapper .aspect-video-wrapper
  // usa el truco clasico de padding-bottom:56.25%, que calcula su alto a partir de su
  // ANCHO — no tiene forma de saber cuanto alto le queda disponible de verdad. Antes se
  // le pasaba un maxWidth fijo basado en una estimacion de "chrome" (header+barra+footer)
  // en pixeles; esa estimacion se volvio incorrecta al agregar la franja de patrocinadores
  // (altura variable: 1 fila en pantallas anchas, 2 filas si los logos hacen wrap en
  // pantallas angostas), y el player quedaba mas alto de lo que realmente cabia,
  // solapandose contra la franja de abajo. Medir el contenedor real con ResizeObserver
  // es correcto para cualquier combinacion de header/barra/sponsors/footer, sin adivinar.
  const playerAreaRef = useRef<HTMLDivElement>(null)
  const [playerMaxWidth, setPlayerMaxWidth] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = playerAreaRef.current
    if (!el) return

    function recalc() {
      if (!el) return
      const { clientWidth, clientHeight } = el
      if (clientWidth <= 0 || clientHeight <= 0) return
      setPlayerMaxWidth(Math.min(clientWidth, clientHeight * (16 / 9)))
    }

    recalc()
    const ro = new ResizeObserver(recalc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fallback antes de la primera medicion (SSR / primer paint): mismo criterio anterior,
  // conservador, solo para evitar un flash mientras el ResizeObserver mide el DOM real.
  const playerMaxWidthStyle: React.CSSProperties = {
    maxWidth:
      playerMaxWidth != null
        ? `${Math.floor(playerMaxWidth)}px`
        : 'min(100%, calc((100vh - 220px) * 16 / 9))',
  }

  // Fullscreen del contenedor propio, no del iframe — Safari iOS pausa el video
  // si se deja que el <video> nativo dentro del iframe de Teams (cross-origin) entre
  // en fullscreen; fullscreneando nuestro propio div el iframe nunca pierde su contexto.
  //
  // Limitacion real de plataforma (no bug de este codigo): Safari de iOS nunca
  // implemento la Fullscreen API estandar para elementos que no sean <video> — ni
  // requestFullscreen() ni el prefijo webkit existen ahi para un <div>. Solo un
  // <video> nativo tiene webkitEnterFullscreen(), y el nuestro esta dentro de un
  // iframe cross-origin de Teams al que no tenemos acceso. Por eso, si ninguna de
  // las dos APIs esta disponible en el elemento, caemos a un fallback 100% CSS
  // (pseudoFullscreen: position:fixed cubriendo el viewport) en vez de dejar que el
  // boton parezca funcionar y no haga nada — ver .pseudo-fullscreen en globals.css.
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false)

  function handleTeamsFullscreen() {
    if (pseudoFullscreen) {
      setPseudoFullscreen(false)
      return
    }
    const el = teamsWrapperRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null
    if (!el) return
    if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setPseudoFullscreen(true))
    } else if (typeof el.webkitRequestFullscreen === 'function') {
      el.webkitRequestFullscreen()
    } else {
      setPseudoFullscreen(true)
    }
  }

  // Mientras el fallback CSS esta activo: bloquear scroll del body (no hay chrome de
  // fullscreen real que lo haga por nosotros) y permitir salir con Escape (util en
  // desktop/Android; en iOS el boton mismo es la unica salida, por eso su icono cambia).
  useEffect(() => {
    if (!pseudoFullscreen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPseudoFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [pseudoFullscreen])
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<(Message & { is_own: boolean })[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatActive, setChatActive] = useState(chatEnabled)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Polls
  const [activePoll, setActivePoll] = useState<Poll | null>(null)
  const [pollAnswered, setPollAnswered] = useState(false)
  const [pollTally, setPollTally] = useState<Tally | null>(null)
  const [pollSubmitting, setPollSubmitting] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string>('')
  const [openAnswer, setOpenAnswer] = useState<string>('')
  const [ratingAnswer, setRatingAnswer] = useState<number>(0)
  const dismissedPollIdRef = useRef<string | null>(null)

  // Cloudflare Stream (Tier 1) — URL firmada, se pide una sola vez al montar
  const [cfIframeUrl, setCfIframeUrl] = useState<string | null>(null)
  const [cfError, setCfError] = useState<string | null>(null)

  const endSession = useCallback(async () => {
    if (endedRef.current) return
    endedRef.current = true
    try {
      await fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' })
    } catch {}
  }, [sessionId])

  // Heartbeat + kick/ended detection
  // No usamos beforeunload porque dispara en refresh también y terminaría la sesión,
  // permitiendo que otro dispositivo entre. El logout explícito maneja el cierre correcto.
  //
  // visibilitychange: Safari iOS (y otros navegadores en background) pausan/ralentizan
  // los timers de una pestaña oculta, asi que el setInterval de 30s puede saltarse varios
  // ciclos mientras la pestaña esta en segundo plano. Eso dejaba last_ping_at viejo por
  // mas de 5 minutos sin que la sesion estuviera realmente kickeada/deslogueada, lo que
  // alimentaba el loop de redireccion registro↔watch (ver page.tsx). Al volver a primer
  // plano disparamos un ping INMEDIATO (no esperar al proximo tick de 30s) para refrescar
  // last_ping_at lo antes posible y reducir esa ventana real.
  useEffect(() => {
    async function ping() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/ping`, { method: 'PATCH' })
        if (res.status === 401) {
          await fetch('/api/auth/logout', { method: 'POST' })
          window.location.href = `/${org}/${event}?kicked=1`
        } else if (res.status === 410) {
          // Evento finalizado — redirigir a la página de login donde se muestra el mensaje
          window.location.href = `/${org}/${event}`
        }
      } catch {}
    }

    const heartbeat = setInterval(ping, 30_000)

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [sessionId, org, event])

  // Cloudflare Stream (Tier 1) — pide la URL firmada una vez si el evento usa este tier
  useEffect(() => {
    if (streamingTier !== 'cloudflare' || !cloudflareStreamId) return
    let active = true
    fetch('/api/stream/signed-url')
      .then(async (res) => {
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          setCfError(data.error ?? 'No se pudo cargar la transmision.')
          return
        }
        setCfIframeUrl(data.iframeUrl)
      })
      .catch(() => { if (active) setCfError('No se pudo cargar la transmision.') })
    return () => { active = false }
  }, [streamingTier, cloudflareStreamId])

  // Chat polling — auto-recuperable. Antes, una sola respuesta con chat_enabled:false
  // apagaba el chat para siempre: chatActive pasaba a false y el useEffect de abajo,
  // que depende de chatActive para correr, dejaba de ejecutar fetchMessages del todo
  // (nunca volvia a preguntar). Eso combinado con el bug del backend (que podia
  // responder chat_enabled:false ante un error transitorio, ver route.ts) apagaba el
  // chat en falso y sin forma de recuperarse solo.
  //
  // Ahora: (1) una respuesta no-ok (ej. 503 por error transitorio del backend) no
  // toca chatActive — se mantiene el ultimo estado conocido y se reintenta en el
  // siguiente ciclo; (2) el polling nunca se detiene del todo, solo cambia de
  // velocidad — cada 5s mientras el chat esta activo, cada 60s mientras esta
  // inactivo (para no martillar el servidor) revisando si volvio a activarse.
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/chat`)
      if (!res.ok) return // fallo transitorio — no tocar chatActive, reintentar despues
      const data = await res.json()
      if (data.chat_enabled) {
        setChatActive(true)
        setMessages(data.messages ?? [])
      } else {
        setChatActive(false)
      }
    } catch {
      // error de red — transitorio, no tocar chatActive
    }
  }, [eventId])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, chatActive ? 5_000 : 60_000)
    return () => clearInterval(interval)
  }, [fetchMessages, chatActive])

  // Auto-scroll al ultimo mensaje
  useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, chatOpen])

  // Polls — polling cada 5s (fallback) + Supabase Realtime (instantáneo cuando funciona)
  useEffect(() => {
    let active = true

    async function checkActivePoll() {
      try {
        const res = await fetch(`/api/events/${eventId}/polls/active`, { cache: 'no-store' })
        if (!res.ok || !active) return
        const data = await res.json()
        if (data.poll) {
          if (data.poll.id === dismissedPollIdRef.current) {
            // Poll descartado — solo re-mostrar si el admin está haciendo broadcast de resultados
            if (!data.poll.show_results) return
            dismissedPollIdRef.current = null  // override: el admin quiere que todos vean
          }
          setActivePoll((prev) => {
            if (!prev || prev.id !== data.poll.id) {
              setPollAnswered(data.already_responded ?? false)
              setSelectedOption('')
              setOpenAnswer('')
              setRatingAnswer(0)
            }
            return data.poll
          })
          if (data.tally !== undefined) setPollTally(data.tally ?? null)
        } else {
          setActivePoll(null)
          setPollTally(null)
        }
      } catch {}
    }

    checkActivePoll()
    const pollInterval = setInterval(checkActivePoll, 5_000)

    const supabase = createClient()
    const channel = supabase
      .channel(`poll:${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polls', filter: `event_id=eq.${eventId}` },
        (payload) => {
          if (!active) return
          const row = payload.new as { status?: string } | null
          if (!row) return
          if (row.status === 'active') {
            const incoming = row as unknown as Poll & { show_results: boolean }
            if (incoming.id === dismissedPollIdRef.current) return
            setActivePoll((prev) => {
              if (!prev || prev.id !== incoming.id) {
                setPollAnswered(false)
                setPollTally(null)
                setSelectedOption('')
                setOpenAnswer('')
                setRatingAnswer(0)
              }
              return incoming
            })
            // Si el admin acaba de mostrar resultados, fetch inmediato para no esperar 5s
            if (incoming.show_results) {
              fetch(`/api/events/${eventId}/polls/active`)
                .then((r) => r.json())
                .then((d) => { if (active && d.tally) setPollTally(d.tally) })
                .catch(() => {})
            }
          } else {
            setActivePoll(null)
            setPollTally(null)
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [eventId])

  async function handlePollSubmit() {
    if (!activePoll || pollSubmitting) return
    setPollSubmitting(true)
    try {
      let body: Record<string, unknown> = {}
      if (activePoll.type === 'multiple_choice') body = { option_id: selectedOption }
      else if (activePoll.type === 'open') body = { text: openAnswer }
      else body = { rating: ratingAnswer }

      const res = await fetch(`/api/events/${eventId}/polls/${activePoll.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        setPollAnswered(true)
        if (data.tally) setPollTally(data.tally)
      }
    } catch {} finally {
      setPollSubmitting(false)
    }
  }

  async function handleLogout() {
    await endSession()
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = `/${org}/${event}`
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    const content = chatInput.trim()
    if (!content || sending) return

    setSending(true)
    setChatInput('')
    try {
      await fetch(`/api/events/${eventId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      await fetchMessages()
    } catch {} finally {
      setSending(false)
    }
  }

  const isTeams = youtubeUrl?.includes('teams.microsoft.com') ?? false
  const videoId = (!isTeams && youtubeUrl) ? extractYouTubeVideoId(youtubeUrl) : null
  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`
    : null
  const resolvedTier = isTeams ? 'teams' : streamingTier

  const canSubmitPoll =
    activePoll?.type === 'multiple_choice' ? !!selectedOption :
    activePoll?.type === 'open' ? openAnswer.trim().length > 0 :
    activePoll?.type === 'rating' ? ratingAnswer > 0 : false

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/40 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
          <span className="text-sm text-white/70">
            Conectado como{' '}
            <strong className="text-white font-medium">{attendeeName}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {agendaUrl && (
            <a
              href={agendaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 flex items-center gap-1.5"
              aria-label="Ver agenda del evento (PDF, se abre en una pestaña nueva)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Ver agenda
            </a>
          )}
          {chatActive && (
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 flex items-center gap-1.5"
              aria-label="Abrir chat del evento"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Chat
              {messages.length > 0 && (
                <span className="bg-purple-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {messages.length > 99 ? '99+' : messages.length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-white/50 hover:text-white/90 transition-colors px-3 py-1.5 rounded-md hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Cerrar sesion y salir del evento"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Contenido principal + chat lateral */}
      {/* El maxWidth de los wrappers de abajo (playerMaxWidthStyle) evita que el video, al tener
          aspect-ratio fijo via padding-bottom, crezca mas alla del alto real disponible dentro del
          flex-1 de BrandedLayout. Se mide con ResizeObserver contra playerAreaRef (ver arriba) en
          vez de adivinar un "100vh - constante": eso permite que header, barra, footer y la franja
          de patrocinadores (altura variable segun haga wrap o no) cambien libremente sin volver a
          romper el calculo — el player nunca se solapa contra lo que venga despues. */}
      <div className="flex flex-1 min-h-0">
        {/* Player */}
        <div ref={playerAreaRef} className="flex-1 flex items-center justify-center bg-black p-4 sm:p-8 min-w-0 min-h-0">
          {resolvedTier === 'youtube' && embedUrl ? (
            <div
              className="w-full"
              style={playerMaxWidthStyle}
            >
              <div className="aspect-video-wrapper rounded-xl overflow-hidden shadow-2xl">
                <iframe
                  src={embedUrl}
                  title="Transmision en vivo del evento"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          ) : resolvedTier === 'teams' && youtubeUrl ? (
            <div
              className="w-full"
              style={playerMaxWidthStyle}
            >
              <div
                ref={teamsWrapperRef}
                className={`aspect-video-wrapper shadow-2xl relative group ${
                  pseudoFullscreen ? 'pseudo-fullscreen' : 'rounded-xl overflow-hidden'
                }`}
              >
                <iframe
                  src={youtubeUrl}
                  title="Transmision en vivo del evento"
                  allow="autoplay; camera; microphone"
                  frameBorder={0}
                  scrolling="no"
                />
                <button
                  onClick={handleTeamsFullscreen}
                  aria-label={pseudoFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  className="absolute bottom-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  {pseudoFullscreen ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 3v4a1 1 0 0 1-1 1H4m16-5v4a1 1 0 0 1-1 1h-4M4 15h4a1 1 0 0 1 1 1v4m10-5h-4a1 1 0 0 0-1 1v4" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ) : resolvedTier === 'cloudflare' && cfIframeUrl ? (
            <div
              className="w-full"
              style={playerMaxWidthStyle}
            >
              <div className="aspect-video-wrapper rounded-xl overflow-hidden shadow-2xl">
                <iframe
                  src={cfIframeUrl}
                  title="Transmision en vivo del evento"
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : resolvedTier === 'cloudflare' && cfError ? (
            <div className="text-center space-y-3">
              <p className="text-white/60 text-lg">La transmision no esta disponible.</p>
              <p className="text-white/30 text-sm">Contacta a Time Solutions.</p>
            </div>
          ) : resolvedTier === 'cloudflare' ? (
            <div className="text-center space-y-3">
              <div className="text-5xl animate-pulse" aria-hidden="true">📡</div>
              <p className="text-white/60 text-lg">Cargando transmision...</p>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="text-5xl" aria-hidden="true">📡</div>
              <p className="text-white/60 text-lg">La transmision no esta disponible aun</p>
              <p className="text-white/30 text-sm">El organizador activara el stream pronto</p>
            </div>
          )}
        </div>

        {/* Panel de chat */}
        {chatActive && chatOpen && (
          <div className="w-80 flex-shrink-0 flex flex-col border-l border-white/10 bg-gray-950">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Chat del evento</span>
              <button
                onClick={() => setChatOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Cerrar chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-xs text-center pt-4">
                  El chat esta abierto. Sé el primero en escribir.
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.is_own ? 'items-end' : 'items-start'}`}
                  >
                    {!msg.is_own && (
                      <span className="text-xs text-gray-500 mb-0.5 px-1">
                        {msg.attendee_name}
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        msg.is_own
                          ? 'bg-purple-600 text-white rounded-br-sm'
                          : 'bg-white/10 text-white/90 rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  maxLength={500}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:bg-white/8"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || sending}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-xl text-white transition-colors flex-shrink-0"
                  aria-label="Enviar mensaje"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Card de poll — esquina inferior derecha */}
      {activePoll && (
        <div className="absolute bottom-4 right-4 z-40 w-80 max-w-[calc(100%-2rem)]">
          <div className="bg-gray-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
            <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                {activePoll.type === 'multiple_choice' ? 'Encuesta' : activePoll.type === 'rating' ? 'Calificación' : 'Pregunta abierta'}
              </span>
            </div>

            <div className="px-6 py-5">
              <p className="text-white font-semibold text-base leading-snug mb-5">{activePoll.question}</p>

              {!pollAnswered && !(activePoll.show_results && pollTally) ? (
                <>
                  {activePoll.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      {activePoll.options.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setSelectedOption(opt.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                            selectedOption === opt.id
                              ? 'border-purple-500 bg-purple-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10'
                          }`}
                        >
                          {opt.text}
                        </button>
                      ))}
                    </div>
                  )}

                  {activePoll.type === 'open' && (
                    <textarea
                      value={openAnswer}
                      onChange={(e) => setOpenAnswer(e.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="Escribe tu respuesta aquí..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                    />
                  )}

                  {activePoll.type === 'rating' && (
                    <div className="flex justify-center gap-3 py-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setRatingAnswer(n)}
                          className={`text-3xl transition-all ${ratingAnswer >= n ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-60'}`}
                          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handlePollSubmit}
                    disabled={!canSubmitPoll || pollSubmitting}
                    className="mt-5 w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm py-3 rounded-xl transition-colors"
                  >
                    {pollSubmitting ? 'Enviando…' : 'Enviar respuesta'}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  {pollAnswered
                  ? <p className="text-green-400 text-sm font-medium text-center">✓ Respuesta registrada</p>
                  : <p className="text-purple-400 text-sm font-medium text-center">📊 Resultados en vivo</p>
                }

                  {pollTally && activePoll.type === 'multiple_choice' && pollTally.options && (
                    <div className="space-y-2">
                      {pollTally.options.map((opt) => (
                        <div key={opt.id}>
                          <div className="flex justify-between text-xs text-white/70 mb-1">
                            <span>{opt.text}</span>
                            <span>{opt.pct}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${opt.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      <p className="text-xs text-white/40 text-center">{pollTally.total} respuestas</p>
                    </div>
                  )}

                  {pollTally && activePoll.type === 'rating' && (
                    <div className="text-center space-y-1">
                      <p className="text-4xl font-bold text-white">{pollTally.avg}</p>
                      <p className="text-xs text-white/40">{pollTally.total} respuestas · promedio de 5</p>
                    </div>
                  )}

                  {activePoll.type === 'open' && !pollTally && (
                    <p className="text-white/50 text-sm text-center">Gracias por tu respuesta.</p>
                  )}

                  <button
                    onClick={() => {
                      dismissedPollIdRef.current = activePoll?.id ?? null
                      setActivePoll(null)
                      setPollTally(null)
                    }}
                    className="mt-4 w-full text-white/50 hover:text-white/80 text-sm py-2 rounded-xl transition-colors hover:bg-white/5"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
