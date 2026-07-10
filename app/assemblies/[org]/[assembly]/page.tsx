'use client'
// app/assemblies/[org]/[assembly]/page.tsx — Login de asistente de asamblea

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

interface AssemblyInfo {
  title: string
  status: string
  scheduled_at: string
  org: { name: string; primary_color: string }
}

export default function AssemblyLoginPage() {
  const params = useParams()
  const org = params.org as string
  const assembly = params.assembly as string

  const [info, setInfo] = useState<AssemblyInfo | null>(null)
  const [infoError, setInfoError] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/assembly/${org}/${assembly}/info`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setInfo)
      .catch(() => setInfoError(true))
  }, [org, assembly])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/assembly/${org}/${assembly}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al ingresar. Verifica tus credenciales.')
        return
      }

      window.location.href = data.redirect
    } catch {
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const primaryColor = info?.org?.primary_color ?? '#7c3aed'

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">

      {/* Logo / Branding */}
      <div className="mb-8 text-center space-y-2">
        <div
          className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4"
          style={{ backgroundColor: primaryColor }}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {info ? (
          <>
            <p className="text-gray-400 text-sm">{info.org.name}</p>
            <h1 className="text-xl font-bold text-white">{info.title}</h1>
            <div className="flex items-center justify-center gap-2 mt-1">
              {info.status === 'active' ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  En curso
                </span>
              ) : info.status === 'draft' ? (
                <span className="text-xs text-yellow-400">Próximamente — {new Date(info.scheduled_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              ) : (
                <span className="text-xs text-gray-500">Asamblea finalizada</span>
              )}
            </div>
          </>
        ) : infoError ? (
          <p className="text-red-400 text-sm">Asamblea no encontrada.</p>
        ) : (
          <div className="space-y-2">
            <div className="h-4 bg-white/10 rounded animate-pulse w-32 mx-auto" />
            <div className="h-6 bg-white/10 rounded animate-pulse w-56 mx-auto" />
          </div>
        )}
      </div>

      {/* Formulario */}
      <div className="w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm text-gray-300">
              Usuario
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ej: 101"
              autoComplete="username"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-purple-500/60 transition-colors"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm text-gray-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-purple-500/60 transition-colors"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim() || info?.status === 'ended'}
            style={{ backgroundColor: loading ? undefined : primaryColor }}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-50 hover:opacity-90"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Ingresando...
              </span>
            ) : 'Ingresar a la asamblea'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-4">
          Si tienes problemas para ingresar, contacta al administrador de tu conjunto.
        </p>
      </div>
    </div>
  )
}
