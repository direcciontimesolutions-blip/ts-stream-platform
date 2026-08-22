// app/embed/[eventId]/page.tsx — Pagina publica pensada para vivir DENTRO de
// un <iframe> en la plataforma de un proveedor externo. Sin branding, sin
// chat, sin sesion de asistente — solo el video, a pantalla completa.
//
// Reusa el mismo patron de EventPlayer.tsx: reconsulta la URL firmada cada
// 60s y solo reinicia el <iframe> interno si el uid activo realmente cambio
// (failover primary->backup) — asi el proveedor nunca tiene que tocar nada,
// el video se recupera solo.
//
// URL que se le entrega al proveedor: /embed/<eventId>?token=<PROVIDER_EMBED_TOKEN_...>

'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

export default function EmbedPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeUidRef = useRef<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Falta el token de acceso.')
      return
    }
    let active = true

    async function fetchSignedUrl() {
      try {
        const res = await fetch(`/api/embed/${eventId}/stream-url?token=${encodeURIComponent(token!)}`, {
          cache: 'no-store',
        })
        const data = await res.json()
        if (!active) return
        if (!res.ok) {
          setError(data.error ?? 'No se pudo cargar la transmision.')
          return
        }
        setError(null)
        if (data.uid !== activeUidRef.current) {
          activeUidRef.current = data.uid
          setIframeUrl(data.iframeUrl)
        }
      } catch {
        if (active) setError('No se pudo cargar la transmision.')
      }
    }

    fetchSignedUrl()
    const interval = setInterval(fetchSignedUrl, 60_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [eventId, token])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      {iframeUrl ? (
        <iframe
          src={iframeUrl}
          style={{ width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
          }}
        >
          {error ?? 'Cargando transmision...'}
        </div>
      )}
    </div>
  )
}
