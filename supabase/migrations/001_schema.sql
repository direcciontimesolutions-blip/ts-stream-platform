-- 001_schema.sql
-- ts-stream-platform: schema base

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#7C3AED',
  secondary_color TEXT NOT NULL DEFAULT '#FFFFFF',
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','paid')),
  management_mode TEXT NOT NULL DEFAULT 'ts_solo' CHECK (management_mode IN ('ts_solo','hybrid','autonomous')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','ended')),
  streaming_tier TEXT NOT NULL DEFAULT 'youtube' CHECK (streaming_tier IN ('youtube','cloudflare')),
  youtube_url TEXT,
  cloudflare_stream_id TEXT,
  branding JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE TABLE attendees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'attendee' CHECK (role IN ('attendee','vip','moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, username)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendee_id UUID NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  country TEXT,
  city TEXT,
  ip_address TEXT,
  user_agent TEXT,
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  supabase_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'ts_admin' CHECK (role IN ('ts_admin','client_admin','ai_agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(supabase_user_id)
);

-- Indices para performance
CREATE INDEX idx_events_org ON events(organization_id);
CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_attendees_event ON attendees(event_id);
CREATE INDEX idx_sessions_event ON sessions(event_id);
CREATE INDEX idx_sessions_attendee ON sessions(attendee_id);
