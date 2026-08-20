// app/api/admin/stream/upload-url/route.ts — POST: pide una URL de subida directa a Cloudflare Stream
// El admin sube el archivo de video desde el navegador directo a esa URL (no pasa por Vercel).

import { NextResponse } from 'next/server'
import { verifyAdminUser } from '@/lib/supabase/server'
import { createDirectUploadUrl } from '@/lib/cloudflare-stream'


export async function POST() {
  try {
    const user = await verifyAdminUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const { uploadURL, uid } = await createDirectUploadUrl()
    return NextResponse.json({ uploadURL, uid })
  } catch (err) {
    console.error('Error creando URL de subida Cloudflare Stream:', err)
    const message = err instanceof Error ? err.message : 'Error interno.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
