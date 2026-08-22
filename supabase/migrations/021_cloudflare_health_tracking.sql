-- 021_cloudflare_health_tracking.sql — Estado conocido del Live Input para detectar caidas
--
-- PENDIENTE DE APLICAR: Julian debe pegar este contenido en el SQL Editor de Supabase
-- (mismo procedimiento que las migraciones 018 y 020).
--
-- Contexto: la auditoria de confiabilidad (21 ago 2026, agente especialista) encontro que
-- el failover primary/backup de Cloudflare es 100% manual — nadie se entera si el Live
-- Input se desconecta hasta que un humano note el video congelado y revise el panel admin.
-- Estas 2 columnas guardan el ULTIMO ESTADO CONOCIDO de cada Live Input (primary/backup)
-- para que un cron pueda detectar la TRANSICION "estaba conectado, ya no" (y no solo el
-- estado actual) — asi solo se manda alerta cuando algo REALMENTE cambio, no en cada
-- chequeo. Ver app/api/cron/check-stream-health/route.ts.

ALTER TABLE events ADD COLUMN IF NOT EXISTS cloudflare_last_status TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cloudflare_backup_last_status TEXT;
