'use client'
// app/admin/assemblies/new/page.tsx — Crear nueva asamblea

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Organization } from '@/types'

export default function NewAssemblyPage() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    organization_id: '',
    title: '',
    slug: '',
    description: '',
    scheduled_at: '',
    quorum_threshold_primera: '50.01',
    quorum_threshold_segunda: '0',
    total_coefficient: '1',
  })

  useEffect(() => {
    fetch('/api/admin/organizations').then(r => r.json()).then(setOrgs).catch(() => {})
  }, [])

  function handleTitleChange(title: string) {
    const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
    setForm(f => ({ ...f, title, slug }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.organization_id || !form.title || !form.slug || !form.scheduled_at) {
      setError('Completa todos los campos requeridos.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/assemblies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          quorum_threshold_primera: Number(form.quorum_threshold_primera) / 100,
          quorum_threshold_segunda: Number(form.quorum_threshold_segunda) / 100,
          total_coefficient: Number(form.total_coefficient),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al crear.'); return }
      router.push(`/admin/assemblies/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/admin/dashboard" className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-white">Nueva asamblea</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Organización */}
          <div className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Datos básicos</h2>

            <div className="space-y-1.5">
              <label className="text-sm text-gray-300">Organización *</label>
              <select
                value={form.organization_id}
                onChange={e => setForm(f => ({ ...f, organization_id: e.target.value }))}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                required
              >
                <option value="">Selecciona una organización...</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-gray-300">Título de la asamblea *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Asamblea General Ordinaria 2026"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-gray-300">Slug (URL) *</label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">asambleas.timesolutions.com.co/</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-purple-500/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-gray-300">Descripción</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Descripción opcional..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-gray-300">Fecha y hora *</label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                required
              />
            </div>
          </div>

          {/* Quórum */}
          <div className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Configuración de quórum</h2>
            <p className="text-xs text-gray-500">Los umbrales se expresan como porcentaje del coeficiente total. Ej: 50.01 = mayoría simple.</p>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-gray-300">Coef. total</label>
                <input
                  type="number"
                  value={form.total_coefficient}
                  onChange={e => setForm(f => ({ ...f, total_coefficient: e.target.value }))}
                  step="0.000001"
                  min="0.000001"
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                />
                <p className="text-xs text-gray-600">Suma total de coeficientes</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-gray-300">1ª convocatoria %</label>
                <input
                  type="number"
                  value={form.quorum_threshold_primera}
                  onChange={e => setForm(f => ({ ...f, quorum_threshold_primera: e.target.value }))}
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-gray-300">2ª convocatoria %</label>
                <input
                  type="number"
                  value={form.quorum_threshold_segunda}
                  onChange={e => setForm(f => ({ ...f, quorum_threshold_segunda: e.target.value }))}
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50"
                />
                <p className="text-xs text-gray-600">0 = cualquier quórum</p>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3">{error}</p>
          )}

          <div className="flex gap-3">
            <Link
              href="/admin/dashboard"
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-400 bg-white/5 hover:bg-white/10 transition-colors text-center"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creando...' : 'Crear asamblea'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
