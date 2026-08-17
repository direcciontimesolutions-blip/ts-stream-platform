// lib/email.ts — Envio de correo via SMTP de Gmail (nodemailer)
//
// Canal de correo de emergencia (Plan B) cuando WhatsApp automatico no es
// viable (requiere aprobacion de plantilla de Meta que puede no llegar a
// tiempo para un evento puntual). Autentica con la cuenta SMTP_EMAIL/
// SMTP_APP_PASSWORD (contraseña de aplicacion de Gmail) pero envia "From"
// el alias info@timesolutions.com.co — Gmail lo permite porque el alias
// ya esta verificado como "enviar como" del lado de esa cuenta.

import nodemailer from 'nodemailer'

const FROM_ADDRESS = '"Time Solutions" <info@timesolutions.com.co>'

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (cachedTransporter) return cachedTransporter

  const user = process.env.SMTP_EMAIL
  const pass = process.env.SMTP_APP_PASSWORD

  if (!user || !pass) {
    throw new Error('SMTP_EMAIL / SMTP_APP_PASSWORD no configurados.')
  }

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS sobre el puerto 587
    auth: { user, pass },
  })

  return cachedTransporter
}

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  const transporter = getTransporter()
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  })
}
