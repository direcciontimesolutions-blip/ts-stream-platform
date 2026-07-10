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
  const [form, setForm] = useState({ full_name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, event, full_name: form.full_name.trim(), email: form.email.trim() }),
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

      <button
        type="submit"
        disabled={loading || !form.full_name.trim() || !form.email.trim()}
        style={{ backgroundColor: primaryColor }}
        className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
      >
        {loading ? 'Ingresando...' : 'Ingresar al evento'}
      </button>
    </form>
  )
}
