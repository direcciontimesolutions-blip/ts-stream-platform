-- Migration 012: URL de transmisión por asamblea + Supabase Realtime para notificaciones de votación

-- GAP-1: URL de stream configurable por asamblea
ALTER TABLE assemblies ADD COLUMN IF NOT EXISTS stream_url TEXT;

-- GAP-4: Habilitar Realtime en assembly_motions para notificaciones instantáneas de votación
ALTER TABLE assembly_motions REPLICA IDENTITY FULL;

-- Política SELECT para anon en assembly_motions (requerida para Realtime con anon key)
-- La agenda de una asamblea no contiene datos sensibles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'assembly_motions' AND policyname = 'Anon reads motions'
  ) THEN
    CREATE POLICY "Anon reads motions" ON assembly_motions FOR SELECT USING (true);
  END IF;
END $$;

-- Publicar tabla en Supabase Realtime (ignora si ya está publicada)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE assembly_motions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
