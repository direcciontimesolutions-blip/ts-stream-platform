-- Migration 010: Timestamps de inicio y fin de asamblea (para el acta PDF)
ALTER TABLE assemblies
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
