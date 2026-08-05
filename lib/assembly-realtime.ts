// lib/assembly-realtime.ts — Notificación push de cambios de quórum (Supabase Realtime Broadcast)
//
// Usa Broadcast en vez de postgres_changes sobre assembly_sessions a propósito:
// esa tabla tiene ip_address/user_agent (auditoría legal), y postgres_changes exige
// una politica RLS de SELECT para el rol anon en la tabla completa para poder emitir
// el evento — eso expondria esas columnas sensibles a cualquiera con la anon key.
// Broadcast no lee la tabla, solo avisa "algo cambio, refresca" — el cliente vuelve a
// pedir el estado real por /api/assembly/.../state (autenticado, con RLS de verdad).

import { createServiceRoleClient } from '@/lib/supabase/server'

export async function broadcastQuorumChange(
  supabase: ReturnType<typeof createServiceRoleClient>,
  assemblyId: string
) {
  try {
    const channel = supabase.channel(`assembly-quorum-${assemblyId}`)
    // httpSend en vez de send(): entrega por REST sin abrir un websocket de servidor
    // por request — send() cae a esto mismo automaticamente pero deja un warning de deprecacion.
    await channel.httpSend('quorum_changed', {})
  } catch {
    // El polling de respaldo cubre este caso — nunca romper el flujo de login/logout por esto
  }
}
