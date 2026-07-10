'use client'
// app/assemblies/[org]/[assembly]/checkin/page.tsx — Check-in presencial via QR

import { useState, useEffect, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface AssemblyInfo {
  title: string
  status: string
  org: { name: string; primary_color: string }
}

function CheckinContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const org = params.org as string
  const assembly = params.assembly as string
  const qrToken = searchParams.get('token') ?? ''

  const [info, setInfo] = useState<AssemblyInfo | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch(`/api/assembly/${org}/${assembly}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setInfo(data))
      .catch(() => {})
  }, [org, assembly])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!qrToken) { setError('Código QR inválido. Escanea el QR nuevamente.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/assembly/${org}/${assembly}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, qr_token: qrToken }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al registrarse.'); return }
      setSuccess(true)
      setTimeout(() => { window.location.href = data.redirect }, 1500)
    } catch {
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const primaryColor = info?.org?.primary_color ?? '#7c3aed'

  if (!qrToken) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-red-400 font-medium">Código QR inválido</p>
          <p className="text-gray-500 text-sm">Escanea el código QR oficial de la asamblea para acceder.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center space-y-2">
        <div
          className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4"
          style={{ backgroundColor: primaryColor }}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        {info ? (
          <>
            <p className="text-gray-400 text-sm">{info.org.name}</p>
            <h1 className="text-xl font-bold text-white">{info.title}</h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              Registro presencial
            </span>
          </>
        ) : (
          <div className="h-6 bg-white/10 rounded animate-pulse w-48 mx-auto" />
        )}
      </div>

      <div className="w-full max-w-sm">
        {success ? (
          <div className="bg-green-500/10 border border-green-500/25 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 font-semibold">¡Registro exitoso!</p>
            <p className="text-gray-400 text-sm">Redirigiendo a la asamblea...</p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 space-y-4"
          >
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm text-gray-300">Usuario</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Ej: 101"
                autoComplete="username"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-gray-300">Contraseña</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 text-sm focus:outline-none focus:border-blue-500/60 transition-colors"
                required
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-50 hover:opacity-90 bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Registrando...' : 'Registrar asistencia presencial'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function CheckinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CheckinContent />
    </Suspense>
  )
}
