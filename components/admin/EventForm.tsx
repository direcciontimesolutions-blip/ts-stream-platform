'use client'
// components/admin/EventForm.tsx — Formulario crear/editar evento

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { slugify } from '@/lib/utils'
import type { Organization } from '@/types'

interface EventFormProps {
  organizations: Organization[]
}

export default function EventForm({ organizations }: EventFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    organization_id: organizations[0]?.id ?? '',
    title: '',
    slug: '',
    description: '',
    start_at: '',
    end_at: '',
    streaming_tier: 'youtube' as 'youtube' | 'cloudflare' | 'teams',
    youtube_url: '',
    primary_color: '#7C3AED',
    secondary_color: '#FFFFFF',
    logo_url: '',
  })

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugify(title),
    }))
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const payload = {
        organization_id: form.organization_id,
        title: form.title.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        streaming_tier: form.streaming_tier,
        youtube_url: form.youtube_url.trim() || null,
        branding: {
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          logo_url: form.logo_url.trim() || null,
        },
      }

      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al crear el evento.')
        setLoading(false)
        return
      }

      router.push(`/admin/events/${data.id}`)
    } catch {
      setError('Error de conexion. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {error && (
        <div className="bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg" role="alert">
          {error}
        </div>
      )}

      {/* Organizacion */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Organizacion
        </legend>
        <div>
          <label htmlFor="organization_id" className="block text-sm font-medium text-white/80 mb-1.5">
            Cliente / Organizacion
          </label>
          <select
            id="organization_id"
            name="organization_id"
            value={form.organization_id}
            onChange={handleChange}
            className="w-full bg-gray-800 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
            required
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id} className="bg-gray-900">
                {org.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* Info basica */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Informacion del evento
        </legend>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-white/80 mb-1.5">
            Titulo del evento
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={form.title}
            onChange={handleTitleChange}
            required
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            placeholder="Ej: Conferencia Annual 2025"
          />
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-white/80 mb-1.5">
            URL del evento (slug)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-white/30 text-sm">/org/</span>
            <input
              id="slug"
              name="slug"
              type="text"
              value={form.slug}
              onChange={handleChange}
              required
              pattern="[a-z0-9-]+"
              title="Solo letras minusculas, numeros y guiones"
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors font-mono text-sm"
              placeholder="conferencia-anual-2025"
            />
          </div>
          <p className="text-white/30 text-xs mt-1">Solo letras minusculas, numeros y guiones</p>
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-white/80 mb-1.5">
            Descripcion (opcional)
          </label>
          <textarea
            id="description"
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={3}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors resize-none"
            placeholder="Descripcion breve del evento..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="start_at" className="block text-sm font-medium text-white/80 mb-1.5">
              Fecha y hora de inicio
            </label>
            <input
              id="start_at"
              name="start_at"
              type="datetime-local"
              value={form.start_at}
              onChange={handleChange}
              required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="end_at" className="block text-sm font-medium text-white/80 mb-1.5">
              Fecha y hora de fin
            </label>
            <input
              id="end_at"
              name="end_at"
              type="datetime-local"
              value={form.end_at}
              onChange={handleChange}
              required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
        </div>
      </fieldset>

      {/* Streaming */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Streaming
        </legend>

        <div>
          <span className="block text-sm font-medium text-white/80 mb-2">Tier de streaming</span>
          <div className="flex gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="streaming_tier"
                value="youtube"
                checked={form.streaming_tier === 'youtube'}
                onChange={handleChange}
                className="accent-purple-500"
              />
              <span className="text-sm text-white/80">YouTube</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="streaming_tier"
                value="teams"
                checked={form.streaming_tier === 'teams'}
                onChange={handleChange}
                className="accent-purple-500"
              />
              <span className="text-sm text-white/80">Microsoft Teams</span>
            </label>
            <label className="flex items-center gap-2 cursor-not-allowed opacity-40" title="Disponible en Fase 2">
              <input
                type="radio"
                name="streaming_tier"
                value="cloudflare"
                checked={form.streaming_tier === 'cloudflare'}
                onChange={handleChange}
                disabled
                className="accent-purple-500"
              />
              <span className="text-sm text-white/80">Cloudflare Stream</span>
              <span className="text-xs text-white/30">(Fase 2)</span>
            </label>
          </div>
        </div>

        {form.streaming_tier === 'youtube' && (
          <div>
            <label htmlFor="youtube_url" className="block text-sm font-medium text-white/80 mb-1.5">
              URL de YouTube
            </label>
            <input
              id="youtube_url"
              name="youtube_url"
              type="url"
              value={form.youtube_url}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              placeholder="https://www.youtube.com/watch?v=... o https://youtu.be/..."
            />
          </div>
        )}

        {form.streaming_tier === 'teams' && (
          <div>
            <label htmlFor="youtube_url" className="block text-sm font-medium text-white/80 mb-1.5">
              URL del iframe de Teams
            </label>
            <input
              id="youtube_url"
              name="youtube_url"
              type="url"
              value={form.youtube_url}
              onChange={handleChange}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              placeholder="https://teams.microsoft.com/convene/townhall?eventId=..."
            />
            <p className="text-white/30 text-xs mt-1">Pega solo la URL del src del iframe (sin las etiquetas HTML)</p>
          </div>
        )}
      </fieldset>

      {/* Branding */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Branding del evento
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="primary_color" className="block text-sm font-medium text-white/80 mb-1.5">
              Color primario
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="primary_color"
                name="primary_color"
                value={form.primary_color}
                onChange={handleChange}
                className="h-10 w-10 rounded cursor-pointer border border-white/15 bg-transparent"
              />
              <span className="text-white/60 text-sm font-mono">{form.primary_color}</span>
            </div>
          </div>
          <div>
            <label htmlFor="secondary_color" className="block text-sm font-medium text-white/80 mb-1.5">
              Color secundario
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="secondary_color"
                name="secondary_color"
                value={form.secondary_color}
                onChange={handleChange}
                className="h-10 w-10 rounded cursor-pointer border border-white/15 bg-transparent"
              />
              <span className="text-white/60 text-sm font-mono">{form.secondary_color}</span>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="logo_url" className="block text-sm font-medium text-white/80 mb-1.5">
            URL del logo (opcional)
          </label>
          <input
            id="logo_url"
            name="logo_url"
            type="url"
            value={form.logo_url}
            onChange={handleChange}
            className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            placeholder="https://..."
          />
        </div>

        {/* Preview del branding */}
        <div
          className="rounded-lg p-4 border border-white/10 flex items-center gap-3"
          style={{ backgroundColor: form.primary_color + '20' }}
        >
          <div
            className="w-8 h-8 rounded-full flex-shrink-0"
            style={{ backgroundColor: form.primary_color }}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-white">Preview del branding</p>
            <p className="text-xs text-white/50">El portal del evento usara estos colores</p>
          </div>
        </div>
      </fieldset>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creando evento...' : 'Crear evento'}
        </button>
      </div>
    </form>
  )
}
