import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import routes from './routes';
import db from './database/client';
import { initTelegramBot } from './bot';
import { adminAuth } from './middleware/adminAuth';

const app = express();

// Configure CORS to allow requests from Frontend Mini App, Admin Dashboard, and local dev environments
app.use(cors({
  origin: (_origin, callback) => {
    // Allow all origins in local development or dev simulation mode
    return callback(null, true);
  },
  credentials: true,
}));

app.use(express.json());

// ── Admin Dashboard HTML (served at /admin-dashboard and /admin) ─────────────
// In dev mode: no auth required. In production: adminAuth middleware applies.
const adminHtmlPath = path.join(__dirname, '../src/admin-dashboard.html');
const adminHtmlFallback = path.join(__dirname, 'admin-dashboard.html');

const serveAdminDashboard = (_req: express.Request, res: express.Response) => {
  const htmlPath = fs.existsSync(adminHtmlFallback) ? adminHtmlFallback : adminHtmlPath;
  if (!fs.existsSync(htmlPath)) {
    res.status(404).send('Admin dashboard HTML not found. Run build first.');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(htmlPath);
};

app.get('/', adminAuth, serveAdminDashboard);
app.get('/admin', adminAuth, serveAdminDashboard);
app.get('/admin-dashboard', adminAuth, serveAdminDashboard);

// Register api router
app.use('/api', routes);

// Base health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

import { runAutoMigrations } from './database/autoMigrate';

// Run database auto-migrations & self-healing checks on startup
runAutoMigrations(db)
  .then(() => {
    // Start Express listener
    app.listen(config.port, () => {
      console.log(`[SERVER]: Express server running on port ${config.port} (${config.nodeEnv} mode)`);
      
      // Start Telegram Bot
      initTelegramBot();

      // Start continuous 5-second market ticker
      const { startMarketTicker } = require('./services/marketEngine');
      startMarketTicker();
    });
  })
  .catch((err) => {
    console.error('[DATABASE ERROR]: Failed auto-migration check on startup.', err);
    process.exit(1);
  });
