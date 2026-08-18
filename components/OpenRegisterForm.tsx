'use client'
// components/OpenRegisterForm.tsx — Formulario de auto-registro (nombre + correo, sin contraseña)

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  org: string
  event: string
  primaryColor: string
}

export default function OpenRegisterForm({ org, event, primaryColor }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({ full_name: '', document_id: '', email: '', company: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const isValid =
    form.full_name.trim() && form.document_id.trim() && form.email.trim() && form.company.trim() && form.phone.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org,
          event,
          full_name: form.full_name.trim(),
          document_id: form.document_id.trim(),
          email: form.email.trim(),
          company: form.company.trim(),
          phone: form.phone.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al ingresar.')
        return
      }
      router.push(`/${org}/${event}/watch`)
      router.refresh()
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          className="bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg"
          role="alert"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-white/70 mb-1.5">
          Nombre completo
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          value={form.full_name}
          onChange={handleChange}
          required
          autoComplete="name"
          className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          placeholder="Juan García"
        />
      </div>

      <div>
        <label htmlFor="document_id" className="block text-sm font-medium text-white/70 mb-1.5">
          Cédula o documento de identidad
        </label>
        <input
          id="document_id"
          name="document_id"
          type="text"
          value={form.document_id}
          onChange={handleChange}
          required
          autoComplete="off"
          inputMode="text"
          className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          placeholder="1020304050"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-1.5">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
          autoComplete="email"
          className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          placeholder="juan@empresa.com"
        />
      </div>

      <div>
        <label htmlFor="company" className="block text-sm font-medium text-white/70 mb-1.5">
          Empresa / Institución
        </label>
        <input
          id="company"
          name="company"
          type="text"
          value={form.company}
          onChange={handleChange}
          required
          autoComplete="organization"
          className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          placeholder="Nombre de tu empresa o institución"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-white/70 mb-1.5">
          Teléfono
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          value={form.phone}
          onChange={handleChange}
          required
          autoComplete="tel"
          className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
          placeholder="300 123 4567"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !isValid}
        style={{ backgroundColor: primaryColor }}
        className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
      >
        {loading ? 'Ingresando...' : 'Ingresar al evento'}
      </button>
    </form>
  )
}
