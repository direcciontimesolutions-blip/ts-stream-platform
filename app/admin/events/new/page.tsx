// app/admin/events/new/page.tsx — Crear nuevo evento

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import EventForm from '@/components/admin/EventForm'
import type { Organization } from '@/types'

export const metadata: Metadata = {
  title: 'Nuevo evento',
}

export default async function NewEventPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin')
  }

  const serviceSupabase = createServiceRoleClient()
  const { data: organizations } = await serviceSupabase
    .from('organizations')
    .select('id, name, slug, primary_color, secondary_color')
    .order('name')

  const orgs = (organizations ?? []) as Organization[]

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <header className="bg-gray-900 border-b border-white/10 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link
            href="/admin/dashboard"
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Volver al dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-white">Nuevo evento</h1>
            <p className="text-gray-500 text-xs">Completa los datos para crear el evento</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {orgs.length === 0 ? (
          <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-6 text-center space-y-3">
            <p className="text-yellow-300 font-medium">No hay organizaciones disponibles</p>
            <p className="text-yellow-300/60 text-sm">
              Primero crea una organizacion via la API antes de crear un evento.
            </p>
            <code className="block text-xs text-yellow-400/70 font-mono mt-2">
              POST /api/admin/organizations
            </code>
          </div>
        ) : (
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 sm:p-8">
            <EventForm organizations={orgs} />
          </div>
        )}
      </main>
    </div>
  )
}
