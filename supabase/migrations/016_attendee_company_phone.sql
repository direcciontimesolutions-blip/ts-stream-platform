-- Migración 016: agregar empresa y teléfono a asistentes (requerido por registro abierto
-- cuando el objetivo es entregar reporte de métricas de conexión con esos datos al cliente)

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE attendees ADD COLUMN IF NOT EXISTS phone TEXT;
