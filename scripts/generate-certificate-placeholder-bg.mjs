// scripts/generate-certificate-placeholder-bg.mjs — Genera public/certificates/placeholder-fondo.png
//
// Script de un solo uso (mismo patron que scripts/create-stream-signing-key.mjs): construye el
// fondo PROVISIONAL del certificado de asistencia como una imagen SVG -> PNG via sharp (ya es
// dependencia de Next.js, no se agrega nada nuevo). El fondo lleva SOLO texto ESTATICO (labels,
// firmas, footer) + marca de agua "PLANTILLA PROVISIONAL" — los 5 campos dinamicos por persona
// (nombre, cedula, evento, fecha, tiempo conectado) los superpone lib/certificate-pdf.tsx en
// tiempo de generacion, nunca viven en esta imagen.
//
// Cuando llegue el diseño oficial de la SCP: reemplazar este archivo PNG directamente
// (public/certificates/placeholder-fondo.png) por el diseño real exportado a la MISMA resolucion
// (2000x1414px, proporcion A4 horizontal) — o ajustar CERT_BG_WIDTH/HEIGHT en lib/certificate-pdf.tsx
// si el nuevo diseño tiene proporcion distinta. La logica de insercion de datos no cambia.
//
// Correr con: node scripts/generate-certificate-placeholder-bg.mjs

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const SCP_BLUE = '#075A94'
const TS_CYAN = '#00E5CC'
const INK = '#12283A'
const MUTED = '#5B7186'
const WARN = '#C6420C'

const W = 2000
const H = 1414

function b64(relPath) {
  return readFileSync(path.join(ROOT, relPath)).toString('base64')
}

const scpLogo = b64('public/logos/scp-antioquia.png')
const tsLogo = b64('public/ts-logo.png')

// Ratios reales (ver metadata via sharp): SCP 2836x2268 (~1.25), TS 1760x2120 (~0.83)
const scpLogoH = 190
const scpLogoW = Math.round(scpLogoH * (2836 / 2268))
const tsLogoH = 190
const tsLogoW = Math.round(tsLogoH * (1760 / 2120))
const tsChipPad = 28
const tsChipW = tsLogoW + tsChipPad * 2
const tsChipH = tsLogoH + tsChipPad * 2

function watermarkGroup() {
  // Marca de agua diagonal repetida, imposible de confundir con el diseño oficial.
  const text = 'PLANTILLA PROVISIONAL — NO ES EL DISEÑO OFICIAL SCP'
  const rows = []
  for (let i = 0; i < 4; i++) {
    rows.push(`
      <text x="${W / 2}" y="${240 + i * 340}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="46" font-weight="700"
        fill="${WARN}" fill-opacity="0.16" letter-spacing="4"
        transform="rotate(-24 ${W / 2} ${240 + i * 340})">${text}</text>
    `)
  }
  return rows.join('\n')
}

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <!-- Fondo base -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="#F7FAFC" />

  <!-- Marco decorativo -->
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none" stroke="${SCP_BLUE}" stroke-width="5" />
  <rect x="62" y="62" width="${W - 124}" height="${H - 124}" fill="none" stroke="${TS_CYAN}" stroke-width="2" />

  <!-- Cinta "NO OFICIAL" esquina superior izquierda -->
  <g transform="translate(46 46)">
    <polygon points="0,0 260,0 0,260" fill="${WARN}" fill-opacity="0.92" />
    <text x="58" y="92" font-family="Arial, sans-serif" font-size="27" font-weight="700"
      fill="#ffffff" transform="rotate(-45 58 92)">NO OFICIAL</text>
  </g>

  <!-- Marca de agua -->
  ${watermarkGroup()}

  <!-- Logos -->
  <g transform="translate(150 100)">
    <image href="data:image/png;base64,${scpLogo}" width="${scpLogoW}" height="${scpLogoH}" />
  </g>
  <!-- El isotipo TS lleva alpha blanco pensado para fondo oscuro (ver memoria feedback-logo-fondo-oscuro) —
       sobre el fondo claro del certificado necesita su propio chip navy para que ambos tonos se lean. -->
  <g transform="translate(${W - 150 - tsChipW} ${100 - tsChipPad})">
    <rect x="0" y="0" width="${tsChipW}" height="${tsChipH}" rx="18" fill="${INK}" />
    <image href="data:image/png;base64,${tsLogo}" width="${tsLogoW}" height="${tsLogoH}" x="${tsChipPad}" y="${tsChipPad}" />
  </g>

  <!-- Barra acento cian -->
  <rect x="${W / 2 - 130}" y="336" width="260" height="6" fill="${TS_CYAN}" />

  <!-- Titulo -->
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
    font-size="72" font-weight="700" fill="${SCP_BLUE}" letter-spacing="2">CERTIFICADO DE ASISTENCIA</text>
  <text x="${W / 2}" y="372" text-anchor="middle" font-family="Arial, sans-serif" font-size="27"
    fill="${MUTED}" letter-spacing="1">Sociedad Colombiana de Pediatría &#8212; Regional Antioquia</text>

  <!-- Bloque: CERTIFICA QUE + nombre (valor dinamico se dibuja encima en react-pdf) -->
  <text x="${W / 2}" y="500" text-anchor="middle" font-family="Arial, sans-serif" font-size="24"
    font-weight="700" fill="${MUTED}" letter-spacing="4">CERTIFICA QUE</text>
  <line x1="${W / 2 - 560}" y1="640" x2="${W / 2 + 560}" y2="640" stroke="${SCP_BLUE}" stroke-width="1.5" stroke-opacity="0.35" />

  <!-- Bloque: cedula -->
  <text x="${W / 2}" y="700" text-anchor="middle" font-family="Arial, sans-serif" font-size="22"
    font-weight="700" fill="${MUTED}" letter-spacing="3">IDENTIFICADO(A) CON CÉDULA DE CIUDADANÍA N&#176;</text>

  <!-- Bloque: evento (2 lineas de margen para nombres largos de evento) -->
  <text x="${W / 2}" y="840" text-anchor="middle" font-family="Arial, sans-serif" font-size="22"
    font-weight="700" fill="${MUTED}" letter-spacing="3">ASISTIÓ Y PARTICIPÓ EN EL EVENTO</text>

  <!-- Bloque: fecha (izq) + tiempo conectado (der) -->
  <text x="${W / 2 - 340}" y="1080" text-anchor="middle" font-family="Arial, sans-serif" font-size="20"
    font-weight="700" fill="${MUTED}" letter-spacing="2">FECHA</text>
  <text x="${W / 2 + 340}" y="1080" text-anchor="middle" font-family="Arial, sans-serif" font-size="20"
    font-weight="700" fill="${MUTED}" letter-spacing="2">TIEMPO DE CONEXIÓN VERIFICADO</text>

  <!-- Firmas -->
  <line x1="${W / 2 - 560}" y1="1230" x2="${W / 2 - 180}" y2="1230" stroke="${INK}" stroke-width="1.5" />
  <text x="${W / 2 - 370}" y="1262" text-anchor="middle" font-family="Arial, sans-serif" font-size="21"
    font-weight="700" fill="${INK}">Sociedad Colombiana de Pediatría</text>
  <text x="${W / 2 - 370}" y="1288" text-anchor="middle" font-family="Arial, sans-serif" font-size="18"
    fill="${MUTED}">Regional Antioquia</text>

  <line x1="${W / 2 + 180}" y1="1230" x2="${W / 2 + 560}" y2="1230" stroke="${INK}" stroke-width="1.5" />
  <text x="${W / 2 + 370}" y="1262" text-anchor="middle" font-family="Arial, sans-serif" font-size="21"
    font-weight="700" fill="${INK}">Time Solutions Colombia</text>
  <text x="${W / 2 + 370}" y="1288" text-anchor="middle" font-family="Arial, sans-serif" font-size="18"
    fill="${MUTED}">Plataforma digital del evento</text>

  <!-- Footer -->
  <text x="${W / 2}" y="1352" text-anchor="middle" font-family="Arial, sans-serif" font-size="15"
    fill="${MUTED}">PLANTILLA PROVISIONAL — pendiente diseño oficial de la Sociedad Colombiana de Pediatría · No usar como certificado final</text>
</svg>
`

const outPath = path.join(ROOT, 'public/certificates/placeholder-fondo.png')

await sharp(Buffer.from(svg)).png({ quality: 100 }).toFile(outPath)

console.log('Fondo generado:', outPath)
