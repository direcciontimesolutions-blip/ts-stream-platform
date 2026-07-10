-- Migration 011: Sistema de piso (turno de palabra) — Agora WebRTC
CREATE TABLE IF NOT EXISTS assembly_floor_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id  UUID        NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  attendee_id  UUID        NOT NULL REFERENCES assembly_attendees(id) ON DELETE CASCADE,
  attendee_name TEXT       NOT NULL DEFAULT '',
  unit_number  TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'granted', 'revoked', 'ended')),
  agora_token  TEXT,
  agora_channel TEXT,
  agora_uid    BIGINT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  granted_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

-- Solo un request activo (pending o granted) por asistente por asamblea
CREATE UNIQUE INDEX IF NOT EXISTS floor_one_active_per_attendee
  ON assembly_floor_requests(assembly_id, attendee_id)
  WHERE status IN ('pending', 'granted');

-- RLS habilitado — service role bypasses (servidor usa service role key)
ALTER TABLE assembly_floor_requests ENABLE ROW LEVEL SECURITY;

-- Admins pueden leer todos los requests de sus asambleas
CREATE POLICY "Admin reads floor requests" ON assembly_floor_requests
  FOR SELECT USING (true);

-- Solo service role puede insert/update/delete (el servidor lo hace)
