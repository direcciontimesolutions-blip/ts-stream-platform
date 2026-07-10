'use client'
// app/admin/assemblies/[id]/page.tsx — Panel de control de asamblea

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'react-qr-code'
import type { Assembly, Organization, AssemblyUnit, AssemblyPoder, AssemblyMotion, AssemblyQuorum } from '@/types'

type AssemblyWithOrg = Assembly & { organizations: Organization & { slug: string } }

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', active: 'En curso', ended: 'Finalizada',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  ended: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string }> = {
  draft: { label: 'Iniciar asamblea', next: 'active', color: 'bg-green-600 hover:bg-green-700' },
  active: { label: 'Finalizar asamblea', next: 'ended', color: 'bg-gray-600 hover:bg-gray-700' },
}
const MOTION_TYPE_LABELS: Record<string, string> = {
  informativo: 'Informativo', voto_simple: 'Votación', voto_plancha: 'Plancha', voto_adhoc: 'Ad-hoc',
}
const MOTION_STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-500', open: 'text-green-400', closed: 'text-blue-400',
}

export default function AssemblyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const assemblyId = params.id as string

  const [assembly, setAssembly] = useState<AssemblyWithOrg | null>(null)
  const [units, setUnits] = useState<AssemblyUnit[]>([])
  const [poderes, setPoderes] = useState<AssemblyPoder[]>([])
  const [motions, setMotions] = useState<AssemblyMotion[]>([])
  const [quorum, setQuorum] = useState<AssemblyQuorum | null>(null)
  const [attendees, setAttendees] = useState<Array<{ id: string; full_name: string; username: string; role: string; assembly_units: { unit_number: string } | null }>>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'units' | 'poderes' | 'motions' | 'attendees'>('overview')

  // Estados para formularios
  const [statusLoading, setStatusLoading] = useState(false)
  const [actaFields, setActaFields] = useState({ assembly_type: 'ordinaria', acta_number: '', acta_location: '' })
  const [streamUrl, setStreamUrl] = useState('')
  const [streamUrlSaving, setStreamUrlSaving] = useState(false)
  const [streamUrlSaved, setStreamUrlSaved] = useState(false)
  const [actaSaving, setActaSaving] = useState(false)
  const [actaSaved, setActaSaved] = useState(false)
  const [downloadingActa, setDownloadingActa] = useState(false)
  const [csvUnitsText, setCsvUnitsText] = useState('')
  const [csvPoderesText, setCsvPoderesText] = useState('')
  const [csvAttendeesText, setCsvAttendeesText] = useState('')
  const [importingUnits, setImportingUnits] = useState(false)
  const [importingPoderes, setImportingPoderes] = useState(false)
  const [importingAttendees, setImportingAttendees] = useState(false)
  const [importFeedback, setImportFeedback] = useState<{ msg: string; ok: boolean } | null>(null)
  const [newMotion, setNewMotion] = useState({ title: '', description: '', motion_type: 'informativo', majority_type: 'simple', majority_pct: 50 })
  const [addingMotion, setAddingMotion] = useState(false)
  const [motionError, setMotionError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Array<{ id: string; title: string; url: string; order_index: number }>>([])
  const [newDoc, setNewDoc] = useState({ title: '', url: '' })
  const [addingDoc, setAddingDoc] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [aRes, uRes, pRes, mRes, atRes] = await Promise.all([
        fetch(`/api/admin/assemblies/${assemblyId}`),
        fetch(`/api/admin/assemblies/${assemblyId}/units`),
        fetch(`/api/admin/assemblies/${assemblyId}/poderes`),
        fetch(`/api/admin/assemblies/${assemblyId}/motions`),
        fetch(`/api/admin/assemblies/${assemblyId}/attendees`),
      ])
      if (aRes.status === 401) { router.push('/admin'); return }
      if (aRes.ok) {
        const aData = await aRes.json()
        setAssembly(aData)
        setActaFields({
          assembly_type: aData.assembly_type ?? 'ordinaria',
          acta_number: aData.acta_number ?? '',
          acta_location: aData.acta_location ?? '',
        })
        setStreamUrl(aData.stream_url ?? '')
      }
      if (uRes.ok) setUnits(await uRes.json())
      if (pRes.ok) setPoderes(await pRes.json())
      if (mRes.ok) setMotions(await mRes.json())
      if (atRes.ok) setAttendees(await atRes.json())
      const dRes = await fetch(`/api/admin/assemblies/${assemblyId}/documents`)
      if (dRes.ok) setDocuments(await dRes.json())
    } finally { setLoading(false) }
  }, [assemblyId, router])

  const fetchQuorum = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/quorum`)
      if (res.ok) setQuorum(await res.json())
    } catch {}
  }, [assemblyId])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (assembly?.status === 'active') {
      fetchQuorum()
      const interval = setInterval(fetchQuorum, 30_000)
      return () => clearInterval(interval)
    }
  }, [assembly?.status, fetchQuorum])

  async function handleStatusChange() {
    if (!assembly) return
    const transition = STATUS_TRANSITIONS[assembly.status]
    if (!transition) return
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: transition.next }),
      })
      if (res.ok) {
        const data = await res.json()
        setAssembly(prev => prev ? { ...prev, status: data.status } : prev)
      }
    } finally { setStatusLoading(false) }
  }

  async function handleConvocatoriaChange() {
    if (!assembly) return
    const next = assembly.current_convocatoria === 'primera' ? 'segunda' : 'primera'
    const res = await fetch(`/api/admin/assemblies/${assemblyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_convocatoria: next }),
    })
    if (res.ok) setAssembly(prev => prev ? { ...prev, current_convocatoria: next } : prev)
  }

  function parseCSV(text: string, fields: string[]) {
    return text.trim().split('\n').slice(1).map(line => {
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
      return Object.fromEntries(fields.map((f, i) => [f, parts[i] ?? '']))
    }).filter(row => Object.values(row).some(v => v))
  }

  async function handleImportUnits() {
    if (!csvUnitsText.trim()) return
    setImportingUnits(true)
    setImportFeedback(null)
    try {
      const rows = parseCSV(csvUnitsText, ['unit_number', 'owner_name', 'coefficient'])
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: rows }),
      })
      const data = await res.json()
      setImportFeedback({ msg: `${data.imported} unidades importadas.${data.errors?.length ? ` ${data.errors.length} errores.` : ''}`, ok: true })
      setCsvUnitsText('')
      fetchAll()
    } catch { setImportFeedback({ msg: 'Error al importar.', ok: false }) }
    finally { setImportingUnits(false) }
  }

  async function handleImportPoderes() {
    if (!csvPoderesText.trim()) return
    setImportingPoderes(true)
    setImportFeedback(null)
    try {
      const rows = parseCSV(csvPoderesText, ['unit_number', 'representative_name'])
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/poderes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poderes: rows }),
      })
      const data = await res.json()
      setImportFeedback({ msg: `${data.imported} poderes importados.${data.errors?.length ? ` ${data.errors.length} errores.` : ''}`, ok: true })
      setCsvPoderesText('')
      fetchAll()
    } catch { setImportFeedback({ msg: 'Error al importar.', ok: false }) }
    finally { setImportingPoderes(false) }
  }

  async function handleImportAttendees() {
    if (!csvAttendeesText.trim()) return
    setImportingAttendees(true)
    setImportFeedback(null)
    try {
      const rows = parseCSV(csvAttendeesText, ['unit_number', 'full_name', 'username', 'password'])
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendees: rows }),
      })
      const data = await res.json()
      setImportFeedback({ msg: `${data.imported} asistentes importados.${data.errors?.length ? ` ${data.errors.length} errores.` : ''}`, ok: true })
      setCsvAttendeesText('')
      fetchAll()
    } catch { setImportFeedback({ msg: 'Error al importar.', ok: false }) }
    finally { setImportingAttendees(false) }
  }

  async function handleAddMotion(e: React.FormEvent) {
    e.preventDefault()
    if (!newMotion.title.trim()) return
    setAddingMotion(true)
    setMotionError(null)
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/motions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMotion),
      })
      const data = await res.json()
      if (!res.ok) { setMotionError(data.error); return }
      setMotions(prev => [...prev, data])
      setNewMotion({ title: '', description: '', motion_type: 'informativo', majority_type: 'simple', majority_pct: 50 })
    } finally { setAddingMotion(false) }
  }

  async function handleSaveStreamUrl() {
    setStreamUrlSaving(true)
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_url: streamUrl || null }),
      })
      if (res.ok) { setStreamUrlSaved(true); setTimeout(() => setStreamUrlSaved(false), 2000) }
    } finally { setStreamUrlSaving(false) }
  }

  async function handleSaveActaFields() {
    setActaSaving(true)
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actaFields),
      })
      if (res.ok) { setActaSaved(true); setTimeout(() => setActaSaved(false), 2000) }
    } finally { setActaSaving(false) }
  }

  async function handleDownloadActa() {
    setDownloadingActa(true)
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/acta`)
      if (!res.ok) { alert('Error generando el acta.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `acta-${actaFields.acta_number || '001'}-${assembly?.slug ?? 'asamblea'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setDownloadingActa(false) }
  }

  async function handleMotionStatus(motionId: string, status: 'open' | 'closed' | 'pending') {
    const res = await fetch(`/api/admin/assemblies/${assemblyId}/motions/${motionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const data = await res.json()
      setMotions(prev => prev.map(m => m.id === motionId ? { ...m, ...data } : m))
    }
  }

  async function handleAddDoc(e: React.FormEvent) {
    e.preventDefault()
    if (!newDoc.title.trim() || !newDoc.url.trim()) return
    setAddingDoc(true)
    setDocError(null)
    try {
      const res = await fetch(`/api/admin/assemblies/${assemblyId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newDoc.title, url: newDoc.url, order_index: documents.length }),
      })
      const data = await res.json()
      if (!res.ok) { setDocError(data.error); return }
      setDocuments(prev => [...prev, data])
      setNewDoc({ title: '', url: '' })
    } finally { setAddingDoc(false) }
  }

  async function handleDeleteDoc(docId: string) {
    const res = await fetch(`/api/admin/assemblies/${assemblyId}/documents/${docId}`, { method: 'DELETE' })
    if (res.ok) setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!assembly) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-white">Asamblea no encontrada</p>
        <Link href="/admin/dashboard" className="text-purple-400 text-sm">Volver al dashboard</Link>
      </div>
    </div>
  )

  const transition = STATUS_TRANSITIONS[assembly.status]
  const badgeColor = STATUS_COLORS[assembly.status] ?? STATUS_COLORS.draft

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-white">{assembly.title}</h1>
              <p className="text-gray-500 text-xs">{assembly.organizations.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badgeColor}`}>
              {assembly.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              {STATUS_LABELS[assembly.status]}
            </span>
            <Link
              href={`/admin/assemblies/${assemblyId}/sala`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-600 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Pantalla sala
            </Link>
            {transition && (
              <button
                onClick={handleStatusChange}
                disabled={statusLoading}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${transition.color}`}
              >
                {statusLoading ? '...' : transition.label}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Tabs + Live button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1 bg-white/5 rounded-xl p-1 flex-wrap">
            {(['overview', 'units', 'poderes', 'motions', 'attendees'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {{ overview: 'General', units: `Unidades (${units.length})`, poderes: `Poderes (${poderes.length})`, motions: `Orden del día (${motions.length})`, attendees: `Asistentes (${attendees.length})` }[tab]}
              </button>
            ))}
          </div>
          <Link
            href={`/admin/assemblies/${assemblyId}/live`}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-700 hover:bg-green-600 transition-colors flex items-center gap-2 flex-shrink-0"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            Panel en vivo
          </Link>
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quórum */}
            {assembly.status === 'active' && quorum && (
              <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quórum en tiempo real</h2>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {assembly.current_convocatoria === 'primera' ? '1ª' : '2ª'} convocatoria
                    </span>
                    <button
                      onClick={handleConvocatoriaChange}
                      className="text-xs text-purple-400 hover:text-purple-300 px-2 py-1 rounded hover:bg-purple-500/10 transition-colors"
                    >
                      Cambiar a {assembly.current_convocatoria === 'primera' ? '2ª' : '1ª'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className={`text-3xl font-bold ${quorum.reached ? 'text-green-400' : 'text-yellow-400'}`}>
                      {quorum.pct.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Coeficiente presente</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-white">{quorum.threshold.toFixed(1)}%</p>
                    <p className="text-xs text-gray-500 mt-1">Umbral requerido</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-blue-400">{quorum.connected_count}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Conectados ({quorum.presencial_count} presencial)
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Progreso</span>
                    <span className={quorum.reached ? 'text-green-400 font-semibold' : ''}>
                      {quorum.reached ? '✓ Quórum alcanzado' : `Faltan ${(quorum.threshold - quorum.pct).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${quorum.reached ? 'bg-green-500' : 'bg-yellow-500'}`}
                      style={{ width: `${Math.min(100, quorum.threshold > 0 ? (quorum.pct / quorum.threshold) * 100 : 100)}%` }}
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Info + QR */}
            <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Información</h2>
              <div className="flex items-start gap-6">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-gray-500 text-xs mb-1">Fecha</p>
                    <p className="text-white">{new Date(assembly.scheduled_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">Slug</p><p className="text-white font-mono">{assembly.slug}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">Coef. total</p><p className="text-white">{assembly.total_coefficient}</p></div>
                  <div><p className="text-gray-500 text-xs mb-1">Unidades</p><p className="text-white">{units.length}</p></div>
                </div>
                {/* QR de acceso asistentes */}
                {assembly.organizations?.slug && assembly.slug && (
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="bg-white p-2.5 rounded-xl">
                      <QRCode
                        value={`https://live.timesolutions.com.co/${assembly.organizations.slug}/${assembly.slug}`}
                        size={80}
                        bgColor="#ffffff"
                        fgColor="#111827"
                      />
                    </div>
                    <p className="text-gray-600 text-xs text-center">Acceso asistentes</p>
                  </div>
                )}
              </div>
            </section>

            {/* URL de Transmisión */}
            <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">URL de Transmisión</h2>
              <p className="text-xs text-gray-600">Link del stream que verán los asistentes en su portal (YouTube, Cloudflare, Zoom, etc.)</p>
              <div className="flex gap-3">
                <input
                  type="url"
                  value={streamUrl}
                  onChange={e => setStreamUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  onClick={handleSaveStreamUrl}
                  disabled={streamUrlSaving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {streamUrlSaving ? 'Guardando...' : 'Guardar URL'}
                </button>
                {streamUrlSaved && <span className="flex items-center text-green-400 text-xs">✓ Guardado</span>}
              </div>
            </section>

            {/* Documentos descargables */}
            <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Documentos para asistentes</h2>
              <p className="text-xs text-gray-600">Links de Google Drive, Dropbox u otro servicio. Los asistentes los verán en su portal.</p>

              {documents.length > 0 && (
                <ul className="space-y-2">
                  {documents.map(doc => (
                    <li key={doc.id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5">
                      <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{doc.title}</p>
                        <p className="text-xs text-gray-500 truncate">{doc.url}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleAddDoc} className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={newDoc.title}
                  onChange={e => setNewDoc(d => ({ ...d, title: e.target.value }))}
                  placeholder="Nombre del documento"
                  className="flex-1 min-w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                />
                <input
                  type="url"
                  value={newDoc.url}
                  onChange={e => setNewDoc(d => ({ ...d, url: e.target.value }))}
                  placeholder="https://drive.google.com/..."
                  className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  type="submit"
                  disabled={addingDoc || !newDoc.title.trim() || !newDoc.url.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {addingDoc ? 'Agregando...' : 'Agregar'}
                </button>
              </form>
              {docError && <p className="text-red-400 text-xs">{docError}</p>}
            </section>

            {/* Acta PDF */}
            <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Acta PDF — Ley 675/2001</h2>
                {assembly.status === 'ended' && (
                  <button
                    onClick={handleDownloadActa}
                    disabled={downloadingActa}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {downloadingActa ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {downloadingActa ? 'Generando...' : 'Descargar Acta'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Tipo de asamblea</label>
                  <div className="flex gap-2">
                    {(['ordinaria', 'extraordinaria'] as const).map(tipo => (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => setActaFields(f => ({ ...f, assembly_type: tipo }))}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors capitalize ${
                          actaFields.assembly_type === tipo
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {tipo === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Número de acta</label>
                  <input
                    type="text"
                    value={actaFields.acta_number}
                    onChange={e => setActaFields(f => ({ ...f, acta_number: e.target.value }))}
                    placeholder="001"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Lugar / modalidad</label>
                  <input
                    type="text"
                    value={actaFields.acta_location}
                    onChange={e => setActaFields(f => ({ ...f, acta_location: e.target.value }))}
                    placeholder="modalidad virtual"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveActaFields}
                  disabled={actaSaving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {actaSaving ? 'Guardando...' : 'Guardar campos'}
                </button>
                {actaSaved && <span className="text-green-400 text-xs">✓ Guardado</span>}
                {assembly.status !== 'ended' && (
                  <span className="text-gray-600 text-xs">El acta se puede descargar cuando la asamblea esté finalizada.</span>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ── UNIDADES ── */}
        {activeTab === 'units' && (
          <div className="space-y-6">
            <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Importar unidades — CSV</h2>
                <p className="text-xs text-gray-600 mt-1">Encabezado: unit_number,owner_name,coefficient</p>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={csvUnitsText}
                  onChange={e => setCsvUnitsText(e.target.value)}
                  rows={6}
                  placeholder={'unit_number,owner_name,coefficient\n101,Juan García,0.025\n102,María López,0.025'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 font-mono focus:outline-none focus:border-purple-500/50 resize-none"
                />
                <button
                  onClick={handleImportUnits}
                  disabled={importingUnits || !csvUnitsText.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {importingUnits ? 'Importando...' : 'Importar'}
                </button>
                {importFeedback && (
                  <p className={`text-sm ${importFeedback.ok ? 'text-green-400' : 'text-red-400'}`}>{importFeedback.msg}</p>
                )}
              </div>
            </section>

            {units.length > 0 && (
              <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Unidades ({units.length})</span>
                  <span className="text-xs text-gray-500">
                    Total coef: {units.reduce((s, u) => s + Number(u.coefficient), 0).toFixed(6)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-white/10">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Unidad</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Propietario</th>
                      <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Coeficiente</th>
                    </tr></thead>
                    <tbody>
                      {units.map((u, i) => (
                        <tr key={u.id} className={`border-b border-white/5 ${i === units.length - 1 ? 'border-b-0' : ''}`}>
                          <td className="px-5 py-3 text-sm text-white font-mono">{u.unit_number}</td>
                          <td className="px-5 py-3 text-sm text-gray-300">{u.owner_name}</td>
                          <td className="px-5 py-3 text-sm text-gray-400 text-right">{Number(u.coefficient).toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── PODERES ── */}
        {activeTab === 'poderes' && (
          <div className="space-y-6">
            <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Importar poderes — CSV</h2>
                <p className="text-xs text-gray-600 mt-1">Encabezado: unit_number,representative_name (la unidad debe existir)</p>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={csvPoderesText}
                  onChange={e => setCsvPoderesText(e.target.value)}
                  rows={5}
                  placeholder={'unit_number,representative_name\n101,Carlos Martínez\n203,Ana Rodríguez'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 font-mono focus:outline-none focus:border-purple-500/50 resize-none"
                />
                <button
                  onClick={handleImportPoderes}
                  disabled={importingPoderes || !csvPoderesText.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {importingPoderes ? 'Importando...' : 'Importar poderes'}
                </button>
                {importFeedback && (
                  <p className={`text-sm ${importFeedback.ok ? 'text-green-400' : 'text-red-400'}`}>{importFeedback.msg}</p>
                )}
              </div>
            </section>

            {poderes.length > 0 && (
              <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10">
                  <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Poderes registrados ({poderes.length})</span>
                </div>
                <div className="divide-y divide-white/5">
                  {poderes.map(p => (
                    <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm text-white font-mono">
                          {(p.granting_unit as unknown as { unit_number: string })?.unit_number ?? '—'}
                          <span className="text-gray-500 font-sans"> otorga poder a </span>
                          {p.representative_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          Coef: {(p.granting_unit as unknown as { coefficient: number })?.coefficient ?? '—'}
                          {p.confirmed_at && <span className="ml-2 text-green-400">✓ Confirmado</span>}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.verified ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                        {p.verified ? 'Verificado' : 'Pendiente'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── ORDEN DEL DÍA ── */}
        {activeTab === 'motions' && (
          <div className="space-y-6">
            {/* Agregar punto */}
            <section className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Agregar punto</h2>
              <form onSubmit={handleAddMotion} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newMotion.title}
                    onChange={e => setNewMotion(m => ({ ...m, title: e.target.value }))}
                    placeholder="Título del punto..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                    required
                  />
                  <select
                    value={newMotion.motion_type}
                    onChange={e => setNewMotion(m => ({ ...m, motion_type: e.target.value }))}
                    className="bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="informativo">Informativo</option>
                    <option value="voto_simple">Votación Sí/No</option>
                    <option value="voto_plancha">Votación Plancha</option>
                    <option value="voto_adhoc">Ad-hoc</option>
                  </select>
                </div>
                {newMotion.motion_type !== 'informativo' && (
                  <div className="flex gap-3">
                    <select
                      value={newMotion.majority_type}
                      onChange={e => setNewMotion(m => ({ ...m, majority_type: e.target.value }))}
                      className="bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                    >
                      <option value="simple">Mayoría simple</option>
                      <option value="calificada">Mayoría calificada</option>
                    </select>
                    {newMotion.majority_type === 'calificada' && (
                      <input
                        type="number"
                        value={newMotion.majority_pct}
                        onChange={e => setNewMotion(m => ({ ...m, majority_pct: Number(e.target.value) }))}
                        min={51}
                        max={100}
                        className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                      />
                    )}
                  </div>
                )}
                {motionError && <p className="text-red-400 text-xs">{motionError}</p>}
                <button
                  type="submit"
                  disabled={addingMotion || !newMotion.title.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {addingMotion ? 'Agregando...' : '+ Agregar punto'}
                </button>
              </form>
            </section>

            {/* Lista de puntos */}
            {motions.length > 0 && (
              <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
                <div className="divide-y divide-white/5">
                  {motions.map((m, i) => (
                    <div key={m.id} className="px-5 py-4 flex items-center gap-4 hover:bg-white/3 transition-colors">
                      <span className="text-gray-500 text-sm w-6 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{m.title}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400">{MOTION_TYPE_LABELS[m.motion_type]}</span>
                          {m.motion_type !== 'informativo' && (
                            <span className="text-xs text-gray-400">
                              {m.majority_type === 'calificada' ? `${m.majority_pct}% calificada` : 'Mayoría simple'}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${MOTION_STATUS_COLORS[m.status]}`}>
                        {{ pending: 'Pendiente', open: '● Abierta', closed: 'Cerrada' }[m.status]}
                      </span>
                      {m.motion_type !== 'informativo' && (
                        <div className="flex gap-2 flex-shrink-0">
                          {m.status === 'pending' && (
                            <button
                              onClick={() => handleMotionStatus(m.id, 'open')}
                              className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                            >
                              Abrir votación
                            </button>
                          )}
                          {m.status === 'open' && (
                            <button
                              onClick={() => handleMotionStatus(m.id, 'closed')}
                              className="text-xs px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white transition-colors"
                            >
                              Cerrar votación
                            </button>
                          )}
                          {m.status === 'closed' && (
                            <button
                              onClick={() => handleMotionStatus(m.id, 'pending')}
                              className="text-xs px-3 py-1.5 rounded-lg bg-yellow-700/80 hover:bg-yellow-700 text-white transition-colors"
                            >
                              Reabrir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {motions.length === 0 && (
              <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
                <p className="text-gray-500 text-sm">No hay puntos en el orden del día aún.</p>
              </div>
            )}
          </div>
        )}

        {/* ── ASISTENTES ── */}
        {activeTab === 'attendees' && (
          <div className="space-y-6">
            <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Importar asistentes — CSV</h2>
                <p className="text-xs text-gray-600 mt-1">Encabezado: unit_number,full_name,username,password (unit_number opcional)</p>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={csvAttendeesText}
                  onChange={e => setCsvAttendeesText(e.target.value)}
                  rows={6}
                  placeholder={'unit_number,full_name,username,password\n101,Juan García,101,1234\n102,María López,102,5678\n,Carlos Vidal (observador),cv_obs,9999'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 font-mono focus:outline-none focus:border-purple-500/50 resize-none"
                />
                <button
                  onClick={handleImportAttendees}
                  disabled={importingAttendees || !csvAttendeesText.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {importingAttendees ? 'Importando...' : 'Importar asistentes'}
                </button>
                {importFeedback && (
                  <p className={`text-sm ${importFeedback.ok ? 'text-green-400' : 'text-red-400'}`}>{importFeedback.msg}</p>
                )}
              </div>
            </section>

            {attendees.length > 0 && (
              <section className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Asistentes ({attendees.length})</span>
                  <span className="text-xs text-gray-500">Acceso: asambleas.timesolutions.com.co/{assembly?.organizations?.slug ?? '...'}/{assembly?.slug ?? '...'}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-white/10">
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Nombre</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Usuario</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Unidad</th>
                      <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Rol</th>
                    </tr></thead>
                    <tbody>
                      {attendees.map((a, i) => (
                        <tr key={a.id} className={`border-b border-white/5 ${i === attendees.length - 1 ? 'border-b-0' : ''}`}>
                          <td className="px-5 py-3 text-sm text-white">{a.full_name}</td>
                          <td className="px-5 py-3 text-sm text-gray-400 font-mono">{a.username}</td>
                          <td className="px-5 py-3 text-sm text-gray-400">{a.assembly_units?.unit_number ?? '—'}</td>
                          <td className="px-5 py-3 text-sm text-gray-500 capitalize">{a.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {attendees.length === 0 && (
              <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
                <p className="text-gray-500 text-sm">No hay asistentes registrados aún.</p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
