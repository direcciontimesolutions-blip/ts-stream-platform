-- 018_session_limit_atomic.sql — Limite de sesiones concurrentes, version atomica
--
-- PENDIENTE DE APLICAR (19 ago 2026): Claude no tiene SUPABASE_ACCESS_TOKEN ni password
-- de la base para correr migraciones via CLI/DDL directo, asi que este archivo quedo listo
-- pero SIN aplicar. Julian: pegar este contenido completo en el SQL Editor de Supabase
-- (dashboard del proyecto -> SQL Editor -> New query -> pegar -> Run) una sola vez, antes
-- del evento real del 4 sep si se quiere cerrar la ventana de carrera descrita abajo.
--
-- Contexto: app/api/auth/login/route.ts hoy hace el limite de "maximo 2 sesiones
-- simultaneas por asistente" contando en memoria (leer sesiones abiertas, filtrar por
-- frescura, decidir, insertar) — dos llamadas HTTP separadas a Supabase, no una
-- transaccion. Es correcto en el caso normal y ya esta desplegado y probado. El unico
-- hueco real: si el MISMO asistente dispara 2 logins casi en el mismo instante (doble
-- clic, 2 pestañas, reintento de red) ambos podrian leer "hay 1 sesion fresca, hay
-- cupo" antes de que cualquiera termine de insertar, dejando entrar una 3ra sesion.
-- Validado por el agente `validator` el 19 ago 2026 como riesgo real (no teorico) para
-- un evento de 100-400 asistentes reales, aunque de baja probabilidad por sesion
-- individual.
--
-- Esta funcion resuelve eso: hace el conteo + housekeeping + insercion dentro de UNA
-- transaccion, con SELECT ... FOR UPDATE sobre las filas abiertas del attendee+evento,
-- lo que serializa logins concurrentes del MISMO usuario (no afecta a otros asistentes —
-- cada uno bloquea solo sus propias filas). Devuelve la sesion creada, o ningun row si
-- ya hay p_max_sessions sesiones frescas (el caller interpreta "0 rows" como 409).
--
-- Mismo criterio de sesion "fresca" que el resto del sistema (fix 517e6f5, 19 ago 2026,
-- usado en app/[org]/[event]/page.tsx y app/[org]/[event]/watch/page.tsx): logout_at IS
-- NULL AND kicked_at IS NULL AND COALESCE(last_ping_at, login_at) >= ahora - fresh_minutes.

CREATE OR REPLACE FUNCTION try_create_session(
  p_attendee_id UUID,
  p_event_id UUID,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_max_sessions INT DEFAULT 2,
  p_fresh_minutes INT DEFAULT 5
)
RETURNS SETOF sessions
LANGUAGE plpgsql
AS $$
DECLARE
  v_fresh_cutoff TIMESTAMPTZ := NOW() - (p_fresh_minutes || ' minutes')::INTERVAL;
  v_fresh_count INT;
  v_new_session sessions;
BEGIN
  -- Lock de todas las filas abiertas de este attendee+evento: serializa logins
  -- concurrentes del MISMO usuario. El resultado se descarta (PERFORM), solo interesa
  -- el efecto del lock dentro de esta transaccion.
  PERFORM 1
  FROM sessions
  WHERE attendee_id = p_attendee_id
    AND event_id = p_event_id
    AND logout_at IS NULL
    AND kicked_at IS NULL
  FOR UPDATE;

  SELECT COUNT(*) INTO v_fresh_count
  FROM sessions
  WHERE attendee_id = p_attendee_id
    AND event_id = p_event_id
    AND logout_at IS NULL
    AND kicked_at IS NULL
    AND COALESCE(last_ping_at, login_at) >= v_fresh_cutoff;

  IF v_fresh_count >= p_max_sessions THEN
    RETURN; -- sin filas: el caller lo interpreta como "sin cupo", responde 409
  END IF;

  -- Housekeeping: cerrar sesiones abiertas que ya no son frescas (huerfanas). No cuentan
  -- para el limite pero conviene no dejarlas colgadas para siempre en la tabla.
  UPDATE sessions
  SET logout_at = NOW()
  WHERE attendee_id = p_attendee_id
    AND event_id = p_event_id
    AND logout_at IS NULL
    AND kicked_at IS NULL
    AND COALESCE(last_ping_at, login_at) < v_fresh_cutoff;

  INSERT INTO sessions (attendee_id, event_id, ip_address, user_agent)
  VALUES (p_attendee_id, p_event_id, p_ip_address, p_user_agent)
  RETURNING * INTO v_new_session;

  RETURN NEXT v_new_session;
END;
$$;

-- Una vez aplicada esta funcion, el paso 6-7-7b de app/api/auth/login/route.ts se puede
-- reemplazar por una sola llamada:
--
--   const { data: sessionRows, error } = await supabase.rpc('try_create_session', {
--     p_attendee_id: attendee.id,
--     p_event_id: eventData.id,
--     p_ip_address: ipAddress,
--     p_user_agent: userAgent,
--     p_max_sessions: 2,
--     p_fresh_minutes: 5,
--   })
--   const session = sessionRows?.[0]
--   if (!session) return 409 'Ya tienes 2 sesiones activas...'
--
-- No es urgente aplicar esto para la prueba del 26 ago (bajo volumen, credenciales
-- ficticias). Se recomienda aplicarlo antes del evento real del 4 sep (100-400
-- asistentes reales) para eliminar la ventana de carrera por completo.
