# Certificados de asistencia — pipeline LOCAL (diseño oficial SCP)

El **Primer Simposio en Pediatría** (SCP Antioquia, evento `b626b804-70a4-4f1b-b12a-9d319ddb3fb4`)
usa el diseño OFICIAL de certificado que entregó la SCP: `produccion/simposio-pediatria/certificado.pptx`
(1 slide, PowerPoint real, con logo, firma escaneada y todo el texto fijo ya diseñado).

## Por qué esto NO corre en el panel admin / Vercel

Reproducir ese diseño con fidelidad exacta requiere abrir el PPTX real y editarlo con el
motor de PowerPoint (automatización COM) — eso solo funciona en Windows con PowerPoint
instalado. Vercel corre en Linux sin PowerPoint, así que no puede ejecutar este paso.
El intento anterior (`lib/_deprecated/certificate-pdf.tsx`, con `@react-pdf/renderer`
sobre una imagen de fondo) sí corría en Vercel, pero era una **recreación aproximada**
sobre una plantilla PROVISIONAL marcada "NO OFICIAL" — quedó deprecado y sin uso apenas
llegó el diseño real, para no arriesgar mandarle a un médico un PDF que no se ve como el
oficial.

Por eso el botón "Ver elegibles a certificado" del panel admin (`app/admin/events/[id]/page.tsx`)
ya **no envía nada** — solo informa cuántos asistentes son elegibles. El `POST` del
endpoint (`app/api/admin/events/[id]/send-certificates/route.ts`) devuelve `501` con esta
misma explicación si algo lo llama.

## Los 3 pasos

Todo corre desde la raíz del repo (`ts-stream-platform/`), en esta máquina Windows con
PowerPoint instalado.

1. **`export-eligibles.ts`** (Node/tsx) — lee Supabase (misma agregación que el CSV de
   métricas, `lib/attendee-metrics.ts`, umbral de 30 min), escribe un JSON con el evento +
   la lista de asistentes elegibles (nombre, correo, slug de archivo, tiempo conectado).
   ```
   npx tsx scripts/certificates/export-eligibles.ts <eventId> <ruta-salida.json>
   ```

2. **`generate-certificates.ps1`** (PowerShell + COM de PowerPoint) — por cada asistente
   del JSON: copia `certificado.pptx` a un archivo temporal, inserta el nombre en la línea
   en blanco que la plantilla ya trae para eso (ubicada dinámicamente, no por posición fija
   — ver comentarios en el script), exporta esa copia a PDF (`SaveAs` con formato PDF —
   `ExportAsFixedFormat` falla con `NullReferenceException` en automatización COM
   headless de PowerShell 5.1, probado y descartado), borra el temporal. **Nunca abre ni
   modifica el `certificado.pptx` original** — solo copias.
   ```
   powershell -ExecutionPolicy Bypass -File scripts/certificates/generate-certificates.ps1 -DataJson <json> -OutDir <carpeta-pdfs>
   ```

3. **`send-certificates.ts`** (Node/tsx) — envía un correo real por asistente elegible con
   su PDF adjunto, mismo canal SMTP que ya usaba el endpoint viejo (`lib/email.ts`,
   nodemailer + Gmail, credenciales en `.env.secrets.txt`, nunca en git). Sin
   deduplicación: correrlo dos veces reenvía a todos.
   ```
   npx tsx scripts/certificates/send-certificates.ts <json> <carpeta-pdfs>
   ```

## Orquestador

`generar-y-enviar-certificados.ps1` corre los 3 pasos en orden. **Por defecto se detiene
después de generar los PDF** (pasos 1-2) — el envío de correo real a asistentes reales
tiene impacto directo hacia el cliente y requiere el flag `-Send` explícito:

```
# Solo genera los PDF, no envía nada — para revisar antes de mandar:
powershell -ExecutionPolicy Bypass -File scripts/certificates/generar-y-enviar-certificados.ps1 -EventId <uuid>

# Genera Y envía de verdad:
powershell -ExecutionPolicy Bypass -File scripts/certificates/generar-y-enviar-certificados.ps1 -EventId <uuid> -Send
```

## Detalle de la inserción del nombre

El shape "Title 1" del PPTX trae, entre "Certifica que:" y "Participó como asistente en
el ", **3 líneas en blanco** (cada una es un salto de línea suave / carácter VT dentro del
mismo párrafo). La línea del medio ya viene formateada distinto a las otras dos (Arial
Narrow 20 Bold, negro — las otras dos son 24 Bold sin contenido) — señal clara de que el
autor original del PPTX la dejó ahí a propósito para escribir el nombre a mano. El script
la ubica dinámicamente contando los runs de puro VT después del run que contiene
"Certifica que:", en vez de asumir una posición de carácter fija — así no se rompe si
alguien edita un espacio en otra parte del texto fijo.

## Corrección de texto ya aplicada al archivo maestro (19 ago 2026)

El tagline traía un error de tipeo: "¡Tu puedes hacer la diferencias!" → corregido
directo en `produccion/simposio-pediatria/certificado.pptx` a "¡Tú puedes hacer la
diferencia!" (tilde + singular), por pedido explícito de Julian. El resto del texto fijo
(nombre del curso, lugar, fecha, puntos PRECEP, firma) se dejó tal cual, sin tocar.
