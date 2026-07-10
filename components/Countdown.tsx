'use client'
// components/Countdown.tsx — Contador regresivo para votaciones

import { useState, useEffect, useCallback } from 'react'

interface CountdownProps {
  closesAt: string | null
  onExpire?: () => void
}

export default function Countdown({ closesAt, onExpire }: CountdownProps) {
  const calcRemaining = useCallback(() => {
    if (!closesAt) return null
    return Math.max(0, Math.round((new Date(closesAt).getTime() - Date.now()) / 1000))
  }, [closesAt])

  const [remaining, setRemaining] = useState<number | null>(calcRemaining)

  useEffect(() => {
    if (!closesAt) { setRemaining(null); return }

    const r = calcRemaining()
    setRemaining(r)
    if (r !== null && r <= 0) { onExpire?.(); return }

    const interval = setInterval(() => {
      const next = calcRemaining()
      setRemaining(next)
      if (next !== null && next <= 0) {
        clearInterval(interval)
        onExpire?.()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [closesAt, calcRemaining, onExpire])

  if (remaining === null) return null

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const urgent = remaining <= 30 && remaining > 0
  const expired = remaining === 0

  if (expired) {
    return (
      <span className="font-mono text-xs font-bold text-gray-500 tabular-nums">
        00:00
      </span>
    )
  }

  return (
    <span
      className={`font-mono font-bold tabular-nums inline-flex items-center gap-1 ${
        urgent ? 'text-red-400' : 'text-yellow-400'
      }`}
    >
      {urgent && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping inline-block" />
      )}
      {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
    </span>
  )
}
