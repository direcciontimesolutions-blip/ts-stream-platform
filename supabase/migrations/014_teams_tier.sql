-- Migración 014: agregar tier 'teams' para Microsoft Teams embed
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_streaming_tier_check;
ALTER TABLE events ADD CONSTRAINT events_streaming_tier_check
  CHECK (streaming_tier IN ('youtube', 'cloudflare', 'teams'));
