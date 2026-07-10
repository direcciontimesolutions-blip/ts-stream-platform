-- 008_motion_countdown.sql
-- Agrega temporizador de votaciones a assembly_motions

ALTER TABLE assembly_motions
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,   -- duración programada (null = sin límite)
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;      -- cierre automático = opened_at + duration_seconds

CREATE INDEX IF NOT EXISTS idx_assembly_motions_closes_at
  ON assembly_motions(closes_at)
  WHERE status = 'open' AND closes_at IS NOT NULL;
