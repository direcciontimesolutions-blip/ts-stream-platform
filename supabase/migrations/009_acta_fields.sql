-- Migration 009: Campos para el Acta PDF (Ley 675/2001)
-- assembly_type, acta_number, acta_location en assemblies
-- secretary_notes en assembly_motions

ALTER TABLE assemblies
  ADD COLUMN IF NOT EXISTS assembly_type TEXT DEFAULT 'ordinaria' CHECK (assembly_type IN ('ordinaria', 'extraordinaria')),
  ADD COLUMN IF NOT EXISTS acta_number TEXT,
  ADD COLUMN IF NOT EXISTS acta_location TEXT DEFAULT 'modalidad virtual';

ALTER TABLE assembly_motions
  ADD COLUMN IF NOT EXISTS secretary_notes TEXT;
