// lib/acta-pdf.tsx — Documento PDF: Acta de Asamblea (Ley 675 de 2001)

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AttendeeRecord {
  full_name: string
  unit_number: string | null
  coefficient: number | null
  is_presencial: boolean
  is_proxy: boolean   // representado por poder
  proxy_name?: string // nombre del apoderado
}

export interface PoderRecord {
  granting_unit: string
  owner_name: string
  coefficient: number
  representative_name: string
}

export interface VoteResult {
  vote_value: string
  label: string
  coefficient: number
  pct: number
}

export interface MotionRecord {
  order_index: number
  title: string
  description: string | null
  motion_type: 'informativo' | 'voto_simple' | 'voto_plancha' | 'voto_adhoc'
  status: 'pending' | 'open' | 'closed'
  majority_type: 'simple' | 'calificada'
  majority_pct: number
  opened_at: string | null
  closed_at: string | null
  secretary_notes: string | null
  vote_results: VoteResult[]
  total_voted_coefficient: number
  total_voted_pct: number
  approved: boolean | null  // null si informativo
  plancha_options: Array<{ id: string; name: string }>
}

export interface ActaData {
  acta_number: string
  assembly_type: 'ordinaria' | 'extraordinaria'
  assembly_title: string
  org_name: string
  location: string
  scheduled_at: string
  started_at: string | null
  ended_at: string | null
  current_convocatoria: 'primera' | 'segunda'
  quorum_threshold_primera: number
  quorum_threshold_segunda: number
  total_coefficient: number
  present_coefficient: number
  quorum_reached: boolean
  president_name: string | null
  secretary_name: string | null
  attendees: AttendeeRecord[]
  poderes: PoderRecord[]
  motions: MotionRecord[]
  generated_at: string
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', paddingTop: 50, paddingBottom: 60, paddingHorizontal: 55, lineHeight: 1.45 },
  // Encabezado
  headerBlock: { borderBottomWidth: 1.5, borderBottomColor: '#1a1a1a', paddingBottom: 8, marginBottom: 12 },
  title: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'center', textTransform: 'uppercase', marginBottom: 3 },
  subtitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', textTransform: 'uppercase', marginBottom: 2 },
  centerText: { textAlign: 'center', fontSize: 9 },
  // Secciones
  section: { marginTop: 14, marginBottom: 4 },
  sectionTitle: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 5, borderBottomWidth: 0.5, borderBottomColor: '#555', paddingBottom: 3 },
  // Párrafos
  p: { marginBottom: 5, textAlign: 'justify' },
  pBold: { marginBottom: 5, fontFamily: 'Helvetica-Bold' },
  indent: { marginLeft: 15, marginBottom: 3 },
  // Tablas
  table: { width: '100%', marginTop: 5, marginBottom: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1a1a1a' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#ccc' },
  tableRowAlt: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderBottomWidth: 0.3, borderBottomColor: '#ccc' },
  thCell: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.5, padding: 4, textTransform: 'uppercase' },
  tdCell: { fontSize: 8, padding: 4 },
  // Votación
  voteBox: { marginTop: 6, marginBottom: 8, borderWidth: 0.5, borderColor: '#888', borderRadius: 3, padding: 8 },
  voteTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, marginBottom: 4 },
  voteRow: { flexDirection: 'row', marginBottom: 2 },
  voteBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, marginTop: 5, textAlign: 'center' },
  // Firmas
  signaturesSection: { marginTop: 50, flexDirection: 'row', justifyContent: 'space-around' },
  signatureBlock: { width: '40%', alignItems: 'center' },
  signatureLine: { borderTopWidth: 1, borderTopColor: '#1a1a1a', width: '100%', marginBottom: 4 },
  signatureName: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  signatureRole: { fontSize: 8, textAlign: 'center', color: '#444' },
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 55, right: 55, borderTopWidth: 0.5, borderTopColor: '#ccc', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#666' },
  pageNumber: { fontSize: 7, color: '#666' },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return iso }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return '' }
}

function fmtCoef(n: number): string { return n.toFixed(6) }
function fmtPct(n: number): string { return n.toFixed(2) + '%' }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']

function toRoman(n: number): string { return ROMAN[n - 1] ?? String(n) }

const VOTE_LABELS: Record<string, string> = { si: 'A FAVOR', no: 'EN CONTRA', abstencion: 'ABSTENCIÓN' }

// ── Componente principal ───────────────────────────────────────────────────────

export function ActaDocument({ data }: { data: ActaData }) {
  const typeLabel = data.assembly_type === 'extraordinaria' ? 'EXTRAORDINARIA' : 'ORDINARIA'
  const convLabel = data.current_convocatoria === 'primera' ? 'PRIMERA' : 'SEGUNDA'
  const threshold = data.current_convocatoria === 'primera'
    ? data.quorum_threshold_primera * 100
    : data.quorum_threshold_segunda * 100
  const presentPct = data.total_coefficient > 0
    ? (data.present_coefficient / data.total_coefficient) * 100 : 0

  const votedMotions = data.motions.filter(m => m.motion_type !== 'informativo' && m.status === 'closed')
  const infoMotions = data.motions.filter(m => m.motion_type === 'informativo')

  return (
    <Document
      title={`Acta ${data.acta_number} — ${data.assembly_title}`}
      author="Time Solutions Colombia"
      subject={`Asamblea ${typeLabel} de Propietarios`}
      creator="ts-stream-platform"
    >
      <Page size="LETTER" style={s.page}>

        {/* ── ENCABEZADO ── */}
        <View style={s.headerBlock}>
          <Text style={s.title}>ACTA N° {data.acta_number}</Text>
          <Text style={s.subtitle}>ASAMBLEA GENERAL {typeLabel} DE PROPIETARIOS</Text>
          <Text style={s.subtitle}>{data.org_name.toUpperCase()}</Text>
        </View>

        {/* ── I. INSTALACIÓN Y VERIFICACIÓN DEL QUÓRUM ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>I. Instalación y verificación del quórum</Text>

          <Text style={s.p}>
            En {data.location}, siendo las {data.started_at ? fmtTime(data.started_at) : '___:___'} horas del día {fmtDate(data.scheduled_at)}, se reunieron los propietarios de la {data.org_name} para celebrar Asamblea General {typeLabel} de Propietarios, en {convLabel} Convocatoria, conforme a lo establecido en la Ley 675 de 2001, el Decreto 1077 de 2015 y el Reglamento de Propiedad Horizontal del conjunto.
          </Text>

          <Text style={s.p}>
            De conformidad con el artículo 45 de la Ley 675 de 2001, el Administrador procedió a verificar la asistencia de propietarios y/o sus representantes debidamente acreditados mediante poderes escritos, conforme al siguiente detalle:
          </Text>

          {/* Tabla de asistentes */}
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.thCell, { width: '12%' }]}>Unidad</Text>
              <Text style={[s.thCell, { width: '35%' }]}>Propietario</Text>
              <Text style={[s.thCell, { width: '15%' }]}>Coeficiente</Text>
              <Text style={[s.thCell, { width: '22%' }]}>Representación</Text>
              <Text style={[s.thCell, { width: '16%' }]}>Modalidad</Text>
            </View>
            {data.attendees.map((a, i) => (
              <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.tdCell, { width: '12%' }]}>{a.unit_number ?? '—'}</Text>
                <Text style={[s.tdCell, { width: '35%' }]}>{a.full_name}</Text>
                <Text style={[s.tdCell, { width: '15%' }]}>{a.coefficient != null ? fmtCoef(a.coefficient) : '—'}</Text>
                <Text style={[s.tdCell, { width: '22%' }]}>{a.is_proxy ? `Por poder: ${a.proxy_name ?? ''}` : 'Directo'}</Text>
                <Text style={[s.tdCell, { width: '16%' }]}>{a.is_presencial ? 'Presencial' : 'Virtual'}</Text>
              </View>
            ))}
          </View>

          {/* Poderes */}
          {data.poderes.length > 0 && (
            <>
              <Text style={[s.pBold, { marginTop: 4 }]}>Poderes y representaciones registradas:</Text>
              <View style={s.table}>
                <View style={s.tableHeader}>
                  <Text style={[s.thCell, { width: '12%' }]}>Unidad</Text>
                  <Text style={[s.thCell, { width: '30%' }]}>Propietario otorgante</Text>
                  <Text style={[s.thCell, { width: '14%' }]}>Coeficiente</Text>
                  <Text style={[s.thCell, { width: '44%' }]}>Representante</Text>
                </View>
                {data.poderes.map((p, i) => (
                  <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                    <Text style={[s.tdCell, { width: '12%' }]}>{p.granting_unit}</Text>
                    <Text style={[s.tdCell, { width: '30%' }]}>{p.owner_name}</Text>
                    <Text style={[s.tdCell, { width: '14%' }]}>{fmtCoef(p.coefficient)}</Text>
                    <Text style={[s.tdCell, { width: '44%' }]}>{p.representative_name}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Resumen quórum */}
          <View style={{ backgroundColor: '#f8f8f8', borderWidth: 0.5, borderColor: '#ccc', borderRadius: 3, padding: 8, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 8 }}>Coeficiente total del conjunto:</Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmtCoef(data.total_coefficient)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 8 }}>Coeficiente representado en la asamblea:</Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmtCoef(data.present_coefficient)} ({fmtPct(presentPct)})</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 8 }}>Umbral de quórum requerido ({convLabel} convocatoria):</Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>{fmtPct(threshold)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 8 }}>Estado del quórum:</Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: data.quorum_reached ? '#166534' : '#991b1b' }}>
                {data.quorum_reached ? '✓ QUÓRUM ALCANZADO' : '✗ QUÓRUM NO ALCANZADO'}
              </Text>
            </View>
          </View>

          <Text style={[s.p, { marginTop: 7 }]}>
            {data.quorum_reached
              ? `Verificado el quórum deliberatorio, el Administrador declaró formalmente instalada la Asamblea General ${typeLabel} de Propietarios en ${convLabel} Convocatoria, en los términos del artículo 45 de la Ley 675 de 2001.`
              : `No habiéndose alcanzado el quórum requerido para la ${convLabel} Convocatoria (${fmtPct(threshold)}), la asamblea se declara instalada en las condiciones previstas en el artículo 45 de la Ley 675 de 2001.`}
          </Text>
        </View>

        {/* ── II. ELECCIÓN PRESIDENTE Y SECRETARIO ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>II. Elección del presidente y secretario de la asamblea</Text>
          <Text style={s.p}>
            De conformidad con el artículo 42 de la Ley 675 de 2001, los propietarios presentes designaron mediante votación a los dignatarios de la presente sesión:
          </Text>
          <View style={[s.indent, { marginBottom: 3 }]}>
            <Text style={s.p}>• <Text style={{ fontFamily: 'Helvetica-Bold' }}>PRESIDENTE DE LA ASAMBLEA: </Text>{data.president_name ?? '________________________'}</Text>
            <Text style={s.p}>• <Text style={{ fontFamily: 'Helvetica-Bold' }}>SECRETARIO(A) DE LA ASAMBLEA: </Text>{data.secretary_name ?? '________________________'}</Text>
          </View>
          <Text style={s.p}>Quienes aceptaron el encargo y procedieron a dirigir la sesión.</Text>
        </View>

        {/* ── III. ORDEN DEL DÍA ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>III. Aprobación del orden del día</Text>
          <Text style={s.p}>El Presidente sometió a consideración de los asistentes el siguiente Orden del Día, el cual fue aprobado por los presentes:</Text>
          {data.motions.map((m, i) => (
            <Text key={m.order_index} style={s.indent}>
              {i + 1}. {m.title}
              {m.motion_type === 'informativo' ? ' (Informativo)' : ''}
            </Text>
          ))}
        </View>

        {/* ── IV. DESARROLLO DEL ORDEN DEL DÍA ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>IV. Desarrollo del orden del día</Text>

          {data.motions.map((motion, idx) => (
            <View key={motion.order_index} style={{ marginBottom: 12 }}>
              <Text style={[s.pBold, { fontSize: 9.5 }]}>
                PUNTO {toRoman(idx + 1)}. {motion.title.toUpperCase()}
              </Text>

              {motion.description && (
                <Text style={s.p}>{motion.description}</Text>
              )}

              {motion.motion_type === 'informativo' && (
                <Text style={s.p}>
                  Se presentó al pleno de la asamblea información sobre el presente punto. Los propietarios tomaron nota de la información suministrada por la administración.
                  {motion.secretary_notes ? ` ${motion.secretary_notes}` : ''}
                </Text>
              )}

              {motion.motion_type !== 'informativo' && motion.status !== 'closed' && (
                <Text style={[s.p, { color: '#666' }]}>
                  [Este punto no fue sometido a votación durante la sesión.]
                </Text>
              )}

              {motion.motion_type !== 'informativo' && motion.status === 'closed' && (
                <>
                  <Text style={s.p}>
                    {motion.secretary_notes
                      ? motion.secretary_notes + ' '
                      : `El Presidente sometió a votación la propuesta relativa a "${motion.title}". `}
                    La votación fue {motion.opened_at && motion.closed_at
                      ? `realizada entre las ${fmtTime(motion.opened_at)} y las ${fmtTime(motion.closed_at)} horas`
                      : 'realizada durante la sesión'}, obteniéndose los siguientes resultados:
                  </Text>

                  <View style={s.voteBox}>
                    <Text style={s.voteTitle}>RESULTADO DE LA VOTACIÓN</Text>
                    {/* Tabla de resultados */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#333', marginBottom: 1 }}>
                      <Text style={[s.thCell, { width: '45%' }]}>Votación</Text>
                      <Text style={[s.thCell, { width: '30%' }]}>Coeficiente</Text>
                      <Text style={[s.thCell, { width: '25%' }]}>Porcentaje</Text>
                    </View>
                    {motion.vote_results.map((vr, vi) => (
                      <View key={vi} style={[{ flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#ddd' }, vi % 2 === 1 ? { backgroundColor: '#f9f9f9' } : {}]}>
                        <Text style={[s.tdCell, { width: '45%', fontFamily: 'Helvetica-Bold' }]}>
                          {motion.motion_type === 'voto_plancha'
                            ? (motion.plancha_options.find(p => p.id === vr.vote_value)?.name ?? vr.label)
                            : (VOTE_LABELS[vr.vote_value] ?? vr.label)}
                        </Text>
                        <Text style={[s.tdCell, { width: '30%' }]}>{fmtCoef(vr.coefficient)}</Text>
                        <Text style={[s.tdCell, { width: '25%' }]}>{fmtPct(vr.pct)}</Text>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', backgroundColor: '#e8e8e8', borderTopWidth: 0.5, borderTopColor: '#999', marginTop: 1 }}>
                      <Text style={[s.tdCell, { width: '45%', fontFamily: 'Helvetica-Bold' }]}>TOTAL COEF. VOTANTE</Text>
                      <Text style={[s.tdCell, { width: '30%', fontFamily: 'Helvetica-Bold' }]}>{fmtCoef(motion.total_voted_coefficient)}</Text>
                      <Text style={[s.tdCell, { width: '25%', fontFamily: 'Helvetica-Bold' }]}>{fmtPct(motion.total_voted_pct)}</Text>
                    </View>

                    {/* Decisión */}
                    <Text style={[s.voteBadge, {
                      backgroundColor: motion.approved ? '#dcfce7' : '#fee2e2',
                      color: motion.approved ? '#166534' : '#991b1b',
                      marginTop: 6,
                    }]}>
                      {motion.approved === true
                        ? `✓ APROBADO — por mayoría ${motion.majority_type}${motion.majority_type === 'calificada' ? ` (${motion.majority_pct}%)` : ''}`
                        : motion.approved === false
                        ? `✗ NO APROBADO — no se alcanzó la mayoría ${motion.majority_type} requerida`
                        : '— RESULTADO NO DETERMINADO'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>

        {/* ── V. CIERRE ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>V. Cierre de la asamblea</Text>
          <Text style={s.p}>
            No habiendo más asuntos que tratar y agotado el Orden del Día, el Presidente declaró formalmente cerrada la sesión siendo las {data.ended_at ? fmtTime(data.ended_at) : '___:___'} horas del día {fmtDate(data.scheduled_at)}, comprometiendo a todos los propietarios al cumplimiento de las decisiones aquí adoptadas, en los términos del artículo 47 de la Ley 675 de 2001.
          </Text>
          <Text style={s.p}>
            La presente Acta fue elaborada durante el transcurso de la sesión y se entiende aprobada de conformidad con lo establecido en el Reglamento de Propiedad Horizontal y la Ley 675 de 2001.
          </Text>
          {votedMotions.length > 0 && (
            <Text style={s.p}>
              Las decisiones aquí consignadas tienen carácter obligatorio para todos los propietarios, tenedores y usuarios del inmueble, incluidos los ausentes y disidentes, conforme a lo dispuesto en el artículo 37 de la Ley 675 de 2001.
            </Text>
          )}
        </View>

        {/* ── FIRMAS ── */}
        <View style={s.signaturesSection}>
          <View style={s.signatureBlock}>
            <View style={s.signatureLine} />
            <Text style={s.signatureName}>{data.president_name ?? '________________________________'}</Text>
            <Text style={s.signatureRole}>Presidente de la Asamblea</Text>
          </View>
          <View style={s.signatureBlock}>
            <View style={s.signatureLine} />
            <Text style={s.signatureName}>{data.secretary_name ?? '________________________________'}</Text>
            <Text style={s.signatureRole}>Secretario(a) de la Asamblea</Text>
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Acta N° {data.acta_number} — {data.org_name} — Generada: {new Date(data.generated_at).toLocaleDateString('es-CO')} — Time Solutions Colombia
          </Text>
          <Text style={s.pageNumber} render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
