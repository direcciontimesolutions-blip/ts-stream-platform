-- Migración 017: agregar cédula/documento de identidad a asistentes (requerido por registro
-- abierto cuando el evento necesita identificar a cada asistente de forma confiable para
-- generar certificados personalizados de asistencia, ej. acreditación médica).
--
-- Sin NOT NULL a nivel de base de datos: eventos existentes ya pueden tener asistentes sin
-- este dato. La obligatoriedad para registros NUEVOS se aplica a nivel de formulario + API
-- (ver components/OpenRegisterForm.tsx y app/api/auth/register/route.ts).
--
-- Se guarda normalizado (solo dígitos/letras, sin puntos/espacios/guiones) para que
-- "123.456" y "123456" no se traten como personas distintas en reportes o certificados.
--
-- Rollback: ALTER TABLE attendees DROP COLUMN IF EXISTS document_id;

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS document_id TEXT;
