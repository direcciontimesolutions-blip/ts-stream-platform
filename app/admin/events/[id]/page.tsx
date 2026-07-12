'use client'
// app/admin/events/[id]/page.tsx — Detalle del evento + asistentes + metricas + chat + moderadores

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import MetricsDashboard from '@/components/admin/MetricsDashboard'
import AttendeeImport from '@/components/admin/AttendeeImport'
import type { Event, Organization, ImportResult, EventModerator } from '@/types'

interface AttendeeWithKick {
  id: string
  full_name: string
  email: string | null
  username: string
  role: string
  created_at: string
  is_kicked: boolean
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  live: 'En vivo',
  ended: 'Finalizado',
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  live: 'bg-red-500/20 text-red-400 border-red-500/30',
  ended: 'bg-green-500/20 text-green-400 border-green-500/30',
}

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string }> = {
  draft: { label: 'Poner en vivo', next: 'live', color: 'bg-red-600 hover:bg-red-700' },
  live: { label: 'Finalizar evento', next: 'ended', color: 'bg-gray-600 hover:bg-gray-700' },
  ended: { label: 'Reabrir evento', next: 'live', color: 'bg-orange-600 hover:bg-orange-700' },
}

type EventWithOrg = Event & { organizations: Organization }

interface AdminMessage {
  id: string
  content: string
  created_at: string
  deleted_at: string | null
  attendee_name: string
  attendee_username: string
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventWithOrg | null>(null)
  const [attendees, setAttendees] = useState<AttendeeWithKick[]>([])
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importFeedback, setImportFeedback] = useState<ImportResult | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Chat admin
  const [chatMessages, setChatMessages] = useState<AdminMessage[]>([])
  const [chatTab, setChatTab] = useState(false)
  const [chatToggling, setChatToggling] = useState(false)
  const [chatClearing, setChatClearing] = useState(false)
  const [openRegToggling, setOpenRegToggling] = useState(false)

  // Moderadores
  const [moderators, setModerators] = useState<EventModerator[]>([])
  const [showModeratorsTab, setShowModeratorsTab] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'moderator' | 'co_host'>('moderator')
  const [inviting, setInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [deletingAttendeeId, setDeletingAttendeeId] = useState<string | null>(null)

  // Polls
  interface PollOption { id: string; text: string }
  interface Poll {
    id: string; question: string; type: string; options: PollOption[]
    status: string; show_results: boolean; created_at: string
  }
  interface PollTallyOption { id: string; text: string; count: number; pct: number }
  interface PollTally { type: string; total: number; options?: PollTallyOption[]; avg?: number; distribution?: Record<number,number>; responses?: string[] }

  const [showPollsTab, setShowPollsTab] = useState(false)
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollLaunching, setPollLaunching] = useState<string | null>(null)
  const [pollTogglingResults, setPollTogglingResults] = useState<string | null>(null)
  const [pollDeleting, setPollDeleting] = useState<string | null>(null)
  const [pollTallies, setPollTallies] = useState<Record<string, PollTally>>({})
  const [newPollQ, setNewPollQ] = useState('')
  const [newPollType, setNewPollType] = useState<'multiple_choice' | 'open' | 'rating'>('multiple_choice')
  const [newPollOptions, setNewPollOptions] = useState<string[]>(['', ''])
  const [newPollShowResults, setNewPollShowResults] = useState(true)
  const [creatingPoll, setCreatingPoll] = useState(false)

  const fetchEvent = useCallback(async () => {
    try {
      const [eventRes, attendeesRes] = await Promise.all([
        fetch(`/api/admin/events/${eventId}`),
        fetch(`/api/admin/events/${eventId}/attendees`),
      ])
      if (eventRes.status === 401) { router.push('/admin'); return }
      if (eventRes.ok) setEvent(await eventRes.json())
      if (attendeesRes.ok) setAttendees(await attendeesRes.json())
    } finally {
      setLoading(false)
    }
  }, [eventId, router])

  const fetchChatMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/chat`)
      if (res.ok) setChatMessages(await res.json())
    } catch {}
  }, [eventId])

  const fetchModerators = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/moderators`)
      if (res.ok) setModerators(await res.json())
    } catch {}
  }, [eventId])

  const fetchPolls = useCallback(async () => {
    setPollsLoading(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/polls`)
      if (res.ok) setPolls(await res.json())
    } finally { setPollsLoading(false) }
  }, [eventId])

  const fetchPollTally = useCallback(async (pollId: string) => {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/polls/${pollId}/responses`)
      if (res.ok) { const data = await res.json(); setPollTallies((prev) => ({ ...prev, [pollId]: data })) }
    } catch {}
  }, [eventId])

  useEffect(() => { fetchEvent() }, [fetchEvent])
  useEffect(() => { if (chatTab) fetchChatMessages() }, [chatTab, fetchChatMessages])
  useEffect(() => { if (showModeratorsTab) fetchModerators() }, [showModeratorsTab, fetchModerators])
  useEffect(() => { if (showPollsTab) fetchPolls() }, [showPollsTab, fetchPolls])

  async function handleStatusChange() {
    if (!event) return
    const transition = STATUS_TRANSITIONS[event.status]
    if (!transition) return
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: transition.next }),
      })
      if (res.ok) {
        const updated = await res.json()
        setEvent((prev) => prev ? { ...prev, status: updated.status } : prev)
      }
    } finally { setStatusLoading(false) }
  }

  async function handleChatToggle() {
    if (!event) return
    setChatToggling(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/chat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_enabled: !event.chat_enabled }),
      })
      if (res.ok) {
        const data = await res.json()
        setEvent((prev) => prev ? { ...prev, chat_enabled: data.chat_enabled } : prev)
      }
    } finally { setChatToggling(false) }
  }

  async function handleDeleteMessage(messageId: string) {
    await fetch(`/api/events/${eventId}/chat/${messageId}`, { method: 'DELETE' })
    fetchChatMessages()
  }

  async function handleClearChat() {
    if (!confirm('¿Borrar todos los mensajes del chat? Esta acción no se puede deshacer.')) return
    setChatClearing(true)
    try {
      await fetch(`/api/admin/events/${eventId}/chat`, { method: 'DELETE' })
      setChatMessages([])
    } finally { setChatClearing(false) }
  }

  async function handleOpenRegToggle() {
    if (!event) return
    setOpenRegToggling(true)
    const branding = event.branding ?? {}
    const current = branding.open_registration === true
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open_registration: !current }),
      })
      if (res.ok) {
        setEvent((prev) => prev ? {
          ...prev,
          branding: { ...(prev.branding ?? {}), open_registration: !current },
        } : prev)
      }
    } finally { setOpenRegToggling(false) }
  }

  async function handleInviteModerator(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim() || inviting) return
    setInviting(true)
    setInviteLink(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/moderators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      if (res.ok) {
        const data = await res.json()
        setInviteLink(data.invite_link)
        setInviteEmail('')
        fetchModerators()
      }
    } finally { setInviting(false) }
  }

  async function handleRevokeModerator(moderatorId: string, email: string) {
    if (revokingId || !confirm(`¿Revocar acceso de ${email}?`)) return
    setRevokingId(moderatorId)
    try {
      await fetch(`/api/admin/events/${eventId}/moderators/${moderatorId}`, { method: 'DELETE' })
      fetchModerators()
    } finally { setRevokingId(null) }
  }

  function copyEventLink() {
    if (!event) return
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/${event.organizations.slug}/${event.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    })
  }

  function copyInviteLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  async function handleRestoreAccess(attendeeId: string) {
    if (!confirm('¿Restaurar el acceso de este asistente?')) return
    await fetch(`/api/admin/events/${eventId}/attendees/${attendeeId}/restore`, { method: 'POST' })
    fetchEvent()
  }

  async function handleDeleteAttendee(attendeeId: string, name: string) {
    if (deletingAttendeeId) return
    if (!confirm(`¿Eliminar a "${name}" del evento? Se borrarán sus sesiones y mensajes.`)) return
    setDeletingAttendeeId(attendeeId)
    try {
      await fetch(`/api/admin/events/${eventId}/attendees/${attendeeId}`, { method: 'DELETE' })
      setAttendees((prev) => prev.filter((a) => a.id !== attendeeId))
    } finally { setDeletingAttendeeId(null) }
  }

  async function handleCreatePoll(e: React.FormEvent) {
    e.preventDefault()
    if (!newPollQ.trim() || creatingPoll) return
    setCreatingPoll(true)
    try {
      const options = newPollType === 'multiple_choice'
        ? newPollOptions.filter((o) => o.trim()).map((text, i) => ({ id: `opt_${i}`, text: text.trim() }))
        : []
      const res = await fetch(`/api/admin/events/${eventId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newPollQ, type: newPollType, options, show_results: newPollShowResults }),
      })
      if (res.ok) {
        setNewPollQ('')
        setNewPollOptions(['', ''])
        setNewPollType('multiple_choice')
        fetchPolls()
      }
    } finally { setCreatingPoll(false) }
  }

  async function handlePollStatusChange(pollId: string, status: string) {
    if (pollLaunching) return
    setPollLaunching(pollId)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error ?? 'Error al cambiar estado.')
      } else {
        if (status === 'closed') fetchPollTally(pollId)
        fetchPolls()
      }
    } finally { setPollLaunching(null) }
  }

  async function handleToggleShowResults(pollId: string, current: boolean) {
    if (pollTogglingResults) return
    setPollTogglingResults(pollId)
    try {
      await fetch(`/api/admin/events/${eventId}/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_results: !current }),
      })
      fetchPolls()
    } finally { setPollTogglingResults(null) }
  }

  async function handleDeletePoll(pollId: string) {
    if (pollDeleting || !confirm('¿Eliminar este poll?')) return
    setPollDeleting(pollId)
    try {
      await fetch(`/api/admin/events/${eventId}/polls/${pollId}`, { method: 'DELETE' })
      setPolls((prev) => prev.filter((p) => p.id !== pollId))
    } finally { setPollDeleting(null) }
  }

  function handleImportSuccess(result: ImportResult) {
    setShowImport(false)
    setImportFeedback(result)
    fetchEvent()
    setTimeout(() => setImportFeedback(null), 6000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" aria-label="Cargando..." />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white text-lg">Evento no encontrado</p>
          <Link href="/admin/dashboard" className="text-purple-400 text-sm hover:text-purple-300">
            Volver al dashboard
          </Link>
        </div>
      </div>
    )
  }

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  const eventUrl = `${appUrl}/${event.organizations.slug}/${event.slug}`
  const transition = STATUS_TRANSITIONS[event.status]
  const badgeColor = STATUS_BADGE_COLORS[event.status] ?? STATUS_BADGE_COLORS.draft
  const isOpenReg = (event.branding ?? {}).open_registration === true

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/dashboard"
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Volver al dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-white">{event.title}</h1>
              <p className="text-gray-500 text-xs">{event.organizations.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badgeColor}`}>
              {event.status === 'live' && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />
              )}
              {STATUS_LABELS[event.status]}
            </span>
            {transition && (
              <button
                onClick={handleStatusChange}
                disabled={statusLoading}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${transition.color}`}
              >
                {statusLoading ? 'Actualizando...' : transition.label}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Link del evento */}
        <section className="bg-gray-900 border border-white/10 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Link del evento
          </h2>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-sm text-purple-300 font-mono bg-purple-500/10 px-4 py-2.5 rounded-lg truncate">
              {eventUrl}
            </code>
            <button onClick={copyEventLink} className="px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/15 transition-colors flex-shrink-0">
              {copyFeedback ? 'Copiado!' : 'Copiar'}
            </button>
            <a href={eventUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 rounded-lg text-sm font-medium text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 transition-colors flex-shrink-0">
              Abrir
            </a>
          </div>
        </section>

        {/* Info del evento */}
        <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Informacion del evento
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Slug</p>
              <p className="text-white font-mono">{event.slug}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Tier</p>
              <p className="text-white capitalize">{event.streaming_tier}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Inicio</p>
              <p className="text-white">{new Date(event.start_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Fin</p>
              <p className="text-white">{new Date(event.end_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
          </div>
          {event.youtube_url && (
            <div>
              <p className="text-gray-500 text-xs mb-1">URL de YouTube</p>
              <a href={event.youtube_url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 text-sm font-mono truncate block">
                {event.youtube_url}
              </a>
            </div>
          )}
        </section>

        {/* Metricas */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Metricas en tiempo real
          </h2>
          <MetricsDashboard eventId={eventId} status={event.status} onKick={fetchEvent} />
        </section>

        {/* Chat */}
        <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Chat del evento
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                Estado: {event.chat_enabled ? 'Activo' : 'Inactivo'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearChat}
                disabled={chatClearing}
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-40"
              >
                {chatClearing ? 'Limpiando...' : 'Limpiar chat'}
              </button>
              <button
                onClick={() => { setChatTab((v) => !v); if (!chatTab) fetchChatMessages() }}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                {chatTab ? 'Ocultar mensajes' : 'Ver mensajes'}
              </button>
              <button
                onClick={handleChatToggle}
                disabled={chatToggling}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  event.chat_enabled ? 'bg-purple-600' : 'bg-gray-700'
                }`}
                aria-label={event.chat_enabled ? 'Desactivar chat' : 'Activar chat'}
                role="switch"
                aria-checked={event.chat_enabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    event.chat_enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {chatTab && (
            <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
              {chatMessages.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500 text-center">No hay mensajes</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex items-start justify-between gap-4 px-5 py-3 ${msg.deleted_at ? 'opacity-40' : ''}`}>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 mb-0.5">
                        <span className="text-gray-300 font-medium">{msg.attendee_name}</span>
                        {' · '}
                        {new Date(msg.created_at).toLocaleTimeString('es-CO', { timeStyle: 'short' })}
                        {msg.deleted_at && <span className="ml-2 text-red-400/60">Borrado</span>}
                      </p>
                      <p className="text-sm text-white/80">{msg.content}</p>
                    </div>
                    {!msg.deleted_at && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="text-xs text-red-400/60 hover:text-red-400 transition-colors flex-shrink-0 mt-1"
                        aria-label="Borrar mensaje"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Moderadores */}
        <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Moderadores
            </h2>
            <button
              onClick={() => { setShowModeratorsTab((v) => !v) }}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              {showModeratorsTab ? 'Ocultar' : 'Gestionar'}
            </button>
          </div>

          {showModeratorsTab && (
            <div className="p-5 space-y-4">
              {/* Invitar moderador / co-anfitrión */}
              <form onSubmit={handleInviteModerator} className="space-y-3">
                <div className="flex gap-3">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@empresa.com"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'moderator' | 'co_host')}
                    className="bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="moderator">Moderador</option>
                    <option value="co_host">Co-anfitrión</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!inviteEmail.trim() || inviting}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {inviting ? 'Generando...' : 'Invitar'}
                  </button>
                </div>
                <p className="text-xs text-gray-600">
                  Moderador: chat + expulsar · Co-anfitrión: chat + expulsar + toggle chat + métricas
                </p>
              </form>

              {/* Link de invitacion generado */}
              {inviteLink && (
                <div className="bg-green-500/10 border border-green-500/25 rounded-lg p-4 space-y-2">
                  <p className="text-green-300 text-xs font-semibold uppercase tracking-wider">
                    Link de acceso generado — comparte con el moderador
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-green-200/80 font-mono bg-black/20 px-3 py-2 rounded truncate">
                      {inviteLink}
                    </code>
                    <button
                      onClick={copyInviteLink}
                      className="text-xs text-green-300 hover:text-green-200 transition-colors px-3 py-2 bg-green-500/10 rounded flex-shrink-0"
                    >
                      {copiedLink ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-yellow-300/60 text-xs">Expira en 7 días. Solo funciona una vez.</p>
                </div>
              )}

              {/* Lista de moderadores */}
              {moderators.length > 0 && (
                <div className="divide-y divide-white/5">
                  {moderators.map((mod) => {
                    const isRevoked = !!(mod as EventModerator & { revoked_at?: string }).revoked_at
                    return (
                      <div key={mod.id} className={`py-3 flex items-center justify-between ${isRevoked ? 'opacity-50' : ''}`}>
                        <div>
                          <p className="text-sm text-white">{mod.email}</p>
                          <p className="text-xs text-gray-500">
                            {isRevoked
                              ? 'Acceso revocado'
                              : mod.accepted_at
                                ? `Activo desde ${new Date(mod.accepted_at).toLocaleDateString('es-CO')}`
                                : `Invitado · Expira ${new Date(mod.expires_at).toLocaleDateString('es-CO')}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            mod.role === 'co_host'
                              ? 'bg-purple-500/15 text-purple-300'
                              : 'bg-blue-500/15 text-blue-300'
                          }`}>
                            {mod.role === 'co_host' ? 'Co-anfitrión' : 'Moderador'}
                          </span>
                          {isRevoked ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                              Revocado
                            </span>
                          ) : (
                            <>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                mod.accepted_at
                                  ? 'bg-green-500/15 text-green-300'
                                  : 'bg-yellow-500/15 text-yellow-300'
                              }`}>
                                {mod.accepted_at ? 'Activo' : 'Pendiente'}
                              </span>
                              <button
                                onClick={() => handleRevokeModerator(mod.id, mod.email)}
                                disabled={revokingId === mod.id}
                                className="text-xs text-red-400/60 hover:text-red-400 disabled:opacity-40 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                              >
                                {revokingId === mod.id ? '...' : 'Revocar'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Polls interactivos */}
        <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Polls interactivos</h2>
              <p className="text-xs text-gray-600 mt-0.5">Lanza encuestas en vivo para los asistentes</p>
            </div>
            <button onClick={() => setShowPollsTab((v) => !v)}
              className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
              {showPollsTab ? 'Cerrar' : 'Gestionar polls'}
            </button>
          </div>
          {showPollsTab && (
            <div className="p-5 space-y-6">
              <form onSubmit={handleCreatePoll} className="bg-gray-800/50 rounded-xl p-4 space-y-4">
                <p className="text-sm font-semibold text-white">Nuevo poll</p>
                <input type="text" value={newPollQ} onChange={(e) => setNewPollQ(e.target.value)}
                  placeholder="Escribe la pregunta..." className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                  maxLength={300} required />
                <div className="flex gap-2">
                  {(['multiple_choice', 'open', 'rating'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setNewPollType(t)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${newPollType === t ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      {t === 'multiple_choice' ? 'Selección múltiple' : t === 'open' ? 'Pregunta abierta' : 'Calificación 1-5'}
                    </button>
                  ))}
                </div>
                {newPollType === 'multiple_choice' && (
                  <div className="space-y-2">
                    {newPollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <input type="text" value={opt} onChange={(e) => setNewPollOptions((prev) => prev.map((o, j) => j === i ? e.target.value : o))}
                          placeholder={`Opción ${i + 1}`} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-purple-500/50" maxLength={100} />
                        {newPollOptions.length > 2 && (
                          <button type="button" onClick={() => setNewPollOptions((prev) => prev.filter((_, j) => j !== i))}
                            className="text-gray-600 hover:text-red-400 transition-colors px-2">✕</button>
                        )}
                      </div>
                    ))}
                    {newPollOptions.length < 5 && (
                      <button type="button" onClick={() => setNewPollOptions((prev) => [...prev, ''])}
                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors">+ Agregar opción</button>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={newPollShowResults} onChange={(e) => setNewPollShowResults(e.target.checked)} className="accent-purple-500" />
                    <span className="text-xs text-gray-400">Mostrar resultados a asistentes al votar</span>
                  </label>
                  <button type="submit" disabled={creatingPoll || !newPollQ.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
                    {creatingPoll ? 'Creando...' : 'Crear poll'}
                  </button>
                </div>
              </form>
              {pollsLoading ? (
                <p className="text-gray-500 text-sm text-center py-4">Cargando polls...</p>
              ) : polls.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-4">No hay polls creados aún.</p>
              ) : (
                <div className="space-y-3">
                  {polls.map((poll) => {
                    const tally = pollTallies[poll.id]
                    return (
                      <div key={poll.id} className={`rounded-xl border p-4 space-y-3 ${poll.status === 'active' ? 'border-purple-500/40 bg-purple-500/10' : 'border-white/10 bg-gray-800/30'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${poll.status === 'active' ? 'bg-purple-500/30 text-purple-300' : poll.status === 'closed' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}>
                                {poll.status === 'active' ? '● En vivo' : poll.status === 'closed' ? 'Cerrado' : 'Borrador'}
                              </span>
                              <span className="text-xs text-gray-600">{poll.type === 'multiple_choice' ? 'Selección' : poll.type === 'open' ? 'Abierta' : 'Rating'}</span>
                            </div>
                            <p className="text-sm text-white font-medium leading-snug">{poll.question}</p>
                            {poll.type === 'multiple_choice' && <p className="text-xs text-gray-600 mt-1">{poll.options.length} opciones</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {poll.status === 'draft' && (
                              <button onClick={() => handlePollStatusChange(poll.id, 'active')} disabled={!!pollLaunching}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors">
                                {pollLaunching === poll.id ? '...' : 'Lanzar'}
                              </button>
                            )}
                            {poll.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleToggleShowResults(poll.id, poll.show_results)}
                                  disabled={!!pollTogglingResults}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 ${
                                    poll.show_results
                                      ? 'bg-green-600 hover:bg-green-700 text-white'
                                      : 'bg-white/10 hover:bg-white/15 text-gray-300'
                                  }`}
                                >
                                  {pollTogglingResults === poll.id ? '...' : poll.show_results ? '📊 Ocultar resultados' : '📊 Mostrar resultados'}
                                </button>
                                <button onClick={() => handlePollStatusChange(poll.id, 'closed')} disabled={!!pollLaunching}
                                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors">
                                  {pollLaunching === poll.id ? '...' : 'Cerrar poll'}
                                </button>
                              </>
                            )}
                            {poll.status === 'closed' && !tally && (
                              <button onClick={() => fetchPollTally(poll.id)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-medium rounded-lg transition-colors">
                                Ver resultados
                              </button>
                            )}
                            {poll.status !== 'active' && (
                              <button onClick={() => handleDeletePoll(poll.id)} disabled={pollDeleting === poll.id}
                                className="text-red-400/40 hover:text-red-400 transition-colors text-xs px-2" title="Eliminar poll">
                                {pollDeleting === poll.id ? '...' : '✕'}
                              </button>
                            )}
                          </div>
                        </div>
                        {tally && (
                          <div className="border-t border-white/10 pt-3 space-y-2">
                            <p className="text-xs text-gray-500 font-medium">{tally.total} respuestas</p>
                            {tally.type === 'multiple_choice' && tally.options?.map((opt) => (
                              <div key={opt.id}>
                                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>{opt.text}</span><span>{opt.pct}%</span></div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${opt.pct}%` }} />
                                </div>
                              </div>
                            ))}
                            {tally.type === 'rating' && <p className="text-2xl font-bold text-white">{tally.avg} <span className="text-sm font-normal text-gray-400">/ 5</span></p>}
                            {tally.type === 'open' && Array.isArray(tally.responses) && (
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {tally.responses.map((r, i) => <p key={i} className="text-xs text-gray-300 bg-white/5 px-3 py-1.5 rounded-lg">{r}</p>)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Asistentes */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Asistentes registrados
              </h2>
              <p className="text-white text-lg font-semibold mt-1">{attendees.length}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Registro abierto</span>
                <button
                  onClick={handleOpenRegToggle}
                  disabled={openRegToggling}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    isOpenReg ? 'bg-teal-600' : 'bg-gray-700'
                  }`}
                  aria-label={isOpenReg ? 'Desactivar registro abierto' : 'Activar registro abierto'}
                  role="switch"
                  aria-checked={isOpenReg}
                  title={isOpenReg ? 'Los asistentes ingresan con nombre y correo' : 'Los asistentes necesitan usuario y contraseña'}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isOpenReg ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {!isOpenReg && (
                <button
                  onClick={() => setShowImport(true)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors"
                >
                  Importar CSV
                </button>
              )}
            </div>
          </div>
          {isOpenReg && (
            <div className="mb-4 bg-teal-500/10 border border-teal-500/25 rounded-lg px-4 py-3 text-sm text-teal-300">
              Registro abierto activo — los asistentes ingresan con nombre y correo, sin contraseña. Cada ingreso queda registrado independientemente.
            </div>
          )}

          {importFeedback && (
            <div className="mb-4 bg-green-500/15 border border-green-500/30 text-green-300 text-sm px-4 py-3 rounded-lg" role="status">
              Se importaron {importFeedback.imported} asistentes.
              {importFeedback.errors.length > 0 && (
                <span className="text-yellow-300 ml-2">{importFeedback.errors.length} errores.</span>
              )}
            </div>
          )}

          {attendees.length === 0 ? (
            <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-2">No hay asistentes aun.</p>
              <p className="text-gray-600 text-sm">Importa un CSV con la lista de asistentes.</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Nombre</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Email</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Usuario</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Rol</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {attendees.map((attendee, idx) => (
                      <tr key={attendee.id} className={`border-b border-white/5 ${idx === attendees.length - 1 ? 'border-b-0' : ''}`}>
                        <td className="px-5 py-3 text-sm text-white">{attendee.full_name}</td>
                        <td className="px-5 py-3 text-sm text-gray-400 hidden sm:table-cell">{attendee.email ?? '—'}</td>
                        <td className="px-5 py-3 text-sm text-gray-300 font-mono">{attendee.username}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            attendee.role === 'vip'
                              ? 'bg-yellow-500/15 text-yellow-300'
                              : attendee.role === 'moderator'
                              ? 'bg-blue-500/15 text-blue-300'
                              : 'bg-white/10 text-gray-300'
                          }`}>
                            {attendee.role}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {attendee.is_kicked ? (
                            <button
                              onClick={() => handleRestoreAccess(attendee.id)}
                              className="text-xs text-green-400 hover:text-green-300 transition-colors px-2 py-1 rounded hover:bg-green-500/10"
                            >
                              Expulsado · Restaurar
                            </button>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => handleDeleteAttendee(attendee.id, attendee.full_name)}
                            disabled={deletingAttendeeId === attendee.id}
                            className="text-xs text-red-400/50 hover:text-red-400 disabled:opacity-30 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                            title="Eliminar asistente"
                          >
                            {deletingAttendeeId === attendee.id ? '...' : 'Eliminar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {showImport && (
        <AttendeeImport
          eventId={eventId}
          onSuccess={handleImportSuccess}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
