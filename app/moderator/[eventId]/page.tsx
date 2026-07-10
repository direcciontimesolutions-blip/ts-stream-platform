'use client'
// app/moderator/[eventId]/page.tsx — Panel del moderador y co-anfitrión

import React, { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface Msg {
  id: string
  content: string
  created_at: string
  deleted_at: string | null
  attendee_name: string
  attendee_username: string
  is_moderator?: boolean
}

interface ConnectedUser {
  sessionId: string
  attendeeId: string
  full_name: string
  username: string
  login_at: string
  last_ping_at: string | null
}

interface CoHostStatus {
  chat_enabled: boolean
  status: string
  title: string
  connected_now: number
  total_joined: number
  connected_attendees: ConnectedUser[]
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function ModeratorPage() {
  const params = useParams()
  const eventId = params.eventId as string

  const [messages, setMessages] = useState<Msg[]>([])
  const [connected, setConnected] = useState<ConnectedUser[]>([])
  const [coHostStatus, setCoHostStatus] = useState<CoHostStatus | null>(null)
  const [tab, setTab] = useState<'chat' | 'users' | 'status' | 'import'>('chat')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [kickedIds, setKickedIds] = useState<Set<string>>(new Set())
  const [chatToggling, setChatToggling] = useState(false)
  const [role, setRole] = useState<'moderator' | 'co_host' | null>(null)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; errors: Array<{ row: number; username: string; error: string }> } | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)

  useEffect(() => {
    fetch('/api/moderator/me')
      .then((r) => r.json())
      .then((d) => { if (d.role) setRole(d.role) })
      .catch(() => {})
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/chat`)
      if (res.ok) { setMessages(await res.json()); setLastUpdate(new Date()) }
    } catch {}
  }, [eventId])

  const fetchConnected = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/metrics`)
      if (res.ok) {
        const data = await res.json()
        setConnected(data.connected_attendees ?? [])
        setLastUpdate(new Date())
      }
    } catch {}
  }, [eventId])

  const fetchCoHostStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/cohost/${eventId}`)
      if (res.ok) { setCoHostStatus(await res.json()); setLastUpdate(new Date()) }
    } catch {}
  }, [eventId])

  useEffect(() => {
    fetchMessages()
    fetchConnected()
    const interval = setInterval(() => {
      fetchMessages()
      fetchConnected()
    }, 15_000)
    return () => clearInterval(interval)
  }, [fetchMessages, fetchConnected])

  useEffect(() => {
    if (role === 'co_host') {
      fetchCoHostStatus()
      const interval = setInterval(fetchCoHostStatus, 15_000)
      return () => clearInterval(interval)
    }
  }, [role, fetchCoHostStatus])

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim() || chatSending) return
    setChatSending(true)
    try {
      await fetch(`/api/moderator/${eventId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chatInput.trim() }),
      })
      setChatInput('')
      fetchMessages()
    } finally { setChatSending(false) }
  }

  async function handleDelete(messageId: string) {
    await fetch(`/api/events/${eventId}/chat/${messageId}`, { method: 'DELETE' })
    fetchMessages()
  }

  async function handleKick(attendee: ConnectedUser) {
    if (kickingId || !confirm(`¿Expulsar a ${attendee.full_name}?`)) return
    setKickingId(attendee.attendeeId)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/${attendee.attendeeId}/kick`, { method: 'POST' })
      if (res.ok) { setKickedIds((prev) => new Set(prev).add(attendee.attendeeId)); fetchConnected() }
    } finally { setKickingId(null) }
  }

  async function handleChatToggle() {
    if (!coHostStatus || chatToggling) return
    setChatToggling(true)
    try {
      const res = await fetch(`/api/cohost/${eventId}/chat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_enabled: !coHostStatus.chat_enabled }),
      })
      if (res.ok) fetchCoHostStatus()
    } finally { setChatToggling(false) }
  }

  async function handleImport() {
    if (!csvText.trim() || importing) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch(`/api/cohost/${eventId}/attendees/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      setImportResult(data)
      if (data.imported > 0) setCsvText('')
    } finally { setImporting(false) }
  }

  const tabs = [
    { id: 'chat' as const, label: `Chat (${messages.filter((m) => !m.deleted_at).length})` },
    { id: 'users' as const, label: `Conectados (${connected.length})` },
    ...(role === 'co_host' ? [
      { id: 'status' as const, label: 'Estado del evento' },
      { id: 'import' as const, label: 'Importar asistentes' },
    ] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-white">
              {role === 'co_host' ? 'Panel Co-anfitrión' : 'Panel de Moderación'}
            </h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              role === 'co_host' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
            }`}>
              {role === 'co_host' ? 'Co-anfitrión' : 'Moderador'}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">Evento ID: {eventId}</p>
        </div>
        {lastUpdate && (
          <p className="text-gray-600 text-xs">Act: {lastUpdate.toLocaleTimeString('es-CO')} · Cada 15s</p>
        )}
      </header>

      <div className="border-b border-white/10 px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id ? 'text-white border-purple-500' : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-6">

        {tab === 'chat' && (
          <div className="space-y-3">
            {/* Input para responder */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe un mensaje como moderador..."
                maxLength={500}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-purple-500/50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatSending}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {chatSending ? '...' : 'Enviar'}
              </button>
            </form>

            {/* Lista de mensajes */}
            {messages.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-12">Sin mensajes</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex items-start justify-between gap-4 p-4 rounded-xl ${
                  msg.deleted_at ? 'opacity-40 bg-white/2' : msg.is_moderator ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-white/4 hover:bg-white/6'
                }`}>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 mb-1">
                      <span className={`font-medium ${msg.is_moderator ? 'text-purple-300' : 'text-gray-200'}`}>{msg.attendee_name}</span>
                      {msg.attendee_username && <span className="text-gray-600"> @{msg.attendee_username}</span>}
                      <span className="ml-2">{new Date(msg.created_at).toLocaleTimeString('es-CO', { timeStyle: 'short' })}</span>
                      {msg.deleted_at && <span className="ml-2 text-red-400/60">Borrado</span>}
                    </p>
                    <p className="text-sm text-white/90 leading-relaxed">{msg.content}</p>
                  </div>
                  {!msg.deleted_at && !msg.is_moderator && (
                    <button onClick={() => handleDelete(msg.id)}
                      className="text-xs text-red-400/50 hover:text-red-400 transition-colors flex-shrink-0 mt-1 px-2 py-1 rounded hover:bg-red-500/10">
                      Borrar
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            {connected.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-12">Ningún asistente conectado en este momento</p>
            ) : (
              connected.map((att) => (
                <div key={att.sessionId} className={`flex items-center justify-between p-4 rounded-xl bg-white/4 ${
                  kickedIds.has(att.attendeeId) ? 'opacity-40' : ''
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <div>
                      <p className="text-sm text-white font-medium">{att.full_name}</p>
                      <p className="text-xs text-gray-500 font-mono">@{att.username} · {timeAgo(att.login_at)}</p>
                    </div>
                  </div>
                  {!kickedIds.has(att.attendeeId) ? (
                    <button onClick={() => handleKick(att)} disabled={kickingId === att.attendeeId}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/10">
                      {kickingId === att.attendeeId ? '...' : 'Expulsar'}
                    </button>
                  ) : (
                    <span className="text-xs text-red-400/50">Expulsado</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'import' && role === 'co_host' && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-400 mb-2">
                Pegá el contenido del CSV con columnas: <code className="text-purple-300 text-xs">full_name, username, email, password</code>
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'full_name,username,email,password\nJuan Pérez,jperez,juan@empresa.com,Pass2026!'}
                rows={8}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-purple-500/50 resize-none"
              />
            </div>
            <button
              onClick={handleImport}
              disabled={!csvText.trim() || importing}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {importing ? 'Importando...' : 'Importar asistentes'}
            </button>

            {importResult && (
              <div className={`rounded-xl p-4 ${importResult.imported > 0 ? 'bg-green-500/10 border border-green-500/25' : 'bg-red-500/10 border border-red-500/25'}`}>
                {importResult.imported > 0 && (
                  <p className="text-green-300 text-sm font-medium">✓ {importResult.imported} asistentes importados correctamente</p>
                )}
                {importResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-red-300 text-xs">Fila {e.row} (@{e.username}): {e.error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'status' && role === 'co_host' && coHostStatus && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/4 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Conectados ahora</p>
                <p className="text-3xl font-bold text-green-400">{coHostStatus.connected_now}</p>
              </div>
              <div className="bg-white/4 rounded-xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total ingresaron</p>
                <p className="text-3xl font-bold text-purple-400">{coHostStatus.total_joined}</p>
              </div>
            </div>

            <div className="bg-white/4 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Chat del evento</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {coHostStatus.chat_enabled ? 'Activo — los asistentes pueden chatear' : 'Inactivo'}
                </p>
              </div>
              <button onClick={handleChatToggle} disabled={chatToggling}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  coHostStatus.chat_enabled ? 'bg-purple-600' : 'bg-gray-700'
                }`}
                role="switch" aria-checked={coHostStatus.chat_enabled}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  coHostStatus.chat_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div className="bg-white/4 rounded-xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Estado</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${coHostStatus.status === 'live' ? 'bg-red-400 animate-pulse' : 'bg-gray-500'}`} />
                <p className="text-sm font-medium text-white">
                  {coHostStatus.status === 'live' ? 'En vivo' : coHostStatus.status === 'ended' ? 'Finalizado' : 'Borrador'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
