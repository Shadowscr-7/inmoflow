# ═══════════════════════════════════════════════════════════════
# InmoFlow — Crear ZIP para deploy al servidor
# ═══════════════════════════════════════════════════════════════
# Uso: powershell -File scripts/create-deploy-zip.ps1
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# Detectar raíz del proyecto (carpeta donde está scripts/)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$zipName = "deploy-inmoflow.zip"
$dest = Join-Path $projectRoot $zipName
$tempDir = Join-Path $env:TEMP "inmoflow-deploy-temp"

Write-Host "=== InmoFlow Deploy ZIP ===" -ForegroundColor Cyan
Write-Host "Proyecto: $projectRoot"

# Limpiar temp anterior
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

Write-Host "Copiando archivos..." -ForegroundColor Yellow
robocopy $projectRoot $tempDir /E `
    /XD node_modules .next dist .turbo .git coverage .vscode .idea backups `
    /XF *.log .env .env.local .env.production .DS_Store Thumbs.db deploy-inmoflow.zip `
    /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

# Verificar archivos críticos
$criticalFiles = @(
    "docker-compose.prod.yml",
    ".env.production.example",
    ".dockerignore",
    "docker/Dockerfile.api",
    "docker/Dockerfile.web",
    "docker/Dockerfile.worker",
    "packages/db/prisma/schema.prisma",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json"
)

Write-Host "`nVerificando archivos criticos:" -ForegroundColor Yellow
$missing = $false
foreach ($file in $criticalFiles) {
    $fullPath = Join-Path $tempDir $file
    if (Test-Path $fullPath) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [FALTA] $file" -ForegroundColor Red
        $missing = $true
    }
}

if ($missing) {
    Write-Host "`nERROR: Faltan archivos criticos. Abortando." -ForegroundColor Red
    Remove-Item $tempDir -Recurse -Force
    exit 1
}

# Crear ZIP
Write-Host "`nCreando ZIP..." -ForegroundColor Yellow
if (Test-Path $dest) { Remove-Item $dest -Force }
Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $dest -Force

$sizeMB = [math]::Round((Get-Item $dest).Length / 1MB, 2)

# Limpiar
Remove-Item $tempDir -Recurse -Force

Write-Host "`n=== ZIP creado exitosamente ===" -ForegroundColor Green
Write-Host "Archivo: $dest"
Write-Host "Tamano:  $sizeMB MB"
Write-Host ""
Write-Host "Siguiente paso:" -ForegroundColor Cyan
Write-Host "  scp $zipName root@31.97.93.104:/opt/"
Write-Host ""
Write-Host "En el servidor:" -ForegroundColor Cyan
Write-Host "  cd /opt && unzip -o deploy-inmoflow.zip -d inmoflow && cd inmoflow"
