-- 007_assembly_module.sql
-- Módulo de Asambleas Virtuales/Híbridas
-- Tablas: assemblies, assembly_units, assembly_attendees, assembly_sessions,
--         assembly_poderes, assembly_motions, assembly_plancha_options,
--         assembly_votes, assembly_qr_tokens

-- ============================================================
-- ASSEMBLIES — la asamblea (separada del módulo de streaming)
-- ============================================================
CREATE TABLE assemblies (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                     TEXT NOT NULL,
  slug                      TEXT NOT NULL,
  description               TEXT,
  scheduled_at              TIMESTAMPTZ NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'active', 'ended')),
  -- Convocatoria activa (admin cambia de primera a segunda si no se alcanza quórum)
  current_convocatoria      TEXT NOT NULL DEFAULT 'primera'
                              CHECK (current_convocatoria IN ('primera', 'segunda')),
  -- Umbrales de quórum como fracción (0.5001 = 50%+1 del total de coeficientes)
  quorum_threshold_primera  NUMERIC(8,6) NOT NULL DEFAULT 0.500100,
  quorum_threshold_segunda  NUMERIC(8,6) NOT NULL DEFAULT 0.000000,
  -- Suma total de coeficientes del conjunto (debe ser 1.000000 o 100.000000 según convención)
  total_coefficient         NUMERIC(12,6) NOT NULL DEFAULT 1.000000,
  branding                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- ============================================================
-- ASSEMBLY_UNITS — unidades del conjunto (aptos, locales, etc.)
-- ============================================================
CREATE TABLE assembly_units (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id   UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  unit_number   TEXT NOT NULL,       -- "101", "Local 3", "Torre A - 502"
  owner_name    TEXT NOT NULL,
  coefficient   NUMERIC(12,6) NOT NULL CHECK (coefficient > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assembly_id, unit_number)
);

-- ============================================================
-- ASSEMBLY_ATTENDEES — participantes registrados en la asamblea
-- (paralelo a 'attendees' del módulo streaming, auth separado)
-- ============================================================
CREATE TABLE assembly_attendees (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id      UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  email            TEXT,
  username         TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  unit_id          UUID REFERENCES assembly_units(id),  -- NULL si no es propietario directo
  role             TEXT NOT NULL DEFAULT 'owner'
                     CHECK (role IN ('owner', 'observer', 'secretary', 'president')),
  attendance_type  TEXT NOT NULL DEFAULT 'virtual'
                     CHECK (attendance_type IN ('virtual', 'presencial')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assembly_id, username)
);

-- ============================================================
-- ASSEMBLY_SESSIONS — heartbeat para quórum en tiempo real
-- is_presencial = true → no requiere heartbeat (contado hasta logout)
-- is_presencial = false → requiere last_ping_at < 2 min para contar en quórum
-- ============================================================
CREATE TABLE assembly_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendee_id    UUID NOT NULL REFERENCES assembly_attendees(id) ON DELETE CASCADE,
  assembly_id    UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  login_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at      TIMESTAMPTZ,
  duration_seconds INTEGER,
  ip_address     TEXT,
  user_agent     TEXT,
  last_ping_at   TIMESTAMPTZ,
  kicked_at      TIMESTAMPTZ,
  is_presencial  BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ASSEMBLY_PODERES — representaciones (una unidad → un representante)
-- ============================================================
CREATE TABLE assembly_poderes (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id             UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  granting_unit_id        UUID NOT NULL REFERENCES assembly_units(id) ON DELETE CASCADE,
  receiving_attendee_id   UUID REFERENCES assembly_attendees(id),
  representative_name     TEXT NOT NULL,   -- nombre del representante (para acta)
  document_url            TEXT,            -- PDF del poder (Supabase Storage)
  verified                BOOLEAN NOT NULL DEFAULT false,
  confirmed_at            TIMESTAMPTZ,     -- cuando el representante confirmó al entrar
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una unidad solo puede otorgar poder a una persona por asamblea
  UNIQUE(assembly_id, granting_unit_id)
);

-- ============================================================
-- ASSEMBLY_MOTIONS — puntos del orden del día
-- ============================================================
CREATE TABLE assembly_motions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id    UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL DEFAULT 0,
  title          TEXT NOT NULL,
  description    TEXT,
  motion_type    TEXT NOT NULL DEFAULT 'informativo'
                   CHECK (motion_type IN ('informativo', 'voto_simple', 'voto_plancha', 'voto_adhoc')),
  majority_type  TEXT NOT NULL DEFAULT 'simple'
                   CHECK (majority_type IN ('simple', 'calificada')),
  majority_pct   NUMERIC(5,2) NOT NULL DEFAULT 50.00,  -- ej: 70.00 para mayoría calificada
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'open', 'closed')),
  opened_at      TIMESTAMPTZ,
  closed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ASSEMBLY_PLANCHA_OPTIONS — opciones para votaciones de plancha
-- ============================================================
CREATE TABLE assembly_plancha_options (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  motion_id    UUID NOT NULL REFERENCES assembly_motions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,        -- "Plancha 1 — Lista Verde"
  description  TEXT,
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ASSEMBLY_VOTES — votos individuales por unidad y punto
-- vote_value: 'si' | 'no' | 'abstencion' | UUID de plancha option
-- coefficient_weight: coeficiente efectivo al momento de votar
--   (puede incluir poderes: coef_propio + coefs representados)
-- ============================================================
CREATE TABLE assembly_votes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  motion_id             UUID NOT NULL REFERENCES assembly_motions(id) ON DELETE CASCADE,
  assembly_id           UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  unit_id               UUID NOT NULL REFERENCES assembly_units(id) ON DELETE CASCADE,
  cast_by_attendee_id   UUID NOT NULL REFERENCES assembly_attendees(id),
  vote_value            TEXT NOT NULL,
  coefficient_weight    NUMERIC(12,6) NOT NULL CHECK (coefficient_weight > 0),
  voted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una unidad = un voto por punto del orden del día
  UNIQUE(motion_id, unit_id)
);

-- ============================================================
-- ASSEMBLY_QR_TOKENS — tokens de registro presencial
-- El admin genera un QR por asamblea; los presenciales lo escanean
-- ============================================================
CREATE TABLE assembly_qr_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assembly_id  UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
  token        TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE(assembly_id)  -- un QR activo por asamblea
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_assemblies_org       ON assemblies(organization_id);
CREATE INDEX idx_assemblies_slug      ON assemblies(slug);
CREATE INDEX idx_assembly_units       ON assembly_units(assembly_id);
CREATE INDEX idx_assembly_attendees   ON assembly_attendees(assembly_id);
CREATE INDEX idx_assembly_sessions_a  ON assembly_sessions(assembly_id);
CREATE INDEX idx_assembly_sessions_p  ON assembly_sessions(attendee_id);
CREATE INDEX idx_assembly_sessions_ping ON assembly_sessions(last_ping_at)
  WHERE logout_at IS NULL AND kicked_at IS NULL;
CREATE INDEX idx_assembly_poderes     ON assembly_poderes(assembly_id);
CREATE INDEX idx_assembly_motions     ON assembly_motions(assembly_id, order_index);
CREATE INDEX idx_assembly_votes_motion ON assembly_votes(motion_id);
CREATE INDEX idx_assembly_votes_unit   ON assembly_votes(unit_id);
