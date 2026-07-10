-- 003_kick_chat_moderators.sql
-- Feature A: kick asistente, chat activable, moderadores por evento

-- 1. kicked_at en sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS kicked_at TIMESTAMPTZ;

-- 2. chat_enabled en events
ALTER TABLE events ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN DEFAULT false NOT NULL;

-- 3. Tabla messages
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_messages_event_created ON messages(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_event_active  ON messages(event_id) WHERE deleted_at IS NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. Tabla event_moderators
CREATE TABLE IF NOT EXISTS event_moderators (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator')),
  token        UUID NOT NULL DEFAULT gen_random_uuid(),
  invited_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days') NOT NULL,
  UNIQUE (event_id, email),
  UNIQUE (token)
);

ALTER TABLE event_moderators ENABLE ROW LEVEL SECURITY;
