# Telegram Game Hub - Produktionsreifer Prototyp

Dieses Projekt ist ein hochskalierbarer, modularer Telegram-Game-Hub, bestehend aus einem performanten Node.js (TypeScript) Backend und einer schlanken HTML5/React (Vite + TypeScript) Telegram Mini App.

---

## 🛠️ Architektur & Technologie-Stack

- **Backend:** Node.js, Express, TypeScript (Stateless / zustandslos für hohe Concurrency).
- **Datenbank:** SQL-Datenbank (SQLite für die lokale Entwicklung, PostgreSQL für die Produktion). Datenbankzugriffe erfolgen über Knex.js.
- **Caching & Leaderboards:** Redis Sorted Sets (`ZSET`) für extrem schnelle Echtzeit-Ranglisten (Tages-, Wochen-, Monats- und Season-Leaderboards) mit vollautomatischem In-Memory-Fallback für lokale Testzwecke ohne laufendes Redis.
- **Bot Integration:** Telegraf Framework zur Benutzerregistrierung (Onboarding) und Verarbeitung von Empfehlungs-Links (Referrals).
- **Frontend:** React, Vite, TypeScript, Lucide Icons und maßgeschneidertes CSS mit Premium Dark Mode, Glassmorphismus und flüssigen Micro-Animationen.

---

## 🚀 Lokale Test- & Entwicklungsumgebung (Windows Quickstart)

1. Kopiere die Datei `.env.example` und benenne sie in `.env.local` um:
   ```bash
   copy .env.example .env.local
   ```
2. Trage dein Telegram-Bot-Token (`TELEGRAM_BOT_TOKEN`) ein, das du von [@BotFather](https://t.me/BotFather) erhalten hast.
3. Wähle deinen gewählten Start-Modus im Stammverzeichnis:
   - **`start-dev.bat` (Lokale Offline-Entwicklung):** Startet das lokale Backend (Port `5000`) & die Frontend Mini-App (Port `5173`) und öffnet automatisch im Browser sowohl die **TG Game Hub App** (`http://localhost:5173`) als auch das **Admin Dashboard** (`http://localhost:5000/admin-dashboard`).
   - **`start-admin-live.bat` (Live VPS Admin Dashboard):** Öffnet separat das Online Live VPS Admin Dashboard deiner Produktions-Umgebung.
   - **`start-wallet.bat` (Live Pure Wallet Gateway):** Startet separat den Pure Wallet Krypto Payment Daemon für den Live-Betrieb.
4. **Entwickler-Bypass:** Wenn du die Web-App direkt im Browser (z. B. unter `http://localhost:5173`) öffnest, simuliert das System automatisch einen Telegram-Benutzerkontext (`dev_1337`), damit du die API-Funktionen (Energieabzug, Score-Einreichung, Leaderboard-Queries) direkt und ohne Telegram-Client testen kannst.

---

## 🔒 Sicherheits- & Anti-Cheat-Architektur

1. **Telegram HMAC-SHA256 Signaturprüfung:** 
   Jeder Request an gesicherte Endpunkte erfordert ein Telegram `initData` im `Authorization: Bearer <initData>` Header. Das Backend berechnet die Signatur kryptografisch mit dem Bot-Token und weist unbefugte Client-Manipulationen mit HTTP `403` ab.
2. **Signed Game Sessions (Zustandslos):**
   Beim Starten eines Spiels konsumiert der Nutzer 1 Energie. Die Schnittstelle `/api/game/start` stellt daraufhin ein signiertes JSON Web Token (JWT) aus, welches den `userId`, `gameId` und einen Zeitstempel (`startedAt`) enthält.
3. **Validierung der Score-Einreichung:**
   Beim Aufruf von `/api/game/score` wird das JWT entschlüsselt. Das Backend prüft:
   * **Besitzer-Integrität:** Stimmt der JWT-Nutzer mit dem anfragenden Telegram-Nutzer überein?
   * **Laufzeit-Check:** Ist die Spieldauer plausibel? (z. B. Score-Einreichungen nach unter 1,5 Sekunden werden blockiert).
   * **Score-Geschwindigkeits-Check:** Wächst der Score schneller als das physikalische Limit (z. B. maximal 150 Punkte pro Sekunde)? Cheater werden mit HTTP `400` abgewiesen.

---

## 🎮 Spiele einhängen (Modulare Schnittstelle)

Mini-Spiele können absolut modular eingehängt werden.

### Iframe-Integration (Standard)
Der Hub lädt Spiele in einer sicheren Sandbox über ein `iframe`. Das Spiel kommuniziert den erreichten Score über die HTML5 `postMessage` API an das übergeordnete Hub-Fenster.

**Implementierungs-Beispiel im Spiel-Code:**
```javascript
// Score an den Hub senden und Spiel beenden
window.parent.postMessage({
  type: 'SUBMIT_SCORE',
  score: 1250, // Erreichter Punktestand
  validationPayload: {
    // Optionale Zusatzdaten zur Server-Validierung
    movesCount: 42,
    clicks: 125
  }
}, '*');
```
*Ein voll funktionsfähiges Beispiel eines solchen Iframe-Spiels findest du im Verzeichnis [frontend/public/games/clicker/index.html](file:///c:/Users/Laptop/Desktop/tggamehub/frontend/public/games/clicker/index.html).*

---

## 🌐 VPS-Bereitstellung (Linux / Debian / Ubuntu)

### 1. System-Voraussetzungen installieren
```bash
# Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git redis-server postgresql

# PM2 global installieren für Prozessmanagement
sudo npm install -y -g pm2
```

### 2. Projekt vorbereiten & konfigurieren
Klone das Repository auf deinen VPS, erstelle die Datei `.env` im Stammverzeichnis und trage deine Produktionswerte ein:
```env
PORT=5000
NODE_ENV=production
TELEGRAM_BOT_TOKEN=dein_echtes_bot_token
DATABASE_URL=postgresql://postgres:dein_passwort@localhost:5432/tggamehub
REDIS_URL=redis://localhost:6379
JWT_SECRET=generiere_ein_starkes_zufaelliges_passwort
FRONTEND_URL=https://deine-domain.de
```

### 3. Backend kompilieren & starten
```bash
cd backend
npm install
npm run build

# Datenbank-Tabellen anlegen
npm run migrate

# Backend mit PM2 im Hintergrund starten
pm2 start dist/index.js --name tggamehub-backend
pm2 save
pm2 startup
```

### 4. Frontend bauen
Erstelle im Frontend-Verzeichnis eine `.env.production` Datei mit der API-URL des Backends:
```env
VITE_API_URL=https://deine-domain.de
```
Kompiliere das Frontend in statisches HTML/JS:
```bash
cd ../frontend
npm install
npm run build
```
Die gebauten Assets liegen nun im Ordner `frontend/dist/` und können direkt von Nginx ausgeliefert werden.

### 5. Nginx Reverse Proxy konfigurieren
Erstelle einen Nginx-Virtual-Host `/etc/nginx/sites-available/tggamehub`:
```nginx
server {
    listen 80;
    server_name deine-domain.de;

    # Statische Frontend-Dateien ausliefern
    location / {
        root /var/www/tggamehub/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API-Anfragen an das Node.js Backend weiterleiten
    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Aktiviere die Seite und starte Nginx neu:
```bash
sudo ln -s /etc/nginx/sites-available/tggamehub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
*Sichere deine Domain anschließend mit SSL (z. B. via Let's Encrypt / Certbot).*
