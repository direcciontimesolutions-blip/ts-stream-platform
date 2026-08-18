// lib/certificate-pdf.tsx — Documento PDF: Certificado de Asistencia personalizado
//
// Mismo enfoque que lib/acta-pdf.tsx (@react-pdf/renderer, ya en package.json — no se
// agrega ninguna dependencia nueva). A diferencia del acta, este documento superpone
// SOLO 5 campos dinamicos (nombre, cedula, evento, fecha, tiempo conectado) sobre una
// imagen de fondo completa (public/certificates/placeholder-fondo.png) que trae todo el
// texto estatico (titulo, labels, firmas, footer) horneado en la imagen.
//
// Cuando llegue el diseño oficial de la SCP: reemplazar SOLO el archivo
// public/certificates/placeholder-fondo.png (ver scripts/generate-certificate-placeholder-bg.mjs
// para como se genero el provisional) por el diseño real, exportado a la misma proporcion
// A4 horizontal (o ajustar BG_ASPECT_RATIO abajo si la proporcion cambia). Las posiciones
// de los 5 campos dinamicos son PROPORCIONALES al tamaño de pagina (fracciones 0-1 de
// PAGE_W/PAGE_H), asi que si el diseño real ubica esos mismos bloques en otra zona del
// certificado, solo hay que ajustar las constantes FIELD_POS de abajo — nunca la logica
// de generacion en send-certificates/route.ts.

import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

export interface CertificateData {
  full_name: string
  document_id: string
  event_title: string
  event_date_label: string   // ej. "19 de agosto de 2026"
  connected_time_label: string // ej. "6h 12min"
}

// A4 horizontal en puntos — coincide con la proporcion (2000x1414px) del fondo generado
// por scripts/generate-certificate-placeholder-bg.mjs (sqrt(2), proporcion A4 estandar).
const PAGE_W = 841.89
const PAGE_H = 595.28

// Posiciones de los campos dinamicos, como fraccion del ancho/alto de pagina — calculadas
// a partir de las coordenadas px del fondo (ver constantes W/H y los <text> "label" en
// scripts/generate-certificate-placeholder-bg.mjs). Mover estas fracciones si el fondo real
// de la SCP ubica los mismos bloques (nombre/cedula/evento/fecha/tiempo) en otra zona.
const FIELD = {
  nombre: { top: 0.365, left: 0.14, width: 0.72, fontSize: 30 },
  cedula: { top: 0.512, left: 0.14, width: 0.72, fontSize: 22 },
  evento: { top: 0.615, left: 0.16, width: 0.68, fontSize: 22 },
  fecha: { top: 0.792, left: 0.10, width: 0.36, fontSize: 19 },
  tiempo: { top: 0.792, left: 0.54, width: 0.36, fontSize: 19 },
}

const SCP_BLUE = '#075A94'
const INK = '#12283A'

const s = StyleSheet.create({
  page: { position: 'relative' },
  background: { position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H - 1 },
  field: { position: 'absolute', textAlign: 'center', fontFamily: 'Helvetica-Bold' },
})

function fieldStyle(f: typeof FIELD.nombre, color: string) {
  return {
    ...s.field,
    top: f.top * PAGE_H,
    left: f.left * PAGE_W,
    width: f.width * PAGE_W,
    fontSize: f.fontSize,
    color,
  }
}

export function CertificateDocument({ data, backgroundSrc }: { data: CertificateData; backgroundSrc: Buffer }) {
  return (
    <Document
      title={`Certificado de asistencia — ${data.full_name}`}
      author="Time Solutions Colombia"
      subject={data.event_title}
      creator="ts-stream-platform"
    >
      <Page size={[PAGE_W, PAGE_H]} style={s.page}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Image style={s.background} src={{ data: backgroundSrc, format: 'png' } as any} />

        <Text style={fieldStyle(FIELD.nombre, INK)}>{data.full_name}</Text>
        <Text style={fieldStyle(FIELD.cedula, SCP_BLUE)}>{data.document_id}</Text>
        <Text style={fieldStyle(FIELD.evento, SCP_BLUE)}>{data.event_title}</Text>
        <Text style={fieldStyle(FIELD.fecha, INK)}>{data.event_date_label}</Text>
        <Text style={fieldStyle(FIELD.tiempo, INK)}>{data.connected_time_label}</Text>
      </Page>
    </Document>
  )
}

export async function renderCertificatePdf(data: CertificateData, backgroundSrc: Buffer): Promise<Buffer> {
  const { renderToStream } = await import('@react-pdf/renderer')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(CertificateDocument, { data, backgroundSrc }) as React.ReactElement<any>
  const stream = await renderToStream(element)

  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })

  return Buffer.concat(chunks)
}
