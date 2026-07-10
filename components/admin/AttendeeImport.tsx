'use client'
// components/admin/AttendeeImport.tsx — Upload y parse CSV de asistentes

import { useState, useRef } from 'react'
import type { ImportResult } from '@/types'

interface AttendeeImportProps {
  eventId: string
  onSuccess: (result: ImportResult) => void
  onClose: () => void
}

export default function AttendeeImport({ eventId, onSuccess, onClose }: AttendeeImportProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const csvTextRef = useRef<string | null>(null)

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setError('Solo se aceptan archivos .csv')
      return
    }
    setFileName(file.name)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      csvTextRef.current = e.target?.result as string
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    if (!csvTextRef.current) {
      setError('Selecciona un archivo CSV primero.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/events/${eventId}/attendees/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvTextRef.current }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al importar asistentes.')
        setLoading(false)
        return
      }

      onSuccess(data as ImportResult)
    } catch {
      setError('Error de conexion. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="bg-gray-900 border border-white/15 rounded-2xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 id="import-title" className="text-lg font-semibold text-white">
            Importar asistentes desde CSV
          </h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Formato esperado */}
        <div className="bg-white/5 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Formato CSV esperado</p>
          <code className="text-xs text-green-300 font-mono block">
            full_name,email,username,password
          </code>
          <p className="text-xs text-white/40">
            email y password son opcionales. Si no hay password, se genera automaticamente.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-white/20 hover:border-white/40 hover:bg-white/5'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={handleInputChange}
            aria-label="Seleccionar archivo CSV"
          />
          <div className="space-y-2">
            <svg className="w-8 h-8 mx-auto text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {fileName ? (
              <p className="text-sm text-green-300 font-medium">{fileName}</p>
            ) : (
              <>
                <p className="text-sm text-white/60">Arrastra el CSV aqui o haz clic para seleccionar</p>
                <p className="text-xs text-white/30">Solo archivos .csv</p>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-lg" role="alert">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !fileName}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Importando...' : 'Importar asistentes'}
          </button>
        </div>
      </div>
    </div>
  )
}
