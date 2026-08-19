# scripts/certificates/generar-y-enviar-certificados.ps1
#
# Orquestador de los 3 pasos del pipeline LOCAL de certificados (diseño oficial SCP,
# PowerPoint COM). Corre SOLO en esta maquina Windows con PowerPoint instalado y con
# ts-stream-platform como working directory real (usa npx tsx contra el repo). Ver
# scripts/certificates/README.md para el detalle de cada paso.
#
# Paso 1 (Node/tsx):  export-eligibles.ts     -> lee Supabase, escribe JSON de elegibles
# Paso 2 (PowerShell): generate-certificates.ps1 -> COM de PowerPoint, un PDF por asistente
# Paso 3 (Node/tsx):  send-certificates.ts     -> envia el correo con el PDF adjunto
#
# Por defecto SOLO genera los PDF (pasos 1-2) y se detiene ahi — el envio real de correo
# a asistentes reales es una accion con impacto directo al cliente/asistentes, asi que
# requiere el flag -Send explicito (y a su vez, quien dispare este script con -Send debe
# tener el visto bueno de Julian para ese evento puntual, esto no lo decide el script).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File generar-y-enviar-certificados.ps1 -EventId <uuid>
#   powershell -ExecutionPolicy Bypass -File generar-y-enviar-certificados.ps1 -EventId <uuid> -Send

param(
    [Parameter(Mandatory = $true)][string]$EventId,
    [switch]$Send,
    [string]$OutDir
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$workDir = Join-Path $env:TEMP "ts-certificados-$EventId"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

if (-not $OutDir) {
    $OutDir = Join-Path $workDir "pdfs"
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$dataJson = Join-Path $workDir "eligibles.json"

Write-Output "=== Paso 1/3: exportando elegibles desde Supabase ==="
Push-Location $repoRoot
try {
    & npx tsx "scripts/certificates/export-eligibles.ts" $EventId $dataJson
    if ($LASTEXITCODE -ne 0) { throw "export-eligibles.ts fallo (exit $LASTEXITCODE)" }
}
finally {
    Pop-Location
}

$data = Get-Content $dataJson -Raw -Encoding UTF8 | ConvertFrom-Json
if ($data.elegibles -eq 0) {
    Write-Output "0 asistentes elegibles todavia. Nada que generar."
    exit 0
}

Write-Output "=== Paso 2/3: generando $($data.elegibles) PDF(s) via PowerPoint COM ==="
& (Join-Path $PSScriptRoot "generate-certificates.ps1") -DataJson $dataJson -OutDir $OutDir
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "generate-certificates.ps1 fallo" }

Write-Output "PDFs en: $OutDir"

if (-not $Send) {
    Write-Output ""
    Write-Output "=== Paso 3/3 (envio) NO ejecutado ==="
    Write-Output "Revisa los PDFs generados en $OutDir antes de enviar."
    Write-Output "Para enviar de verdad (correo real a cada asistente elegible), correr de nuevo con -Send."
    exit 0
}

Write-Output ""
Write-Output "=== Paso 3/3: enviando correos reales con el PDF adjunto ==="
Push-Location $repoRoot
try {
    & npx tsx "scripts/certificates/send-certificates.ts" $dataJson $OutDir
    if ($LASTEXITCODE -ne 0) { throw "send-certificates.ts fallo (exit $LASTEXITCODE)" }
}
finally {
    Pop-Location
}

Write-Output "Listo."
