@echo off
title TG Game Hub - DEV LAUNCHER (App + Admin Dashboard + Backend)
color 0A
echo ===================================================
echo   TG GAME HUB - LOKALE ENTWICKLUNG (OFFLINE MODUS)
echo ===================================================
echo.

if not exist ".env.local" (
    color 0C
    echo [FEHLER] Die Datei .env.local wurde im Stammverzeichnis nicht gefunden!
    echo Bitte erstelle eine .env.local basierend auf .env.example.
    echo.
    pause
    exit /b 1
)

echo [1/2] Pruefe Backend-Abhaengigkeiten...
cd backend
call npm install --no-fund --no-audit --loglevel=error
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [FEHLER] Fehler bei npm install im Backend!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/2] Pruefe Frontend-Abhaengigkeiten...
cd frontend
call npm install --no-fund --no-audit --loglevel=error
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [FEHLER] Fehler bei npm install im Frontend!
    pause
    exit /b 1
)
cd ..

echo.
echo ===================================================
echo Starte lokales Backend & Frontend Mini App...
echo ===================================================
echo.

echo Backend API wird in neuem Fenster gestartet (Lokaler Offline-Modus)...
start "TG Game Hub - Backend API (DEV)" cmd /k "cd backend && set NODE_ENV=development&& set DATABASE_URL=sqlite://./local.db&& set REDIS_URL=&& set ENABLE_DEV_SIMULATION=true&& npm run dev"

echo Frontend Mini App wird in neuem Fenster gestartet...
start "TG Game Hub - Frontend Mini App (DEV)" cmd /k "cd frontend && npm run dev"

echo.
echo Warten auf Server-Start (3 Sekunden)...
timeout /t 3 /nobreak >nul

echo Öffne TG Game Hub App & Admin Dashboard im Browser...
start http://localhost:5173
start http://localhost:5000/admin-dashboard

echo.
echo ===================================================
echo [ERFOLG] Lokale Entwickler-Umgebung gestartet!
echo.
echo TG Game Hub App:    http://localhost:5173
echo Admin Dashboard:    http://localhost:5000/admin-dashboard
echo Backend API:        http://localhost:5000
echo.
echo (Lokale Datenbank: local.db | DEV-Zahlungssimulation aktiv)
echo ===================================================
echo.
pause
