// lib/email.ts — Envio de correo via Resend (dominio propio verificado)
//
// Canal de correo de emergencia (Plan B) cuando WhatsApp automatico no es
// viable (requiere aprobacion de plantilla de Meta que puede no llegar a
// tiempo para un evento puntual). Tambien usado para el envio de
// certificados de asistencia (scripts/certificates/send-certificates.ts).
//
// Migrado el 20 ago 2026 desde Gmail SMTP (nodemailer): timesolutions.com.co
// no tenia SPF/DKIM configurado para autorizar a Gmail a enviar en su
// nombre, asi que Yahoo (y potencialmente otros proveedores estrictos)
// rechazaba el correo (550 5.7.9 DKIM/SPF FAILURE, confirmado con casos
// reales). Resend firma DKIM real sobre timesolutions.com.co (dominio
// verificado, ver panel de Resend) — soluciona el problema de raiz en vez
// de con un parche de remitente.

import { Resend } from 'resend'

const FROM_ADDRESS = 'Time Solutions <info@timesolutions.com.co>'

let cachedClient: Resend | null = null

function getClient() {
  if (cachedClient) return cachedClient

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY no configurada.')
  }

  cachedClient = new Resend(apiKey)
  return cachedClient
}

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}): Promise<void> {
  const client = getClient()
  const { data, error } = await client.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  })

  if (error) {
    throw new Error(`Resend rechazo el envio a ${opts.to}: ${error.message}`)
  }
  if (!data?.id) {
    throw new Error(`Resend no devolvio confirmacion de envio a ${opts.to}.`)
  }
}
