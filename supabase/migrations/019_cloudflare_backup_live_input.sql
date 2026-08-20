-- 019_cloudflare_backup_live_input.sql — segundo Live Input de Cloudflare en paralelo
--
-- Pedido de Julian (20 ago 2026): para el cliente nuevo ("no puede fallar", credenciales,
-- sesion unica), el respaldo de video ante una falla de Cloudflare NO puede ser YouTube —
-- eso sacrificaria el control de acceso (URLs firmadas que expiran) por un link publico
-- permanente. Solucion sin ese trade-off: vMix transmite EN PARALELO a dos Live Inputs de
-- Cloudflare desde el arranque (soporta 5 salidas de stream simultaneas). Si el principal
-- se cae, la plataforma solo cambia cual uid esta "activo" — el respaldo ya viene
-- recibiendo la misma señal, sin esperar reconexion. Nunca sale de Cloudflare, el control
-- de acceso no se toca.
--
-- Costo real: la entrega (lo caro, $1/1000 min) NO se duplica porque los asistentes solo
-- ven un uid a la vez. Solo se duplica el almacenamiento de la grabacion (ya con
-- deleteRecordingAfterDays:1), un par de dolares extra por evento como mucho.

ALTER TABLE events
  ADD COLUMN cloudflare_stream_id_backup TEXT;

COMMENT ON COLUMN events.cloudflare_stream_id_backup IS
  'UID del Live Input de respaldo de Cloudflare Stream, recibiendo la misma señal en paralelo al principal (events.cloudflare_stream_id). Swap manual desde el panel admin ante una falla del principal — ver app/api/admin/events/[id]/stream/failover/route.ts.';
