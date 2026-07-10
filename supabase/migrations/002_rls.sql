-- 002_rls.sql
-- ts-stream-platform: Row Level Security

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Helper: es ts_admin (superadmin sin organizacion)
CREATE OR REPLACE FUNCTION is_ts_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE supabase_user_id = auth.uid()
    AND role = 'ts_admin'
    AND organization_id IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: organizacion del admin autenticado
CREATE OR REPLACE FUNCTION my_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM admin_users
  WHERE supabase_user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- organizations: ts_admin ve todo, client_admin ve solo la suya
CREATE POLICY "ts_admin_all_orgs" ON organizations FOR ALL USING (is_ts_admin());
CREATE POLICY "client_admin_own_org" ON organizations FOR SELECT
  USING (id = my_organization_id());

-- events: ts_admin ve todo, client_admin ve solo los de su org
CREATE POLICY "ts_admin_all_events" ON events FOR ALL USING (is_ts_admin());
CREATE POLICY "client_admin_own_events" ON events FOR ALL
  USING (organization_id = my_organization_id());

-- attendees: ts_admin y client_admin de la org pueden CRUD
CREATE POLICY "admin_manage_attendees" ON attendees FOR ALL
  USING (organization_id = my_organization_id() OR is_ts_admin());

-- sessions: INSERT abierto via service role, SELECT solo admins
CREATE POLICY "admin_view_sessions" ON sessions FOR SELECT
  USING (
    event_id IN (SELECT id FROM events WHERE organization_id = my_organization_id())
    OR is_ts_admin()
  );

-- admin_users: solo ts_admin gestiona
CREATE POLICY "ts_admin_manage_admins" ON admin_users FOR ALL USING (is_ts_admin());
CREATE POLICY "view_own_admin_user" ON admin_users FOR SELECT
  USING (supabase_user_id = auth.uid());
