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

// API Request Logger for transparency in server console
app.use((req, _res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/health' && !req.path.endsWith('/events')) {
    const time = new Date().toLocaleTimeString('de-DE');
    console.log(`[HTTP ${time}]: ${req.method} ${req.path}`);
  }
  next();
});

// ── Admin Dashboard HTML (served at /admin-dashboard and /admin) ─────────────
// In dev mode: no auth required. In production: adminAuth middleware applies.
const adminHtmlPath = path.join(__dirname, '../src/admin-dashboard.html');
const adminHtmlFallback = path.join(__dirname, 'admin-dashboard.html');

const serveAdminDashboard = (_req: express.Request, res: express.Response) => {
  // In production mode, the admin dashboard HTML is NEVER hosted online
  if (config.nodeEnv === 'production') {
    res.status(404).send('Not Found');
    return;
  }
  const htmlPath = fs.existsSync(adminHtmlFallback) ? adminHtmlFallback : adminHtmlPath;
  if (!fs.existsSync(htmlPath)) {
    res.status(404).send('Admin dashboard HTML not found. Run build first.');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(htmlPath);
};

app.get('/admin', adminAuth, serveAdminDashboard);
app.get('/admin-dashboard', adminAuth, serveAdminDashboard);

// ── Game Dev Studio HTML (served at /dev/studio and /dev-studio) ─────────────
const devStudioPath = path.join(__dirname, '../src/dev-studio.html');
const devStudioFallback = path.join(__dirname, 'dev-studio.html');

const serveDevStudio = (_req: express.Request, res: express.Response) => {
  const htmlPath = fs.existsSync(devStudioFallback) ? devStudioFallback : devStudioPath;
  if (!fs.existsSync(htmlPath)) {
    res.status(404).send('Game Dev Studio HTML not found.');
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(htmlPath);
};

app.get('/dev/studio', serveDevStudio);
app.get('/dev-studio', serveDevStudio);

// Direct Games Static Serving (for live dev testing in sandbox iframe)
const possibleGamesPaths = [
  path.join(__dirname, '../../frontend/public/games'),
  path.join(process.cwd(), 'frontend/public/games'),
  path.join(__dirname, '../frontend/dist/games'),
  path.join(process.cwd(), 'frontend/dist/games'),
];
const gamesStaticPath = possibleGamesPaths.find((p) => fs.existsSync(p));
if (gamesStaticPath) {
  app.use('/games', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  }, express.static(gamesStaticPath));
}

// Register api router
app.use('/api', routes);

import { getRedisStatus } from './services/redis';

// Base health check with storage structure status
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try {
    await db.raw('SELECT 1');
    dbOk = true;
  } catch (err: any) {
    dbOk = false;
  }

  const redisStatus = getRedisStatus();

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    time: new Date(),
    storage: {
      database: {
        type: config.isPostgres ? 'PostgreSQL' : 'SQLite',
        connected: dbOk,
      },
      redis: redisStatus,
    }
  });
});

// ── Serve Vite Frontend MiniApp (Single-Service Monolith Deployment) ────────
const possibleFrontendPaths = [
  path.join(__dirname, '../../frontend/dist'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(__dirname, '../frontend/dist'),
  path.join(process.cwd(), 'dist/frontend'),
];
const frontendDistPath = possibleFrontendPaths.find((p) => fs.existsSync(p));

if (frontendDistPath) {
  console.log(`[SERVER]: Serving Vite Frontend SPA from ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));

  // SPA fallback for all remaining client routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // If no frontend build exists, serve Admin Dashboard at root
  app.get('/', adminAuth, serveAdminDashboard);
}

// Global Uncaught Error Handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const time = new Date().toLocaleTimeString('de-DE');
  console.error(`[SERVER ERROR ❌ ${time}] on ${req.method} ${req.path}:`, err?.stack || err);
  res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'Unknown server error' });
});

import { runAutoMigrations } from './database/autoMigrate';

// Run database auto-migrations & self-healing checks on startup
runAutoMigrations(db)
  .then(() => {
    // Start Express listener
    const server = app.listen(config.port, () => {
      console.log(`[SERVER]: Express server running on port ${config.port} (${config.nodeEnv} mode)`);
      
      // Start Telegram Bot
      initTelegramBot();

      // Start continuous 5-second market ticker
      const { startMarketTicker } = require('./services/marketEngine');
      startMarketTicker();

      // Start reliable Telegram notification background scheduler (Full Energy & Portfolio alerts)
      const { startNotificationScheduler } = require('./services/notificationService');
      startNotificationScheduler();

      // Start DeepSeek Autonomous AI Moderator & News Scheduler
      const { startAiScheduler } = require('./services/aiScheduler');
      startAiScheduler();

      // Start Automatic Account Deletion Scheduler (every 60s)
      const { startAccountDeletionScheduler } = require('./services/deletionScheduler');
      startAccountDeletionScheduler();

      // Seed Achievements Catalog
      const { seedAchievementsCatalog } = require('./services/achievementService');
      seedAchievementsCatalog();
    });

    // Graceful process shutdown handler (ensures port release and cleanly kills old instances)
    const handleShutdown = (signal: string) => {
      console.log(`[SERVER]: Received ${signal}. Closing HTTP server and freeing port ${config.port}...`);
      server.close(() => {
        console.log('[SERVER]: HTTP server closed gracefully.');
        process.exit(0);
      });
      // Force exit after 3 seconds if hanging
      setTimeout(() => {
        console.warn('[SERVER]: Forcefully terminating process after timeout.');
        process.exit(0);
      }, 3000).unref();
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGHUP', () => handleShutdown('SIGHUP'));
  })
  .catch((err) => {
    console.error('[DATABASE ERROR]: Failed auto-migration check on startup.', err);
    process.exit(1);
  });
