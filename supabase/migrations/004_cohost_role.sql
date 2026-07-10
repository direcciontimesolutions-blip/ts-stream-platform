-- Migración 004: agregar rol co_host a event_moderators

ALTER TABLE event_moderators DROP CONSTRAINT IF EXISTS event_moderators_role_check;
ALTER TABLE event_moderators ADD CONSTRAINT event_moderators_role_check
  CHECK (role IN ('moderator', 'co_host'));
