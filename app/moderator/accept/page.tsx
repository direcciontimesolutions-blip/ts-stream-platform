// app/moderator/accept/page.tsx — Pagina de aceptacion de invitacion de moderador

export default function ModeratorAcceptPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-4xl" aria-hidden="true">🔗</div>
        <h1 className="text-xl font-semibold text-white">
          Link de moderador requerido
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          Para acceder al panel de moderación, necesitas un link de invitación
          válido del administrador del evento.
        </p>
        <p className="text-gray-600 text-xs">
          Si ya tienes el link, abre la URL completa que te enviaron.
        </p>
      </div>
    </div>
  )
}
