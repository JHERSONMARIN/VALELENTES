$shell = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'VALE-LENTES Óptica POS.lnk'
$targetPath = Join-Path $PSScriptRoot 'iniciar_valelentes.bat'

$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'VALE-LENTES Óptica POS by VT VALETEC'
$shortcut.Save()

Write-Host '[OK] Acceso directo creado exitosamente en el Escritorio!' -ForegroundColor Green