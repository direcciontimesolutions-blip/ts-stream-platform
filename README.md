# ts-stream-platform

Plataforma de streaming white-label de Time Solutions Colombia. Permite transmitir eventos con branding personalizado por cliente, control de acceso por asistente (usuario + contraseña) y analytics de sesion en tiempo real.

---

## Que incluye

- Portal de asistentes con branding del evento (colores, logo, titulo)
- Login propio por asistente via JWT + httpOnly cookie (sin Supabase Auth)
- Embed de YouTube (Tier 0) — Cloudflare Stream preparado para Fase 2
- Heartbeat cada 30s + sendBeacon al cerrar para medir tiempo real visto
- Panel admin con Supabase Auth (email + password)
- Dashboard: organizaciones, eventos, asistentes, metricas en tiempo real
- Importacion de asistentes desde CSV
- Row Level Security completo en Supabase

---

## Setup local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Edita `.env.local` con tus credenciales de Supabase y un JWT_SECRET seguro.

Para generar el JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Correr en desarrollo

```bash
npm run dev
```

Abre http://localhost:3000 — redirige automaticamente a /admin.

---

## Setup Supabase

### 1. Crear proyecto en Supabase

- Ve a https://supabase.com y crea un nuevo proyecto
- Copia la URL y las keys (anon + service_role) a tu `.env.local`

### 2. Ejecutar migraciones

En el SQL Editor de Supabase Dashboard, ejecuta en orden:

```
supabase/migrations/001_schema.sql
supabase/migrations/002_rls.sql
```

### 3. Crear el primer admin (ts_admin)

1. En Supabase Dashboard > Authentication > Users, crea un usuario con email + password
2. Copia el UUID del usuario creado
3. En el SQL Editor ejecuta:

```sql
INSERT INTO admin_users (supabase_user_id, role, organization_id)
VALUES ('UUID-DEL-USUARIO-AQUI', 'ts_admin', NULL);
```

El ts_admin tiene acceso total a todas las organizaciones y eventos.

---

## Flujo para crear y probar un evento

### 1. Crear una organizacion (SQL directo recomendado para el primero)

```sql
INSERT INTO organizations (name, slug, primary_color)
VALUES ('Empresa Demo', 'empresa-demo', '#7C3AED');
```

O via API (autenticado como admin):
```bash
curl -X POST http://localhost:3000/api/admin/organizations \
  -H "Content-Type: application/json" \
  --cookie "sb-token=..." \
  -d '{"name": "Empresa Demo", "slug": "empresa-demo"}'
```

### 2. Crear el evento

Desde el panel admin: http://localhost:3000/admin/events/new

### 3. Agregar asistentes

En la pagina de detalle del evento, click en "Importar CSV". Formato:

```csv
full_name,email,username,password
Juan Garcia,juan@empresa.com,jgarcia,MiPass123
Maria Lopez,,mlopez,
```

Si no se incluye password, se genera uno automatico de 8 caracteres [A-Z0-9].

### 4. Activar el evento

En la pagina de detalle, cambiar status de "Borrador" a "En vivo".

### 5. Probar el portal del asistente

Ir a: http://localhost:3000/empresa-demo/[slug-del-evento]

---

## Pendientes de configuracion externa (Julian)

### CNAME en GoDaddy (para produccion)

Para que el portal se acceda desde live.timesolutions.com.co:
1. En GoDaddy > DNS de timesolutions.com.co
2. Agregar registro CNAME: Nombre `live`, Valor: dominio de Vercel
3. En Vercel: agregar dominio personalizado `live.timesolutions.com.co`
4. Actualizar `NEXT_PUBLIC_APP_URL=https://live.timesolutions.com.co` en env vars

### Cuenta Cloudflare Stream (Fase 2)

1. Crear cuenta en https://dash.cloudflare.com (seccion Stream)
2. Obtener Account ID y API Token con permisos de Stream
3. Agregar env vars: `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_STREAM_TOKEN`
4. Implementar CloudflarePlayer en EventPlayer.tsx (estructura ya preparada)

---

## Estructura del proyecto

```
app/
  [org]/[event]/          # Portal publico del evento (login + watch)
  admin/                  # Panel de administracion
  api/                    # API routes (auth, sessions, admin)
components/               # Componentes compartidos y de admin
lib/
  supabase/               # Clients browser y server
  auth.ts                 # JWT helpers (jose)
  utils.ts                # Helpers generales
types/index.ts            # Tipos TypeScript de todas las tablas
supabase/migrations/      # SQL: schema y RLS
middleware.ts             # Proteccion de rutas
```

---

## Seguridad

- Passwords de asistentes: bcryptjs (10 rounds)
- JWT de asistentes: HS256, 24h expiry, httpOnly cookie
- Admin auth: Supabase Auth (email + password)
- API routes de admin: verifican sesion Supabase antes de cada operacion
- RLS de Supabase: cada admin solo ve los datos de su organizacion
- Service role (bypass RLS): SOLO en API routes del servidor, nunca en el browser
