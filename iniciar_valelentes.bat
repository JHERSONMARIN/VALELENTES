@echo off
title VALE-LENTES by VT VALETEC - Iniciador POS Óptica
color 0A
cls

echo ============================================================
echo      VALE-LENTES by VT VALETEC - Sistema POS & Óptica
echo ============================================================
echo.

cd /d "%~dp0"

:: 1. Detectar Node.js (Local portable o del Sistema)
set "NODE_CMD="
if exist "%~dp0bin\node.exe" (
    set "NODE_CMD=%~dp0bin\node.exe"
) else if exist "%~dp0runtime\node.exe" (
    set "NODE_CMD=%~dp0runtime\node.exe"
) else (
    where node >nul 2>nul
    if %errorlevel% equ 0 (
        set "NODE_CMD=node"
    )
)

if "%NODE_CMD%"=="" (
    echo  [ERROR] No se encontro Node.js en el sistema ni en la carpeta local.
    echo  Por favor instale Node.js LTS (descargable desde https://nodejs.org)
    echo  o coloque node.exe dentro de la carpeta 'bin'.
    echo.
    pause
    exit /b 1
)

:: 2. Verificar si el servidor ya esta corriendo en el puerto 3008
powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3008 -ErrorAction SilentlyContinue)" >nul 2>nul
if %errorlevel% neq 0 (
    echo  Iniciando servidor local y base de datos de Óptica...
    start /min "VALE-LENTES Backend" "%NODE_CMD%" server-standalone.js
    timeout /t 2 >nul
) else (
    echo  El servidor de VALE-LENTES ya se encuentra activo.
)

echo.
echo ============================================================
echo  [EXITO] Sistema activo y base de datos conectada.
echo  Abriendo VALE-LENTES en Modo Aplicacion de Escritorio...
echo ============================================================
echo.

set "APP_URL=http://localhost:3008"
set "LAUNCHED=0"

:: 3. Abrir con Microsoft Edge en Modo App (Ventana nativa sin buscador ni barra de URL)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%"
    set "LAUNCHED=1"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%"
    set "LAUNCHED=1"
)

:: 4. Alternativa con Google Chrome en Modo App
if "%LAUNCHED%"=="0" (
    if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
        start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%"
        set "LAUNCHED=1"
    ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%"
        set "LAUNCHED=1"
    ) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
        start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%APP_URL%"
        set "LAUNCHED=1"
    )
)

:: 5. Navegador por defecto en caso de no encontrar rutas fijas
if "%LAUNCHED%"=="0" (
    start "" "%APP_URL%"
)

exit
