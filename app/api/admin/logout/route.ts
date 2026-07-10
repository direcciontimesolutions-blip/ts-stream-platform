// app/api/admin/logout/route.ts — Logout del admin (Supabase Auth)

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()

  const response = NextResponse.redirect(
    new URL('/admin', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  )
  return response
}
