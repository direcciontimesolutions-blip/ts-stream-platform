# scripts/certificates/generate-certificates.ps1
#
# Genera un PDF de certificado personalizado por asistente, a partir de la plantilla
# OFICIAL entregada por la SCP (produccion/simposio-pediatria/certificado.pptx), usando
# automatizacion COM de PowerPoint (no react-pdf). Reemplaza el pipeline provisional
# (lib/certificate-pdf.tsx, ver lib/_deprecated/) porque el diseño real solo puede
# reproducirse con fidelidad exacta abriendo el PPTX real y editando el texto in-place
# con el motor de PowerPoint, no recreandolo con primitivas de PDF.
#
# SOLO CORRE EN WINDOWS CON POWERPOINT INSTALADO (esta maquina local de Julian). Vercel
# (Linux, sin PowerPoint) no puede ejecutar esto — por eso este paso vive fuera del panel
# admin, como parte de un pipeline local de 3 etapas (ver scripts/certificates/README.md).
#
# Nunca abre ni modifica el PPTX original: copia el template a un archivo temporal por
# asistente, edita SOLO la copia, exporta esa copia a PDF, y borra la copia. El archivo
# maestro certificado.pptx queda intacto en cada corrida.
#
# Insercion del nombre: en vez de asumir una posicion de caracter fija, ubica en tiempo
# real la 2a de las 3 lineas en blanco (cada una es un run de un solo caracter VT / 0x0B)
# que hay entre "Certifica que:" y "Participó como asistente en el " dentro del shape
# "Title 1". Esa linea (L5 de 3: L4-L5-L6) ya trae en la plantilla real un formato propio
# distinto al resto (Arial Narrow 20 Bold, vs 24 no-bold del texto fijo alrededor) — es la
# unica linea de esas 3 con un tamaño de fuente distinto, señal clara de que el autor
# original del PPTX la dejo ahi a proposito para escribir el nombre a mano. Encontrarla
# dinamicamente (en vez de un numero de caracter fijo tipo "posicion 71") hace que el
# script no se rompa si alguien agrega o quita un espacio en otra parte del texto fijo.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File generate-certificates.ps1 `
#       -PptxTemplate "...\certificado.pptx" `
#       -DataJson "...\eligibles.json" `
#       -OutDir "...\out"
#
# DataJson: array de objetos { "full_name": "...", "slug": "..." } (el "slug" ya viene
# calculado por export-eligibles.ts con la MISMA regla de slug que usaba el endpoint viejo,
# para que el nombre de archivo del PDF y el que arma send-certificates.ts coincidan).

param(
    [Parameter(Mandatory = $true)][string]$DataJson,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$PptxTemplate = "C:\Users\JULIAN TOBON\Documents\iCloudDrive\CLAUDE\produccion\simposio-pediatria\certificado.pptx"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PptxTemplate)) {
    throw "No se encontro la plantilla: $PptxTemplate"
}
if (-not (Test-Path $DataJson)) {
    throw "No se encontro el archivo de datos: $DataJson"
}
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$parsed = Get-Content $DataJson -Raw -Encoding UTF8 | ConvertFrom-Json
# Acepta 2 formatos: el que produce export-eligibles.ts (objeto con propiedad .attendees,
# uso real de produccion) o un array plano de {full_name, slug} (uso para pruebas rapidas
# con nombres ficticios, sin pasar por Supabase).
# OJO: si $parsed ya es un array, "$parsed.attendees" NO da $null -- PowerShell "unrolla"
# la propiedad sobre cada elemento y devuelve un array de $null, y "$null -ne (array de
# nulls)" da $true por error (comparas $null contra un array, no contra $null real). Por
# eso se chequea primero que $parsed NO sea array antes de mirar .attendees.
if ($parsed -isnot [System.Array] -and $null -ne $parsed.attendees) {
    $attendees = $parsed.attendees
} else {
    $attendees = $parsed
}
if ($attendees -isnot [System.Array]) {
    $attendees = @($attendees)
}

Write-Output "Generando $($attendees.Count) certificado(s) desde: $PptxTemplate"

$tempDir = Join-Path $env:TEMP "ts-cert-gen-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$ppt = New-Object -ComObject PowerPoint.Application

$results = @()

try {
    foreach ($att in $attendees) {
        $fullName = $att.full_name
        $slug = $att.slug
        if ([string]::IsNullOrWhiteSpace($fullName) -or [string]::IsNullOrWhiteSpace($slug)) {
            Write-Warning "Registro sin full_name/slug valido, se omite: $($att | ConvertTo-Json -Compress)"
            $results += [pscustomobject]@{ full_name = $fullName; slug = $slug; ok = $false; error = "full_name o slug vacio" }
            continue
        }

        $tempPptx = Join-Path $tempDir "cert-$slug.pptx"
        $pdfPath = Join-Path $OutDir "certificado-$slug.pdf"
        $pres = $null

        try {
            Copy-Item $PptxTemplate $tempPptx -Force

            $pres = $ppt.Presentations.Open($tempPptx, $false, $false, $false)  # read-write, no window
            $slide = $pres.Slides.Item(1)
            $shp = $slide.Shapes.Item(1)
            if ($shp.Name -ne "Title 1") {
                throw "Shape 1 no es 'Title 1' (es '$($shp.Name)') - la plantilla cambio de estructura, abortando este certificado."
            }

            $tr = $shp.TextFrame.TextRange
            $runs = $tr.Runs()

            $certRunFound = $false
            $vtRunStarts = @()
            foreach ($run in $runs) {
                $txt = $run.Text
                if (-not $certRunFound) {
                    if ($txt -match "Certifica que:") { $certRunFound = $true }
                    continue
                }
                $isPureVt = $txt.Length -gt 0
                foreach ($ch in $txt.ToCharArray()) {
                    if ([int]$ch -ne 11) { $isPureVt = $false; break }
                }
                if ($isPureVt) {
                    $vtRunStarts += $run.Start
                } else {
                    break
                }
            }

            if ($vtRunStarts.Count -lt 2) {
                throw "No se encontraron las 3 lineas en blanco esperadas entre 'Certifica que:' y 'Participo' - estructura del pptx cambio, abortando este certificado."
            }

            $insertPos = $vtRunStarts[1]  # 2a linea en blanco (L5) = donde va el nombre

            $nameRange = $tr.Characters($insertPos, 0)
            $nameRange.Text = $fullName

            $insertedRange = $tr.Characters($insertPos, $fullName.Length)
            $insertedRange.Font.Name = "Arial Narrow"
            $insertedRange.Font.Size = 20
            $insertedRange.Font.Bold = [int]-1  # msoTrue
            $insertedRange.Font.Color.RGB = 0   # negro, igual al resto del texto fijo de ese shape

            # ppSaveAsPDF = 32. Se probo ExportAsFixedFormat primero (la API "recomendada"
            # para exportar a PDF) pero via COM tardio en PowerShell 5.1 falla siempre con
            # NullReferenceException al renderizar (probado con y sin ventana visible) --
            # SaveAs con el FileFormat de PDF usa una ruta de codigo distinta en PowerPoint
            # que si funciona de forma confiable en automatizacion headless.
            $pres.SaveAs($pdfPath, 32)

            $pres.Close()
            $pres = $null

            Remove-Item $tempPptx -Force -ErrorAction SilentlyContinue

            Write-Output "OK: $fullName -> $pdfPath"
            $results += [pscustomobject]@{ full_name = $fullName; slug = $slug; ok = $true; pdf = $pdfPath }
        }
        catch {
            Write-Warning "FALLO generando certificado de '$fullName': $($_.Exception.Message)"
            $results += [pscustomobject]@{ full_name = $fullName; slug = $slug; ok = $false; error = $_.Exception.Message }
            if ($pres) {
                try { $pres.Close() } catch {}
            }
            if (Test-Path $tempPptx) {
                Remove-Item $tempPptx -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
finally {
    $ppt.Quit()
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$okCount = ($results | Where-Object { $_.ok }).Count
$failCount = ($results | Where-Object { -not $_.ok }).Count
Write-Output "-----"
Write-Output "Generados OK: $okCount / Fallidos: $failCount"

$resultsJsonPath = Join-Path $OutDir "generation-results.json"
$results | ConvertTo-Json -Depth 5 | Out-File -FilePath $resultsJsonPath -Encoding UTF8
Write-Output "Detalle: $resultsJsonPath"
