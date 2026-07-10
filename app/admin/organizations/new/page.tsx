'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const COLORS = [
  { label: 'Morado', value: '#7C3AED' },
  { label: 'Azul', value: '#2563EB' },
  { label: 'Verde', value: '#059669' },
  { label: 'Rojo', value: '#DC2626' },
  { label: 'Naranja', value: '#EA580C' },
  { label: 'Rosa', value: '#DB2777' },
]

export default function NewOrganizationPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#7C3AED')
  const [plan, setPlan] = useState<'free' | 'paid'>('free')
  const [mode, setMode] = useState<'ts_solo' | 'hybrid' | 'autonomous'>('ts_solo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function autoSlug(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!slug || slug === autoSlug(name)) {
      setSlug(autoSlug(value))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          primary_color: primaryColor,
          secondary_color: '#FFFFFF',
          plan,
          management_mode: mode,
        }),
      })

      const data = await res.json() as { error?: string; id?: string }

      if (!res.ok) {
        setError(data.error ?? 'Error al crear la organización.')
        return
      }

      router.push('/admin/dashboard')
      router.refresh()
    } catch {
      setError('Error de red. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-white">TS Stream Admin</span>
          </div>
          <Link
            href="/admin/dashboard"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Volver al dashboard
          </Link>
        </div>
      </header>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Nueva organización</h1>
        <p className="text-gray-400 text-sm mb-8">
          Cada cliente tiene su propia organización. Los eventos y asistentes se asocian a ella.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Nombre de la empresa *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Ej: Bancolombia"
              required
              className="w-full bg-gray-900 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Slug (URL)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm shrink-0">live.timesolutions.com.co/</span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="bancolombia"
                className="flex-1 bg-gray-900 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors font-mono text-sm"
              />
            </div>
            <p className="text-gray-600 text-xs mt-1">Se genera automáticamente del nombre. Solo letras, números y guiones.</p>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Color principal
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setPrimaryColor(c.value)}
                  title={c.label}
                  className={`w-9 h-9 rounded-full transition-all ${primaryColor === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' : 'opacity-70 hover:opacity-100'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
              <input
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                title="Color personalizado"
                className="w-9 h-9 rounded-full cursor-pointer border-0 bg-transparent p-0"
              />
            </div>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Plan</label>
            <div className="flex gap-3">
              {([['free', 'YouTube (gratuito)'], ['paid', 'Cloudflare Stream (pago)']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPlan(val)}
                  className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    plan === val
                      ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                      : 'border-white/10 bg-gray-900 text-gray-400 hover:border-white/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Modo de gestión */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Modo de gestión</label>
            <div className="space-y-2">
              {([
                ['ts_solo', 'Solo Time Solutions', 'El equipo de TS gestiona todo.'],
                ['hybrid', 'Híbrido (TS + agente IA)', 'TS supervisa, el agente ejecuta tareas rutinarias.'],
                ['autonomous', 'Agente IA autónomo', 'El agente maneja la plataforma sin intervención manual.'],
              ] as const).map(([val, label, desc]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMode(val)}
                  className={`w-full text-left py-3 px-4 rounded-lg border transition-colors ${
                    mode === val
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 bg-gray-900 hover:border-white/20'
                  }`}
                >
                  <p className={`text-sm font-medium ${mode === val ? 'text-purple-300' : 'text-white'}`}>{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Preview & Submit */}
          <div className="flex items-center gap-3 pt-2">
            {name && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium flex-1"
                style={{ backgroundColor: `${primaryColor}20`, borderColor: primaryColor, border: `1px solid ${primaryColor}40`, color: primaryColor }}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: primaryColor }} />
                {name}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !name}
              className="px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {loading ? 'Creando...' : 'Crear organización'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
