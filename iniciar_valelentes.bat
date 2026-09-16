@echo off
chcp 65001 >nul
title VALE-LENTES by VT VALETEC - Iniciador POS Optica
color 0A
cls

cd /d "%~dp0"

echo ============================================================
echo      VALE-LENTES by VT VALETEC - Sistema POS y Optica
echo ============================================================
echo.

:: 1. Detectar Node.js (Local portable en bin\ o en el Sistema)
set "NODE_CMD="
if exist "%~dp0bin\node.exe" set "NODE_CMD=%~dp0bin\node.exe"
if "%NODE_CMD%"=="" if exist "%~dp0runtime\node.exe" set "NODE_CMD=%~dp0runtime\node.exe"
if "%NODE_CMD%"=="" if exist "bin\node.exe" set "NODE_CMD=bin\node.exe"
if "%NODE_CMD%"=="" (
    where node >nul 2>nul
    if %errorlevel% equ 0 set "NODE_CMD=node"
)

if "%NODE_CMD%"=="" (
    echo  [ERROR] No se encontro Node.js en la carpeta local ni en el sistema.
    echo  Verifique que el archivo bin\node.exe se encuentre en la carpeta de instalacion.
    echo.
    pause
    exit /b 1
)

:: 2. Iniciar servidor local
echo  Iniciando servidor local y base de datos de Optica...
start "VALE-LENTES Server" /min "%NODE_CMD%" server-standalone.js

:: 3. Esperar confirmacion activa del servidor (hasta 6 segundos)
echo  Conectando con el sistema...
powershell -NoProfile -Command "for ($i=0; $i -lt 15; $i++) { try { $r = [System.Net.WebRequest]::Create('http://localhost:3008'); $res = $r.GetResponse(); if ($res.StatusCode -eq 200) { exit 0 } } catch { Start-Sleep -Milliseconds 400 } }; exit 1" >nul 2>nul

echo.
echo ============================================================
echo  [EXITO] Sistema activo y base de datos conectada.
echo  Abriendo VALE-LENTES en Modo Aplicacion de Escritorio...
echo ============================================================
echo.

:: 4. Abrir en Modo Aplicacion (Ventana limpia sin buscador ni barra de URL) con el navegador preferido
if exist "%~dp0abrir_navegador_app.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0abrir_navegador_app.ps1"
) else (
    start "" "http://localhost:3008"
)

exit
