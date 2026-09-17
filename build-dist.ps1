$ErrorActionPreference = "Stop"

$workspace = "C:\Users\YERSON - A70M\Documents\VALETEC\VALE-LENTES"
$stageDir = Join-Path $env:TEMP "vale_lentes_stage"

Write-Host "Limpiando directorio de staging..."
if (Test-Path $stageDir) {
    Remove-Item -Recurse -Force $stageDir
}
New-Item -ItemType Directory -Path $stageDir | Out-Null

Write-Host "Copiando bin..."
Copy-Item -Recurse -Path "$workspace\bin" -Destination "$stageDir\bin"

Write-Host "Copiando data..."
Copy-Item -Recurse -Path "$workspace\data" -Destination "$stageDir\data"

Write-Host "Copiando node_modules..."
Copy-Item -Recurse -Path "$workspace\node_modules" -Destination "$stageDir\node_modules"

Write-Host "Copiando public..."
Copy-Item -Recurse -Path "$workspace\public" -Destination "$stageDir\public"
if (Test-Path "$stageDir\public\js\app.src.js") {
    Remove-Item -Force "$stageDir\public\js\app.src.js"
    Write-Host "Excluido public\js\app.src.js de la distribucion publica."
}

Write-Host "Copiando ejecutables y scripts..."
$rootFiles = @(
    "crear_acceso_directo.bat",
    "crear_acceso_directo.ps1",
    "abrir_navegador_app.ps1",
    "iniciar_valelentes.bat",
    "db-sqlite.js",
    "server-standalone.js",
    "package.json",
    "Desinstalar_VALE-LENTES.exe"
)

foreach ($f in $rootFiles) {
    $src = Join-Path $workspace $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination "$stageDir\$f"
    } else {
        Write-Warning "No se encontro $f"
    }
}

$zipTarget = Join-Path $workspace "VALE-LENTES-PORTATIL.zip"
Write-Host "Comprimiendo en $zipTarget..."
if (Test-Path $zipTarget) {
    Remove-Item -Force $zipTarget
}

Compress-Archive -Path "$stageDir\*" -DestinationPath $zipTarget -CompressionLevel Optimal
Write-Host "Limpiando staging..."
Remove-Item -Recurse -Force $stageDir

$zipItem = Get-Item $zipTarget
Write-Host "ZIP generado: $($zipItem.FullName) - $([math]::Round($zipItem.Length / 1MB, 2)) MB"

# Compilar Instalador_VALE-LENTES_POS.exe con csc.exe
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$installerCs = Join-Path $workspace "Installer.cs"
$iconPath = Join-Path $workspace "public\img\logo.ico"
$outputExe = Join-Path $workspace "Instalador_VALE-LENTES_POS.exe"

Write-Host "Compilando Instalador_VALE-LENTES_POS.exe con csc..."
& $csc /target:winexe `
    "/win32icon:$iconPath" `
    /r:System.Windows.Forms.dll `
    /r:System.Drawing.dll `
    /r:System.IO.Compression.dll `
    /r:System.IO.Compression.FileSystem.dll `
    /r:Microsoft.CSharp.dll `
    "/resource:$zipTarget,package.zip" `
    "/out:$outputExe" `
    "$installerCs"

if ($LASTEXITCODE -eq 0) {
    $exeItem = Get-Item $outputExe
    Write-Host "¡Instalador compilado exitosamente!"
    Write-Host "Ruta: $($exeItem.FullName) - $([math]::Round($exeItem.Length / 1MB, 2)) MB"
    
    # Copiar al Escritorio
    $desktopPath = [System.Environment]::GetFolderPath("Desktop")
    $desktopExe = Join-Path $desktopPath "Instalador_VALE-LENTES_POS.exe"
    Copy-Item -Path $outputExe -Destination $desktopExe -Force
    Write-Host "Copiado al Escritorio: $desktopExe"
} else {
    Write-Error "Fallo la compilacion del instalador con csc.exe"
}
