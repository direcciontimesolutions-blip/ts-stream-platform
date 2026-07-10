-- 006_moderator_revoke.sql
-- Permite revocar acceso de moderadores/co-anfitriones

ALTER TABLE event_moderators ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
