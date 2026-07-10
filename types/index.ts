// types/index.ts — TypeScript types para todas las tablas de ts-stream-platform

export type OrgPlan = 'free' | 'paid'
export type OrgManagementMode = 'ts_solo' | 'hybrid' | 'autonomous'
export type EventStatus = 'draft' | 'live' | 'ended'
export type StreamingTier = 'youtube' | 'cloudflare' | 'teams'
export type AttendeeRole = 'attendee' | 'vip' | 'moderator'
export type AdminRole = 'ts_admin' | 'client_admin' | 'ai_agent'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  plan: OrgPlan
  management_mode: OrgManagementMode
  created_at: string
}

export interface EventBranding {
  primary_color?: string
  secondary_color?: string
  logo_url?: string
  background_color?: string
}

export interface Event {
  id: string
  organization_id: string
  title: string
  slug: string
  description: string | null
  start_at: string
  end_at: string
  status: EventStatus
  streaming_tier: StreamingTier
  youtube_url: string | null
  cloudflare_stream_id: string | null
  branding: EventBranding
  chat_enabled: boolean
  created_at: string
}

export interface EventWithOrg extends Event {
  organizations: Organization
}

export interface Attendee {
  id: string
  event_id: string
  organization_id: string
  full_name: string
  email: string | null
  username: string
  password_hash: string
  role: AttendeeRole
  created_at: string
}

export interface AttendeePublic {
  id: string
  event_id: string
  organization_id: string
  full_name: string
  email: string | null
  username: string
  role: AttendeeRole
  created_at: string
}

export interface Session {
  id: string
  attendee_id: string
  event_id: string
  login_at: string
  logout_at: string | null
  kicked_at: string | null
  duration_seconds: number | null
  country: string | null
  city: string | null
  ip_address: string | null
  user_agent: string | null
  last_ping_at: string | null
  created_at: string
}

export interface AdminUser {
  id: string
  organization_id: string | null
  supabase_user_id: string
  role: AdminRole
  created_at: string
}

export interface ConnectedAttendee {
  sessionId: string
  attendeeId: string
  full_name: string
  username: string
  login_at: string
  last_ping_at: string | null
}

export interface Message {
  id: string
  event_id: string
  attendee_id: string
  content: string
  created_at: string
  deleted_at: string | null
  attendee_name: string
  attendee_username: string
}

export type ModeratorRole = 'moderator' | 'co_host'

export interface EventModerator {
  id: string
  event_id: string
  email: string
  role: ModeratorRole
  token: string
  invited_at: string
  accepted_at: string | null
  expires_at: string
}

// JWT payload para sesiones de asistentes
export interface AttendeeJWTPayload {
  attendeeId: string
  eventId: string
  orgId: string
  sessionId: string
  name: string
  username: string
  iat?: number
  exp?: number
}

// JWT payload para moderadores de evento
export interface ModeratorJWTPayload {
  moderatorId: string
  eventId: string
  email: string
  role: ModeratorRole
  iat?: number
  exp?: number
}

// Metricas del evento
export interface EventMetrics {
  connected_now: number
  total_joined: number
  avg_duration_seconds: number | null
  connected_attendees: ConnectedAttendee[]
}

// ── Módulo de Asambleas ──────────────────────────────────────────────────────

export type AssemblyStatus = 'draft' | 'active' | 'ended'
export type AssemblyConvocatoria = 'primera' | 'segunda'
export type MotionType = 'informativo' | 'voto_simple' | 'voto_plancha' | 'voto_adhoc'
export type MotionStatus = 'pending' | 'open' | 'closed'
export type MajorityType = 'simple' | 'calificada'
export type AttendeeRole2 = 'owner' | 'observer' | 'secretary' | 'president'
export type AttendanceType = 'virtual' | 'presencial'

export interface Assembly {
  id: string
  organization_id: string
  title: string
  slug: string
  description: string | null
  scheduled_at: string
  status: AssemblyStatus
  current_convocatoria: AssemblyConvocatoria
  quorum_threshold_primera: number
  quorum_threshold_segunda: number
  total_coefficient: number
  branding: EventBranding
  created_at: string
}

export interface AssemblyWithOrg extends Assembly {
  organizations: Organization
}

export interface AssemblyUnit {
  id: string
  assembly_id: string
  unit_number: string
  owner_name: string
  coefficient: number
  created_at: string
}

export interface AssemblyAttendee {
  id: string
  assembly_id: string
  organization_id: string
  full_name: string
  email: string | null
  username: string
  unit_id: string | null
  role: AttendeeRole2
  attendance_type: AttendanceType
  created_at: string
}

export interface AssemblyPoder {
  id: string
  assembly_id: string
  granting_unit_id: string
  receiving_attendee_id: string | null
  representative_name: string
  document_url: string | null
  verified: boolean
  confirmed_at: string | null
  created_at: string
  granting_unit?: AssemblyUnit
}

export interface AssemblyMotion {
  id: string
  assembly_id: string
  order_index: number
  title: string
  description: string | null
  motion_type: MotionType
  majority_type: MajorityType
  majority_pct: number
  status: MotionStatus
  opened_at: string | null
  closed_at: string | null
  duration_seconds: number | null
  closes_at: string | null
  created_at: string
  plancha_options?: AssemblyPlanchaOption[]
}

export interface AssemblyPlanchaOption {
  id: string
  motion_id: string
  name: string
  description: string | null
  order_index: number
  created_at: string
}

export interface AssemblyVote {
  id: string
  motion_id: string
  assembly_id: string
  unit_id: string
  cast_by_attendee_id: string
  vote_value: string
  coefficient_weight: number
  voted_at: string
}

export interface AssemblyQuorum {
  current_coefficient: number
  total_coefficient: number
  pct: number
  threshold: number
  reached: boolean
  convocatoria: AssemblyConvocatoria
  connected_count: number
  presencial_count: number
}

export interface UnitCSVRow {
  unit_number: string
  owner_name: string
  coefficient: string
}

export interface PoderCSVRow {
  unit_number: string
  representative_name: string
}

// CSV row para importacion de asistentes
export interface AttendeeCSVRow {
  full_name: string
  email?: string
  username: string
  password?: string
}

// Resultado de importacion CSV
export interface ImportResult {
  imported: number
  errors: Array<{ row: number; username: string; error: string }>
}
