-- 005_moderator_chat.sql
-- Permite mensajes del moderador en el chat (attendee_id opcional, moderator_name para mostrar)

ALTER TABLE messages ALTER COLUMN attendee_id DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS moderator_name TEXT;
