-- 020_login_rate_limit.sql — Rate limiting de login por (evento, usuario, ip)
--
-- PENDIENTE DE APLICAR: Julian debe pegar este contenido completo en el SQL Editor de
-- Supabase (dashboard -> SQL Editor -> New query -> pegar -> Run) una sola vez, antes
-- del evento del 4 sep. Claude no tiene SUPABASE_ACCESS_TOKEN ni password de la base
-- para correr DDL directo (misma limitacion ya documentada en la migracion 018).
--
-- Contexto: 2 auditorias externas independientes (agentes especialistas) encontraron
-- que /api/auth/login no tiene ningun freno — sin limite de intentos, sin bloqueo por
-- IP ni por usuario. Cada intento hace un bcrypt.compare real (~50-100ms CPU) incluso
-- si el usuario no existe (a proposito, para no filtrar existencia de usuarios por
-- timing — eso esta bien y NO se toca). Riesgo real: fuerza bruta dirigida contra una
-- cuenta especifica, o flood de la funcion serverless con usuarios inventados.
--
-- Pasado por el agente `validator` (21 ago 2026) antes de construir. 3 ajustes
-- obligatorios que este diseño ya incorpora:
--   1. La capa de proteccion contra flood/DoS por IP NO va aqui — va en Vercel
--      Firewall (regla "Rate limit login", ya creada y publicada en produccion,
--      800 req/300s por IP sobre /api/auth/login, accion deny 5min). Se prefirio así
--      sobre construirlo a mano en Supabase porque actua en el edge (antes de gastar
--      computo/lecturas de DB) y no depende de ningun header de IP que el cliente
--      pudiera falsear — se confirmo con la documentacion oficial de Vercel que
--      x-forwarded-for llega ya sobreescrito por Vercel (no reenvia IPs externas) en
--      este proyecto (sin proxy adicional delante), asi que ese riesgo de spoofing
--      quedo descartado, pero el edge sigue siendo el lugar correcto para el freno de
--      IP de todos modos (evita gastar computo de Vercel/lecturas de Supabase).
--   2. Esta tabla SI es para el candado por USUARIO especifico (proteccion contra
--      fuerza bruta dirigida a una cuenta) — clave compuesta (evento, usuario, ip), NO
--      solo usuario. Un candado solo-por-usuario seria un vector de denegacion de
--      servicio DIRIGIDO: cualquiera que supiera el username de un asistente (no es
--      secreto, a diferencia de la contraseña) podria tumbarlo con 5 requests fallidos
--      desde OTRA ip, sin necesitar su contraseña — justo antes de que quiera entrar a
--      un evento con prensa y un ministro presente. Con la clave compuesta, un atacante
--      remoto ya no puede bloquear a un asistente real desde otra IP.
--   3. Existe un desbloqueo manual de admin (admin_unlock_login) — obligatorio, no
--      opcional: es la unica red de seguridad real para el caso borde de que atacante
--      y victima compartan la misma IP del venue (el candado compuesto no protege ahi
--      del todo), y para el caso trivial de un asistente que se equivoca de contraseña
--      5 veces solo. Sin esto, Time Solutions no podria reaccionar en vivo si alguien
--      reporta "no puedo entrar" el dia del evento.
--
-- Concurrencia: a diferencia de la migracion 018 (donde una condicion de carrera podia
-- violar una regla de negocio real — 2 sesiones donde debia haber 1), aqui una carrera
-- en el conteo de intentos fallidos es inconsecuente en el peor caso (el atacante gana
-- 1-2 intentos extra) — un solo INSERT ... ON CONFLICT ya es atomico por fila en
-- Postgres, sin necesitar el lock explicito SELECT ... FOR UPDATE de la 018.

CREATE TABLE IF NOT EXISTS login_attempts (
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  username      TEXT NOT NULL,
  ip_address    TEXT NOT NULL,
  failed_count  INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, username, ip_address)
);

-- Chequeo rapido ANTES del bcrypt costoso: ¿esta bloqueado ahora mismo?
CREATE OR REPLACE FUNCTION check_login_lock(p_event_id UUID, p_username TEXT, p_ip_address TEXT)
RETURNS TIMESTAMPTZ AS $$
  SELECT locked_until FROM login_attempts
  WHERE event_id = p_event_id AND username = p_username AND ip_address = p_ip_address
    AND locked_until IS NOT NULL AND locked_until > NOW();
$$ LANGUAGE sql STABLE;

-- Registra un intento fallido. Bloquea 10 minutos tras 5 fallos en los ultimos 15
-- minutos (el contador se reinicia solo si el ultimo fallo fue hace mas de 15 min).
CREATE OR REPLACE FUNCTION record_failed_login(p_event_id UUID, p_username TEXT, p_ip_address TEXT)
RETURNS VOID AS $$
DECLARE
  v_new_count INT;
BEGIN
  INSERT INTO login_attempts (event_id, username, ip_address, failed_count, updated_at)
  VALUES (p_event_id, p_username, p_ip_address, 1, NOW())
  ON CONFLICT (event_id, username, ip_address) DO UPDATE SET
    failed_count = CASE
      WHEN login_attempts.updated_at < NOW() - INTERVAL '15 minutes' THEN 1
      ELSE login_attempts.failed_count + 1
    END,
    updated_at = NOW()
  RETURNING failed_count INTO v_new_count;

  IF v_new_count >= 5 THEN
    UPDATE login_attempts SET locked_until = NOW() + INTERVAL '10 minutes'
    WHERE event_id = p_event_id AND username = p_username AND ip_address = p_ip_address;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Login exitoso: limpia el contador de ESE (evento, usuario, ip) especifico.
CREATE OR REPLACE FUNCTION clear_login_attempts(p_event_id UUID, p_username TEXT, p_ip_address TEXT)
RETURNS VOID AS $$
  DELETE FROM login_attempts
  WHERE event_id = p_event_id AND username = p_username AND ip_address = p_ip_address;
$$ LANGUAGE sql;

-- Desbloqueo manual de admin: borra TODOS los intentos de ese usuario en ese evento
-- (todas las IPs) — el admin no necesita saber cual IP quedo bloqueada.
CREATE OR REPLACE FUNCTION admin_unlock_login(p_event_id UUID, p_username TEXT)
RETURNS VOID AS $$
  DELETE FROM login_attempts WHERE event_id = p_event_id AND username = p_username;
$$ LANGUAGE sql;
