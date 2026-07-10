-- Migration 013: Seguridad legal + Documentos para asistentes

-- 1. Audit log (solo INSERT vía RLS — nadie puede modificar ni borrar)
CREATE TABLE IF NOT EXISTS assembly_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id  UUID REFERENCES assemblies(id) ON DELETE CASCADE,
  attendee_id  UUID REFERENCES assembly_attendees(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  details      JSONB,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE assembly_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit insert only"   ON assembly_audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin reads audit"   ON assembly_audit_log FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS idx_audit_assembly ON assembly_audit_log(assembly_id, created_at DESC);

-- 2. IP en votos (trazabilidad del momento exacto del voto)
ALTER TABLE assembly_votes ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 3. Snapshot de quórum al abrir y cerrar cada votación
ALTER TABLE assembly_motions ADD COLUMN IF NOT EXISTS quorum_at_open  NUMERIC;
ALTER TABLE assembly_motions ADD COLUMN IF NOT EXISTS quorum_at_close NUMERIC;

-- 4. Documentos descargables por asamblea (links externos — Google Drive, Dropbox, etc.)
CREATE TABLE IF NOT EXISTS assembly_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id  UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  order_index  INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE assembly_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin manages documents" ON assembly_documents USING (true) WITH CHECK (true);
CREATE POLICY "Anon reads documents"   ON assembly_documents FOR SELECT USING (true);
