-- Migración 015: módulo de polls interactivos para eventos en vivo

CREATE TABLE polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('multiple_choice', 'open', 'rating')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  show_results BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, attendee_id)
);

ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_responses ENABLE ROW LEVEL SECURITY;

-- Anon puede leer polls activos (requerido para Supabase Realtime con anon key)
CREATE POLICY "Anon reads active polls" ON polls
  FOR SELECT USING (status = 'active');

-- Service role tiene acceso total (las API routes usan service role)
CREATE POLICY "Service role polls" ON polls
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role poll_responses" ON poll_responses
  USING (true) WITH CHECK (true);

-- Habilitar Realtime para que el portal del asistente reciba actualizaciones
ALTER TABLE polls REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE polls;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
