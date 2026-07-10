'use client'
// components/EventPlayer.tsx — YouTube embed + heartbeat + chat + kick detection

import { useState, useEffect, useRef, useCallback } from 'react'
import { extractYouTubeVideoId } from '@/lib/utils'
import type { Message } from '@/types'

interface EventPlayerProps {
  sessionId: string
  eventId: string
  youtubeUrl: string | null
  streamingTier: 'youtube' | 'cloudflare' | 'teams'
  attendeeName: string
  chatEnabled: boolean
  org: string
  event: string
}

export default function EventPlayer({
  sessionId,
  eventId,
  youtubeUrl,
  streamingTier,
  attendeeName,
  chatEnabled,
  org,
  event,
}: EventPlayerProps) {
  const endedRef = useRef(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<(Message & { is_own: boolean })[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatActive, setChatActive] = useState(chatEnabled)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
  useEffect(() => {
    const heartbeat = setInterval(async () => {
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
    }, 30_000)

    return () => {
      clearInterval(heartbeat)
    }
  }, [sessionId, org, event])

  // Chat polling
  const fetchMessages = useCallback(async () => {
    if (!chatActive) return
    try {
      const res = await fetch(`/api/events/${eventId}/chat`)
      if (res.ok) {
        const data = await res.json()
        if (!data.chat_enabled) {
          setChatActive(false)
          return
        }
        setChatActive(true)
        setMessages(data.messages ?? [])
      }
    } catch {}
  }, [eventId, chatActive])

  useEffect(() => {
    if (!chatActive) return
    fetchMessages()
    const interval = setInterval(fetchMessages, 5_000)
    return () => clearInterval(interval)
  }, [fetchMessages, chatActive])

  // Auto-scroll al ultimo mensaje
  useEffect(() => {
    if (chatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, chatOpen])

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

  return (
    <div className="flex flex-col flex-1 min-h-0">
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
      <div className="flex flex-1 min-h-0">
        {/* Player */}
        <div className="flex-1 flex items-center justify-center bg-black p-4 sm:p-8 min-w-0">
          {resolvedTier === 'youtube' && embedUrl ? (
            <div
              className="w-full"
              style={{ maxWidth: 'min(100%, calc((100vh - 160px) * 16 / 9))' }}
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
              style={{ maxWidth: 'min(100%, calc((100vh - 160px) * 16 / 9))' }}
            >
              <div className="aspect-video-wrapper rounded-xl overflow-hidden shadow-2xl">
                <iframe
                  src={youtubeUrl}
                  title="Transmision en vivo del evento"
                  allow="autoplay; camera; microphone"
                  allowFullScreen
                  frameBorder={0}
                  scrolling="no"
                />
              </div>
            </div>
          ) : resolvedTier === 'cloudflare' ? (
            <div className="text-center space-y-3">
              <p className="text-white/60 text-lg">Cloudflare Stream disponible en Fase 2</p>
              <p className="text-white/30 text-sm">Contacta a Time Solutions para activarlo</p>
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
    </div>
  )
}
