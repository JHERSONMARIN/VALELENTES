@echo off
title Crear Acceso Directo - VALE-LENTES Óptica POS
color 0B
cls

echo ============================================================
echo   Creando Acceso Directo de VALE-LENTES en el Escritorio...
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear_acceso_directo.ps1"

echo.
echo ============================================================
echo  [LISTO] Ya puedes iniciar VALE-LENTES desde tu Escritorio.
echo ============================================================
echo.
pause
