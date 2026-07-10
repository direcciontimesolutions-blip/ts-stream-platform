'use client'
// components/LoginForm.tsx — Form de login para asistentes

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface LoginFormProps {
  org: string
  event: string
  primaryColor: string
}

export default function LoginForm({ org, event, primaryColor }: LoginFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const username = usernameRef.current?.value.trim() ?? ''
    const password = passwordRef.current?.value ?? ''

    if (!username || !password) {
      setError('Por favor completa todos los campos.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org, event, username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Usuario o contraseña incorrectos.')
        setLoading(false)
        return
      }

      // Redirect al portal del evento
      router.push(`/${org}/${event}/watch`)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-5"
      noValidate
      aria-label="Formulario de acceso al evento"
    >
      <div className="space-y-2">
        <label
          htmlFor="username"
          className="block text-sm font-medium text-white/80"
        >
          Usuario
        </label>
        <input
          id="username"
          name="username"
          type="text"
          ref={usernameRef}
          autoComplete="username"
          autoFocus
          required
          disabled={loading}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 focus:ring-1 transition-colors disabled:opacity-50"
          placeholder="Tu usuario de acceso"
          style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-white/80"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          ref={passwordRef}
          autoComplete="current-password"
          required
          disabled={loading}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 focus:ring-1 transition-colors disabled:opacity-50"
          placeholder="Tu contraseña"
        />
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-lg font-semibold text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        style={{
          backgroundColor: primaryColor,
          '--tw-ring-color': primaryColor,
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          if (!loading) (e.target as HTMLButtonElement).style.filter = 'brightness(0.85)'
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.filter = ''
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Ingresando...
          </span>
        ) : (
          'Ingresar al evento'
        )}
      </button>
    </form>
  )
}
