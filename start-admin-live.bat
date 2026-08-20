@echo off
title TG Game Hub - Live Admin Dashboard (VPS / Production)
color 0E
echo ===================================================
echo   TG GAME HUB - ADMIN DASHBOARD (LIVE / VPS)
echo ===================================================
echo.

set VPS_URL=

:: Check if VPS_ADMIN_URL exists in .env.local
if exist ".env.local" (
    for /f "tokens=1,2 delims==" %%a in (.env.local) do (
        if "%%a"=="VPS_ADMIN_URL" set VPS_URL=%%b
    )
)

if "%VPS_URL%"=="" (
    echo [HINWEIS] Keine VPS_ADMIN_URL in .env.local gefunden.
    echo Bitte gib die URL deines Online VPS Admin Dashboards ein:
    echo (z.B. https://dein-vps-domain.de/admin-dashboard oder http://123.45.67.89:5000/admin-dashboard)
    echo.
    set /p VPS_INPUT="VPS Admin URL: "
    if not "%VPS_INPUT%"=="" (
        set VPS_URL=%VPS_INPUT%
    ) else (
        color 0C
        echo [FEHLER] Keine URL eingegeben! Abbruch.
        pause
        exit /b 1
    )
)

echo.
echo ===================================================
echo Verbinde mit Online VPS Admin Dashboard...
echo ===================================================
echo Live URL: %VPS_URL%
echo.

echo Öffne Live Admin Dashboard im Browser...
start %VPS_URL%

echo.
echo ===================================================
echo [ERFOLG] Live Admin Dashboard wurde geöffnet!
echo URL: %VPS_URL%
echo ===================================================
echo.
pause
