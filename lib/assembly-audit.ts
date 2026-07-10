// lib/assembly-audit.ts — Registro de auditoría legal para asambleas
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'vote'
  | 'motion_open'
  | 'motion_close'
  | 'kick'
  | 'floor_request'
  | 'floor_granted'
  | 'floor_revoked'

export async function logAudit(
  supabase: SupabaseClient,
  params: {
    assembly_id?: string | null
    attendee_id?: string | null
    action: AuditAction
    details?: Record<string, unknown>
    ip_address?: string | null
    user_agent?: string | null
  }
) {
  try {
    await supabase.from('assembly_audit_log').insert({
      assembly_id: params.assembly_id ?? null,
      attendee_id: params.attendee_id ?? null,
      action: params.action,
      details: params.details ?? null,
      ip_address: params.ip_address ?? null,
      user_agent: params.user_agent ?? null,
    })
  } catch {
    // El audit log nunca debe romper el flujo principal
  }
}
