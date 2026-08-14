'use client'
// components/EventCarousel.tsx — Carrusel de imágenes para landing de evento (agenda, patrocinadores, etc.)
// Sin dependencias externas: estado de índice activo + transición CSS + swipe táctil.

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'

interface EventCarouselProps {
  images: string[]
  primaryColor: string
  eventTitle: string
}

export default function EventCarousel({ images, primaryColor, eventTitle }: EventCarouselProps) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const touchDeltaX = useRef(0)

  const total = images.length

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % total) + total) % total)
    },
    [total]
  )

  const prev = useCallback(() => goTo(index - 1), [goTo, index])
  const next = useCallback(() => goTo(index + 1), [goTo, index])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchDeltaX.current = 0
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current
  }

  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > 50) {
      if (touchDeltaX.current < 0) next()
      else prev()
    }
    touchStartX.current = null
    touchDeltaX.current = 0
  }

  if (total === 0) return null

  return (
    <section className="w-full py-16 lg:py-24 px-6">
      <div className="max-w-md mx-auto flex flex-col items-center">
        <h2 className="text-white text-xl lg:text-2xl font-bold text-center mb-2">
          Conoce el simposio
        </h2>
        <div
          className="w-10 h-[2px] mb-10"
          style={{ backgroundColor: primaryColor }}
          aria-hidden
        />

        {/* Marco del carrusel — ratio 4:5 (1080x1350) */}
        <div
          className="relative w-full max-w-[340px] aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl select-none"
          style={{ border: `1px solid ${primaryColor}30` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {images.map((src, i) => (
            <div
              key={src}
              className="absolute inset-0 transition-opacity duration-500 ease-in-out"
              style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? 'auto' : 'none' }}
              aria-hidden={i !== index}
            >
              <Image
                src={src}
                alt={`${eventTitle} — diapositiva ${i + 1} de ${total}`}
                fill
                sizes="(max-width: 640px) 90vw, 340px"
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}

          {/* Flecha anterior */}
          <button
            type="button"
            onClick={prev}
            aria-label="Diapositiva anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Flecha siguiente */}
          <button
            type="button"
            onClick={next}
            aria-label="Siguiente diapositiva"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Dots indicadores */}
        <div className="flex items-center gap-2 mt-6">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ir a diapositiva ${i + 1}`}
              aria-current={i === index}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === index ? '20px' : '6px',
                backgroundColor: i === index ? primaryColor : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
