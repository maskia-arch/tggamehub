@echo off
title TG Game Hub - Pure Wallet (Live Krypto Gateway)
color 0D
echo ===================================================
echo   TG GAME HUB - PURE WALLET (LIVE KRYPTO GATEWAY)
echo ===================================================
echo.

if not exist "pure-wallet" (
    color 0C
    echo [FEHLER] Der Ordner pure-wallet wurde nicht gefunden!
    echo.
    pause
    exit /b 1
)

echo [1/1] Pruefe Pure-Wallet Abhaengigkeiten...
cd pure-wallet
call npm install --no-fund --no-audit --loglevel=error
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [WARNUNG] Fehler bei npm install in pure-wallet!
)
cd ..

echo.
echo ===================================================
echo Starte Pure Wallet Gateway (Live-Betrieb)...
echo ===================================================
echo.

echo Pure Wallet Gateway wird in neuem Fenster gestartet...
start "TG Game Hub - Pure Wallet Gateway" cmd /k "cd pure-wallet && npm run dev"

echo.
echo ===================================================
echo [ERFOLG] Pure Wallet Gateway wurde gestartet!
echo.
echo Wallet Dashboard:   http://localhost:7778
echo Wallet Profil DB:   tggamehub_wallet.db
echo ===================================================
echo.
pause
