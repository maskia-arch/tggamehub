import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { adminAuth } from '../middleware/adminAuth';
import { getProfile, addEnergyAd, updateDisplayName, updateWalletAddresses, scheduleAccountDeletion, cancelAccountDeletion, claimDailyFreeRefill } from '../controllers/user';
import { startGame, submitScore, getGameBenchmark, getAllGameBenchmarks } from '../controllers/game';
import { getLeaderboard } from '../controllers/leaderboard';
import {
  getAdminStats,
  getAdminUsers,
  getAdminSeason,
  getAdminOrders,
  getAdminConfig,
  getAdminCoins,
  updateAdminCoin,
  resetAdminCoinPool,
  updateAdminUser,
  getAdminUserLogs,
  updateAdminSeason,
  startAdminSeason,
  settleAdminSeason,
  getAirdropPayouts,
  confirmAirdropPayout,
  resetDatabaseDangerZone
} from '../controllers/admin';

import {
  createCheckout,
  getOrderStatus,
  getActivePayments,
  getAddressPoolStatus,
  pushAddressPool,
  processWalletCallback,
  getSyncQueue,
  clearSyncQueue,
  handleAdsgramReward
} from '../controllers/shop';

import { getMarketData, getCoinChartData, tradeCoin, getMarketEventsData } from '../controllers/market';
import { getCurrentSeason } from '../services/seasonService';

const router = Router();

// Client error & event telemetry logging route (accessible from Frontend Mini App)
router.post('/telemetry/log', (req: Request, res: Response) => {
  const { level, message, details, userId, time } = req.body || {};
  const prefix = level === 'error' ? '❌ [CLIENT ERROR]' : level === 'warn' ? '⚠️ [CLIENT WARN]' : 'ℹ️ [CLIENT LOG]';
  const timeStr = time || new Date().toISOString();
  console.log(`${prefix} [${timeStr}] [User: ${userId || 'anonymous'}]: ${message}`, details ? JSON.stringify(details) : '');
  return res.json({ ok: true });
});

// User endpoints (secured)
router.get('/user/profile', authMiddleware, getProfile);
router.post('/user/energy/ad', authMiddleware, addEnergyAd);
router.get('/adsgram/reward', handleAdsgramReward);
router.post('/adsgram/reward', handleAdsgramReward);
router.post('/user/claim-daily-free-refill', authMiddleware, claimDailyFreeRefill);
router.patch('/user/display-name', authMiddleware, updateDisplayName);
router.patch('/user/wallets', authMiddleware, updateWalletAddresses);
router.post('/user/delete', authMiddleware, scheduleAccountDeletion);
router.post('/user/cancel-delete', authMiddleware, cancelAccountDeletion);

// Public / User Season info endpoint for banner & info modal
router.get('/season/info', async (_req: Request, res: Response) => {
  try {
    const seasonInfo = await getCurrentSeason();
    return res.json({
      success: true,
      season: seasonInfo,
      airdropShares: {
        top10Percent: seasonInfo.top10SharePercent,
        active20Percent: seasonInfo.active20SharePercent,
        randomPercent: seasonInfo.randomSharePercent,
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch season info' });
  }
});

// Game execution endpoints (secured)
router.post('/game/start', authMiddleware, startGame);
router.post('/game/score', authMiddleware, submitScore);
router.get('/game/benchmarks', authMiddleware, getAllGameBenchmarks);
router.get('/game/benchmark/:gameId', authMiddleware, getGameBenchmark);

// Leaderboard endpoint (secured to prevent scraping by non-users)
router.get('/leaderboard', authMiddleware, getLeaderboard);

// Market / Börse endpoints (secured)
router.get('/market/overview', authMiddleware, getMarketData);
router.get('/market/events', authMiddleware, getMarketEventsData);
router.get('/market/chart/:symbol', authMiddleware, getCoinChartData);
router.post('/market/trade', authMiddleware, tradeCoin);

// Shop endpoints (secured via WebApp auth)
router.post('/shop/checkout', authMiddleware, createCheckout);
router.get('/shop/order/status/:orderId', authMiddleware, getOrderStatus);


// Crypto Wallet endpoints (secured via separate secret token / HMAC signatures)
router.get('/crypto/active-payments', getActivePayments);
router.get('/crypto/address-pool', getAddressPoolStatus);
router.post('/crypto/address-pool', pushAddressPool);
router.post('/crypto/pure-wallet-callback', processWalletCallback);
router.get('/crypto/sync-queue', getSyncQueue);
router.post('/crypto/sync-queue', clearSyncQueue);
router.get('/crypto/airdrop-payouts', getAirdropPayouts);
router.post('/crypto/airdrop-payouts/confirm', confirmAirdropPayout);

// Admin endpoints (secured via adminAuth: dev=open, prod=Basic Auth)
router.get('/admin/stats', adminAuth, getAdminStats);
router.get('/admin/users', adminAuth, getAdminUsers);
router.get('/admin/season', adminAuth, getAdminSeason);
router.get('/admin/orders', adminAuth, getAdminOrders);
router.get('/admin/config', adminAuth, getAdminConfig);
router.get('/admin/coins', adminAuth, getAdminCoins);
router.patch('/admin/coins/:symbol', adminAuth, updateAdminCoin);
router.put('/admin/coins/:symbol', adminAuth, updateAdminCoin);
router.post('/admin/coins/:symbol/reset', adminAuth, resetAdminCoinPool);
router.patch('/admin/users/:id', adminAuth, updateAdminUser);
router.get('/admin/users/:id/logs', adminAuth, getAdminUserLogs);
router.patch('/admin/season', adminAuth, updateAdminSeason);
router.post('/admin/season/start', adminAuth, startAdminSeason);
router.post('/admin/season/settle', adminAuth, settleAdminSeason);
router.get('/admin/airdrop-payouts', adminAuth, getAirdropPayouts);
router.post('/admin/airdrop-payouts/confirm', adminAuth, confirmAirdropPayout);
router.post('/admin/danger/reset-database', adminAuth, resetDatabaseDangerZone);

export default router;
