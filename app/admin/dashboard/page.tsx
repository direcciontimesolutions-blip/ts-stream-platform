// app/admin/dashboard/page.tsx — Panel principal: organizaciones, eventos y asambleas

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server'
import type { Organization, Event, Assembly } from '@/types'

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  live: { label: 'En vivo', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  ended: { label: 'Finalizado', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
}

const ASSEMBLY_STATUS_BADGE: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  active: { label: 'En curso', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  ended: { label: 'Finalizada', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
}

async function AdminNav() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="bg-gray-900 border-b border-white/10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="font-semibold text-white">TS Stream Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}

function LogoutButton() {
  return (
    <form action="/api/admin/logout" method="POST">
      <button
        type="submit"
        className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/10"
      >
        Salir
      </button>
    </form>
  )
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin')
  }

  const serviceSupabase = createServiceRoleClient()

  // Obtener organizaciones con conteo de eventos
  const { data: organizations } = await serviceSupabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  // Obtener todos los eventos
  const { data: events } = await serviceSupabase
    .from('events')
    .select(`
      id, title, slug, status, start_at, end_at, streaming_tier, created_at,
      organizations (id, name, slug, primary_color)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  // Obtener asambleas
  const { data: assemblies } = await serviceSupabase
    .from('assemblies')
    .select('id, title, slug, status, scheduled_at, current_convocatoria, organizations(id, name)')
    .order('scheduled_at', { ascending: false })
    .limit(10)

  const orgs = (organizations ?? []) as Organization[]
  const eventList = (events ?? []) as unknown as Array<Event & { organizations: Organization }>
  const assemblyList = (assemblies ?? []) as unknown as Array<Assembly & { organizations: Organization }>

  return (
    <>
      <AdminNav />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              {orgs.length} organizacion{orgs.length !== 1 ? 'es' : ''} · {eventList.length} evento{eventList.length !== 1 ? 's' : ''} · {assemblyList.length} asamblea{assemblyList.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/assemblies/new"
              className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-semibold transition-colors"
            >
              + Nueva asamblea
            </Link>
            <Link
              href="/admin/events/new"
              className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors"
            >
              + Nuevo evento
            </Link>
          </div>
        </div>

        {/* Organizaciones */}
        <section aria-labelledby="orgs-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="orgs-heading" className="text-lg font-semibold text-white">
              Organizaciones
            </h2>
            <Link
              href="/admin/organizations/new"
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-colors"
            >
              + Nueva organización
            </Link>
          </div>

          {orgs.length === 0 ? (
            <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-3">No hay organizaciones aún.</p>
              <Link
                href="/admin/organizations/new"
                className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
              >
                + Crear la primera organización
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {orgs.map((org) => {
                const orgEvents = eventList.filter(
                  (e) => e.organizations?.id === org.id
                )
                const liveEvents = orgEvents.filter((e) => e.status === 'live')

                return (
                  <div
                    key={org.id}
                    className="bg-gray-900 border border-white/10 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: org.primary_color }}
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold text-white text-sm">{org.name}</p>
                        <p className="text-gray-500 text-xs">/{org.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{orgEvents.length} evento{orgEvents.length !== 1 ? 's' : ''}</span>
                      {liveEvents.length > 0 && (
                        <span className="flex items-center gap-1 text-red-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />
                          {liveEvents.length} en vivo
                        </span>
                      )}
                      <span className="ml-auto capitalize text-gray-600">{org.plan}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Eventos recientes */}
        <section aria-labelledby="events-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="events-heading" className="text-lg font-semibold text-white">
              Eventos recientes
            </h2>
          </div>

          {eventList.length === 0 ? (
            <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-3">No hay eventos aun.</p>
              <Link
                href="/admin/events/new"
                className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
              >
                Crear el primer evento
              </Link>
            </div>
          ) : (
            <div className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                      Evento
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">
                      Organizacion
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                      Estado
                    </th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                      Fecha
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {eventList.map((event, idx) => {
                    const badge = STATUS_BADGE[event.status] ?? STATUS_BADGE.draft
                    return (
                      <tr
                        key={event.id}
                        className={`border-b border-white/5 hover:bg-white/3 transition-colors ${
                          idx === eventList.length - 1 ? 'border-b-0' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-white">{event.title}</p>
                          <p className="text-xs text-gray-500 font-mono">/{event.slug}</p>
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell">
                          <span className="text-sm text-gray-400">
                            {event.organizations?.name ?? '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badge.color}`}>
                            {event.status === 'live' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />
                            )}
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell">
                          <span className="text-xs text-gray-500">
                            {new Date(event.start_at).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/admin/events/${event.id}`}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                          >
                            Ver
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {/* Asambleas */}
        <section aria-labelledby="assemblies-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="assemblies-heading" className="text-lg font-semibold text-white">
              Asambleas
            </h2>
            <Link
              href="/admin/assemblies/new"
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-colors"
            >
              + Nueva asamblea
            </Link>
          </div>

          {assemblyList.length === 0 ? (
            <div className="bg-gray-900 border border-white/10 rounded-xl p-8 text-center">
              <p className="text-gray-400 mb-3">No hay asambleas aún.</p>
              <Link
                href="/admin/assemblies/new"
                className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
              >
                Crear la primera asamblea
              </Link>
            </div>
          ) : (
            <div className="bg-gray-900 border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Asamblea</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Organización</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Estado</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Fecha</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {assemblyList.map((assembly, idx) => {
                    const badge = ASSEMBLY_STATUS_BADGE[assembly.status] ?? ASSEMBLY_STATUS_BADGE.draft
                    return (
                      <tr
                        key={assembly.id}
                        className={`border-b border-white/5 hover:bg-white/3 transition-colors ${idx === assemblyList.length - 1 ? 'border-b-0' : ''}`}
                      >
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-white">{assembly.title}</p>
                          <p className="text-xs text-gray-500 font-mono">{assembly.slug}</p>
                        </td>
                        <td className="px-5 py-3 hidden sm:table-cell">
                          <span className="text-sm text-gray-400">{assembly.organizations?.name ?? '—'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${badge.color}`}>
                            {assembly.status === 'active' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
                            )}
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell">
                          <span className="text-xs text-gray-500">
                            {new Date(assembly.scheduled_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/admin/assemblies/${assembly.id}`}
                            className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                          >
                            Gestionar
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </>
  )
}
