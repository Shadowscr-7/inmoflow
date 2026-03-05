$ErrorActionPreference = "Stop"
$source = "c:\Users\jgomez\Documents\Projects\inmoflow"
$dest = "C:\Users\jgomez\Desktop\inmoflow-project.zip"
$tempDir = Join-Path $env:TEMP "inmoflow-zip-temp"

if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

Write-Host "Copying files..."
robocopy $source $tempDir /E /XD node_modules .next dist .turbo .git coverage /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

Write-Host "Creating zip..."
if (Test-Path $dest) { Remove-Item $dest -Force }
Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $dest -Force

$sizeMB = [math]::Round((Get-Item $dest).Length / 1MB, 2)
Write-Host "ZIP created: $dest ($sizeMB MB)"

Write-Host "Cleaning up..."
Remove-Item $tempDir -Recurse -Force
Write-Host "Done!"
