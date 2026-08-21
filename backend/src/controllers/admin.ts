import { Request, Response } from 'express';
import db from '../database/client';
import { submitScoreToLeaderboards, resetLeaderboardCache } from '../services/redis';
import { config } from '../config';
import * as crypto from 'crypto';
import { recycleExpiredOrders } from './shop';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats  — main overview stats
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminStats(_req: Request, res: Response) {
  try {
    await recycleExpiredOrders();
    const safeCount = async (table: string, whereFn?: (q: any) => void) => {
      try {
        let q = db(table);
        if (whereFn) whereFn(q);
        const [row] = await q.count('* as count');
        return Number(row?.count || 0);
      } catch {
        return 0;
      }
    };

    const safeSum = async (table: string, col: string, whereFn?: (q: any) => void) => {
      try {
        let q = db(table);
        if (whereFn) whereFn(q);
        const [row] = await q.sum(`${col} as total`);
        return parseFloat(String(row?.total || 0));
      } catch {
        return 0;
      }
    };

    const safeAvg = async (table: string, col: string) => {
      try {
        const [row] = await db(table).avg(`${col} as avg`);
        return parseFloat(String(row?.avg || 0));
      } catch {
        return 0;
      }
    };

    // User counts
    const totalUsers = await safeCount('users');
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const newUsers24h = await safeCount('users', (q) => q.where('created_at', '>=', since24h));
    const newUsers7d = await safeCount('users', (q) => q.where('created_at', '>=', since7d));
    const scheduledForDeletion = await safeCount('users', (q) => q.whereNotNull('deletion_scheduled_at'));
    const totalReferrals = await safeCount('referrals');

    // Score / game stats
    const totalScores = await safeCount('scores');
    const totalScoresSum = await safeSum('scores', 'score');
    const avgScore = await safeAvg('scores', 'score');
    const scoresLast24h = await safeCount('scores', (q) => q.where('created_at', '>=', since24h));

    let uniquePlayers24h = 0;
    try {
      const rows = await db('scores').where('created_at', '>=', since24h).countDistinct('user_id as count');
      uniquePlayers24h = Number(rows[0]?.count || 0);
    } catch {}

    // Shop orders
    const totalOrders = await safeCount('shop_orders');
    const paidOrders = await safeCount('shop_orders', (q) => q.where('status', 'paid'));
    const pendingOrders = await safeCount('shop_orders', (q) => q.where('status', 'pending'));
    const expiredOrders = await safeCount('shop_orders', (q) => q.where('status', 'expired'));
    const totalRevenue = await safeSum('shop_orders', 'amount_eur', (q) => q.where('status', 'paid'));

    // Energy stats
    const avgEnergy = await safeAvg('users', 'energy_value');
    const fullEnergyUsers = await safeCount('users', (q) => q.where('energy_value', '>=', config.maxEnergy));
    const emptyEnergyUsers = await safeCount('users', (q) => q.where('energy_value', 0));

    // Wallet pool stats
    const totalAddresses = await safeCount('wallet_address_pool');
    const usedAddresses = await safeCount('wallet_address_pool', (q) => q.where('is_used', true));

    // Most active games
    let topGames: Array<{ gameId: string; plays: number; totalScore: number }> = [];
    try {
      const rows = await db('scores')
        .select('game_id')
        .count('* as plays')
        .sum('score as total_score')
        .groupBy('game_id')
        .orderBy('plays', 'desc')
        .limit(10);

      topGames = rows.map((g: any) => ({
        gameId: String(g.game_id || ''),
        plays: Number(g.plays || 0),
        totalScore: Number(g.total_score || 0),
      }));
    } catch {}

    return res.json({
      users: {
        total: totalUsers,
        new24h: newUsers24h,
        new7d: newUsers7d,
        scheduledForDeletion: scheduledForDeletion,
        withReferrals: totalReferrals,
      },
      games: {
        totalRounds: totalScores,
        totalScore: totalScoresSum,
        avgScore: avgScore.toFixed(0),
        rounds24h: scoresLast24h,
        uniquePlayers24h: uniquePlayers24h,
        topGames: topGames,
      },
      shop: {
        totalOrders: totalOrders,
        paidOrders: paidOrders,
        pendingOrders: pendingOrders,
        expiredOrders: expiredOrders,
        totalRevenue: totalRevenue.toFixed(2),
        conversionRate: totalOrders > 0
          ? ((paidOrders / totalOrders) * 100).toFixed(1)
          : '0.0',
      },
      energy: {
        avgEnergy: avgEnergy.toFixed(1),
        fullEnergyUsers: fullEnergyUsers,
        emptyEnergyUsers: emptyEnergyUsers,
      },
      crypto: {
        totalAddresses: totalAddresses,
        usedAddresses: usedAddresses,
        availableAddresses: Math.max(0, totalAddresses - usedAddresses),
      },
    });
  } catch (error: any) {
    console.error('[ADMIN STATS ERROR]:', error);
    return res.status(500).json({ error: 'Failed to load admin stats', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users  — paginated player list
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminUsers(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(5, parseInt(String(req.query.limit || '50'), 10)));
    const search = String(req.query.search || '').trim();
    const offset = (page - 1) * limit;

    let query = db('users')
      .leftJoin(
        db('scores').select('user_id').count('* as total_rounds').sum('score as total_score').groupBy('user_id').as('s'),
        'users.id', 's.user_id'
      )
      .select(
        'users.id',
        'users.username',
        'users.first_name',
        'users.display_name',
        'users.energy_value',
        'users.created_at',
        'users.wallet_ltc',
        'users.wallet_btc',
        'users.deletion_scheduled_at',
        'users.daily_ad_count',
        's.total_rounds',
        's.total_score'
      )
      .orderBy('users.created_at', 'desc');

    if (search) {
      query = query.where(function () {
        this.where('users.username', 'like', `%${search}%`)
          .orWhere('users.first_name', 'like', `%${search}%`)
          .orWhere('users.id', 'like', `%${search}%`)
          .orWhere('users.display_name', 'like', `%${search}%`);
      });
    }

    const [countRow] = await (search
      ? db('users').where(function () {
          this.where('username', 'like', `%${search}%`)
            .orWhere('first_name', 'like', `%${search}%`)
            .orWhere('id', 'like', `%${search}%`)
            .orWhere('display_name', 'like', `%${search}%`);
        }).count('* as count')
      : db('users').count('* as count'));

    const users = await query.limit(limit).offset(offset);

    return res.json({
      total: Number(countRow?.count || 0),
      page,
      limit,
      pages: Math.ceil(Number(countRow?.count || 0) / limit),
      users,
    });
  } catch (error: any) {
    console.error('[ADMIN USERS ERROR]:', error);
    return res.status(500).json({ error: 'Failed to load users', detail: error.message });
  }
}

import {
  getCurrentSeason,
  getSeasonProfitLeaderboard,
  getSeasonActivePlayers,
  getAirdropPreview,
  startOfficialSeason,
  settleAndFinalizeSeason
} from '../services/seasonService';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/season  — season pot, targets, rankings & airdrop overview
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminSeason(_req: Request, res: Response) {
  try {
    const seasonInfo = await getCurrentSeason();
    const profitLeaderboard = await getSeasonProfitLeaderboard(seasonInfo.id, 25);
    const activePlayers = await getSeasonActivePlayers(seasonInfo.id, 25);
    const airdropPreview = await getAirdropPreview(seasonInfo.id);

    const allSeasons = await db('seasons').orderBy('id', 'desc');
    const recentPayouts = await db('airdrop_payouts')
      .join('users', 'airdrop_payouts.user_id', 'users.id')
      .select('airdrop_payouts.*', 'users.username', 'users.first_name', 'users.display_name')
      .orderBy('airdrop_payouts.paid_at', 'desc')
      .limit(50);

    const formattedRecentPayouts = recentPayouts.map((p: any) => ({
      ...p,
      amount_eur: parseFloat(String(p.amount_eur || 0)),
    }));

    return res.json({
      season: seasonInfo,
      pot: {
        currentPot: seasonInfo.currentPot,
        targetAmount: seasonInfo.targetAmount,
        revenueSharePercent: seasonInfo.revenueSharePercent,
        progressPercent: seasonInfo.progressPercent,
        isGoalReached: seasonInfo.isGoalReached,
      },
      profitLeaderboard,
      activePlayers,
      airdropPreview,
      allSeasons,
      recentPayouts: formattedRecentPayouts,
    });
  } catch (error: any) {
    console.error('[ADMIN SEASON ERROR]:', error);
    return res.status(500).json({ error: 'Failed to load season data', detail: error.message });
  }
}

/**
 * PATCH /api/admin/season — Update active season details (target, pot, share %, name)
 */
export async function updateAdminSeason(req: Request, res: Response) {
  try {
    const season = await getCurrentSeason();
    const { name, target_amount, current_pot, revenue_share_percent, duration_days } = req.body;

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    if (name !== undefined) {
      updateData.name = String(name).trim();
    }

    if (target_amount !== undefined) {
      const amt = parseFloat(target_amount);
      if (!isNaN(amt) && amt >= 0) {
        updateData.target_amount = amt;
      }
    }

    if (current_pot !== undefined) {
      const pot = parseFloat(current_pot);
      if (!isNaN(pot) && pot >= 0) {
        updateData.current_pot = pot;
      }
    }

    if (revenue_share_percent !== undefined) {
      const share = parseFloat(revenue_share_percent);
      if (!isNaN(share) && share >= 0 && share <= 100) {
        updateData.revenue_share_percent = share;
      }
    }

    if (duration_days !== undefined) {
      const days = parseInt(duration_days, 10);
      if (!isNaN(days) && days > 0) {
        updateData.duration_days = days;
      }
    }

    if (Object.keys(updateData).length > 1) {
      await db('seasons').where({ id: season.id }).update(updateData);
    }

    const updatedSeason = await getCurrentSeason();
    return res.json({ success: true, season: updatedSeason });
  } catch (error: any) {
    console.error('[ADMIN UPDATE SEASON ERROR]:', error);
    return res.status(500).json({ error: 'Failed to update season', detail: error.message });
  }
}

/**
 * POST /api/admin/season/start — Officially starts the Season (30 days countdown)
 */
export async function startAdminSeason(_req: Request, res: Response) {
  try {
    const season = await startOfficialSeason();
    return res.json({ success: true, message: `${season.name} wurde offiziell gestartet!`, season });
  } catch (error: any) {
    console.error('[ADMIN START SEASON ERROR]:', error);
    return res.status(500).json({ error: 'Failed to start season', detail: error.message });
  }
}

/**
 * POST /api/admin/season/settle — Settle current season & execute airdrop payouts
 */
export async function settleAdminSeason(_req: Request, res: Response) {
  try {
    const result = await settleAndFinalizeSeason();
    return res.json({
      success: true,
      message: 'Season erfolgreich beendet und Airdrop verbucht!',
      result,
    });
  } catch (error: any) {
    console.error('[ADMIN SETTLE SEASON ERROR]:', error);
    return res.status(500).json({ error: 'Failed to settle season', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/orders  — recent shop orders
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminOrders(req: Request, res: Response) {
  try {
    await recycleExpiredOrders();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(5, parseInt(String(req.query.limit || '50'), 10)));
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status as string | undefined;

    let query = db('shop_orders')
      .leftJoin('users', 'shop_orders.user_id', 'users.id')
      .select(
        'shop_orders.id',
        'shop_orders.user_id',
        'shop_orders.product_id',
        'shop_orders.amount_eur',
        'shop_orders.amount_crypto',
        'shop_orders.coin',
        'shop_orders.status',
        'shop_orders.created_at',
        'shop_orders.paid_at',
        'shop_orders.expires_at',
        'users.username',
        'users.first_name'
      )
      .orderBy('shop_orders.created_at', 'desc');

    if (statusFilter && ['pending', 'paid', 'expired', 'detected', 'partially_paid'].includes(statusFilter)) {
      query = query.where('shop_orders.status', statusFilter);
    }

    const [countRow] = await (statusFilter
      ? db('shop_orders').where('status', statusFilter).count('* as count')
      : db('shop_orders').count('* as count'));

    const orders = await query.limit(limit).offset(offset);

    return res.json({
      total: Number(countRow?.count || 0),
      page,
      limit,
      pages: Math.ceil(Number(countRow?.count || 0) / limit),
      orders,
    });
  } catch (error: any) {
    console.error('[ADMIN ORDERS ERROR]:', error);
    return res.status(500).json({ error: 'Failed to load orders', detail: error.message });
  }
}

import { getRedisStatus } from '../services/redis';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/config  — runtime config info (non-sensitive)
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminConfig(_req: Request, res: Response) {
  const redisStatus = getRedisStatus();
  return res.json({
    nodeEnv: config.nodeEnv,
    port: config.port,
    isPostgres: config.isPostgres,
    databaseType: config.isPostgres ? 'PostgreSQL (18)' : 'SQLite',
    maxEnergy: config.maxEnergy,
    energyRechargeInterval: config.energyRechargeInterval,
    referralEnergyBonus: config.referralEnergyBonus,
    hasRedis: !!config.redisUrl,
    redisStatus: redisStatus,
    hasTelegramBot: !!config.telegramBotToken,
    frontendUrl: config.frontendUrl,
  });
}


/**
 * PATCH /api/admin/users/:id — Update player settings, energy, wallet, ad count, deletion status, and adjust score.
 */
export async function updateAdminUser(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      energy_value,
      display_name,
      wallet_ltc,
      wallet_btc,
      cancel_deletion,
      daily_ad_count,
      adjust_score
    } = req.body;

    const user = await db('users').where({ id }).first();
    if (!user) {
      return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    }

    const updateData: Record<string, any> = {};

    if (energy_value !== undefined) {
      const energy = parseInt(energy_value, 10);
      if (isNaN(energy) || energy < 0) {
        return res.status(400).json({ error: 'Ungültiger Energiewert.' });
      }
      updateData.energy_value = energy;
      updateData.energy_updated_at = db.fn.now();
    }

    if (display_name !== undefined) {
      updateData.display_name = display_name ? String(display_name).trim() : null;
    }

    if (wallet_ltc !== undefined) {
      updateData.wallet_ltc = wallet_ltc ? String(wallet_ltc).trim() : null;
    }

    if (wallet_btc !== undefined) {
      updateData.wallet_btc = wallet_btc ? String(wallet_btc).trim() : null;
    }

    if (daily_ad_count !== undefined) {
      const ads = parseInt(daily_ad_count, 10);
      if (!isNaN(ads) && ads >= 0) {
        updateData.daily_ad_count = ads;
      }
    }

    if (cancel_deletion === true) {
      updateData.deletion_scheduled_at = null;
    } else if (cancel_deletion === false) {
      updateData.deletion_scheduled_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      await db('users').where({ id }).update(updateData);
    }

    // Handle score adjustments
    if (adjust_score !== undefined) {
      const scoreToAdjust = parseInt(adjust_score, 10);
      if (!isNaN(scoreToAdjust) && scoreToAdjust !== 0) {
        await submitScoreToLeaderboards(id, scoreToAdjust);
        await db('scores').insert({
          user_id: id,
          game_id: 'admin_adjustment',
          score: scoreToAdjust,
          validation_payload: JSON.stringify({ admin: true, adjusted_at: new Date().toISOString() })
        });
      }
    }

    const updatedUser = await db('users').where({ id }).first();
    return res.json({ success: true, user: updatedUser });
  } catch (error: any) {
    console.error('[ADMIN UPDATE USER ERROR]:', error);
    return res.status(500).json({ error: 'Failed to update player', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/airdrop-payouts — List all airdrop payouts & target addresses
// ─────────────────────────────────────────────────────────────────────────────
export async function getAirdropPayouts(_req: Request, res: Response) {
  try {
    const payouts = await db('airdrop_payouts')
      .join('users', 'airdrop_payouts.user_id', 'users.id')
      .select(
        'airdrop_payouts.*',
        'users.username',
        'users.first_name',
        'users.display_name',
        'users.wallet_ltc',
        'users.wallet_btc'
      )
      .orderBy('airdrop_payouts.id', 'desc');

    const formatted = payouts.map((p: any) => ({
      ...p,
      amount_eur: parseFloat(String(p.amount_eur || 0)),
      amount_crypto: parseFloat(String(p.amount_crypto || 0)),
      wallet_address: p.wallet_address || p.wallet_ltc || p.wallet_btc || null,
      status: p.status || (p.paid_at ? 'completed' : 'pending'),
    }));

    return res.json({ success: true, payouts: formatted });
  } catch (error: any) {
    console.error('[ADMIN AIRDROP PAYOUTS ERROR]:', error);
    return res.status(500).json({ error: 'Failed to fetch airdrop payouts', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/airdrop-payouts/confirm — Confirm an airdrop payout & store TXID
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmAirdropPayout(req: Request, res: Response) {
  try {
    const { payoutId, txHash } = req.body;
    if (!payoutId) {
      return res.status(400).json({ error: 'Missing payoutId' });
    }

    const payout = await db('airdrop_payouts').where({ id: payoutId }).first();
    if (!payout) {
      return res.status(404).json({ error: 'Airdrop payout not found' });
    }

    const nowIso = new Date().toISOString();
    const finalTxHash = txHash || payout.tx_hash || `TX_AIRDROP_${payout.coin || 'LTC'}_${crypto.randomBytes(8).toString('hex')}`;

    await db('airdrop_payouts')
      .where({ id: payoutId })
      .update({
        status: 'completed',
        tx_hash: finalTxHash,
        paid_at: nowIso,
      });

    const updated = await db('airdrop_payouts').where({ id: payoutId }).first();
    console.log(`[Airdrop Engine]: Payout #${payoutId} confirmed & marked as completed! TXID: ${finalTxHash}`);

    return res.json({
      success: true,
      message: 'Airdrop Auszahlung erfolgreich als abgeschlossen markiert.',
      payout: {
        ...updated,
        amount_eur: parseFloat(String(updated.amount_eur || 0)),
        amount_crypto: parseFloat(String(updated.amount_crypto || 0)),
      }
    });
  } catch (error: any) {
    console.error('[CONFIRM AIRDROP PAYOUT ERROR]:', error);
    return res.status(500).json({ error: 'Failed to confirm airdrop payout', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/danger/reset-database — Secured Danger Zone Database Wipe & Reset
// ─────────────────────────────────────────────────────────────────────────────
export async function resetDatabaseDangerZone(req: Request, res: Response) {
  try {
    const { confirmPhrase } = req.body;
    const cleanPhrase = String(confirmPhrase || '').trim().toUpperCase();

    if (cleanPhrase !== 'DATENBANK LÖSCHEN' && cleanPhrase !== 'RESET DATABASE') {
      return res.status(400).json({
        error: 'Bestätigungs-Phrase ungültig. Bitte tippe exakt "DATENBANK LÖSCHEN" ein, um die Aktion auszuführen.'
      });
    }

    const safeDel = async (tableName: string) => {
      try {
        if (await db.schema.hasTable(tableName)) {
          await db(tableName).del();
        }
      } catch (err: any) {
        console.warn(`[RESET DB]: Warning clearing table ${tableName}:`, err.message);
      }
    };

    // 1. Delete transactional player data & logs in safe dependency order
    await safeDel('scores');
    await safeDel('referrals');
    await safeDel('airdrop_payouts');
    await safeDel('season_user_stats');
    await safeDel('shop_orders');
    await safeDel('user_portfolios');
    await safeDel('user_trades');
    await safeDel('user_inbox');
    await safeDel('market_price_history');
    await safeDel('market_events');
    await safeDel('wallet_sync_queue');
    await safeDel('users');

    // 2. Reset seasons table to clean Season 0 in preparing state
    await safeDel('seasons');
    const nowIso = new Date().toISOString();
    await db('seasons').insert({
      season_number: 0,
      name: 'Season 0',
      status: 'preparing',
      target_amount: 1000.00,
      current_pot: 0.00,
      revenue_share_percent: 30.00,
      duration_days: 30,
      top10_share_percent: 60.00,
      active20_share_percent: 20.00,
      random_share_percent: 20.00,
      is_active: false,
      start_date: null,
      end_date: null,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 3. Reset market coins to initial base prices and zero volumes
    if (await db.schema.hasTable('market_coins')) {
      const coins = await db('market_coins').select('*');
      for (const c of coins) {
        const base = Number(c.base_price || 0.00000001);
        await db('market_coins').where({ symbol: c.symbol }).update({
          current_price: base,
          volume_24h: 0,
          total_burned: 0,
          circulating_supply: 1000000000,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 4. Reset wallet address pool (mark is_used = false)
    if (await db.schema.hasTable('wallet_address_pool')) {
      await db('wallet_address_pool').update({ is_used: false });
    }

    // 5. Clear Redis leaderboards & memory leaderboards
    await resetLeaderboardCache();

    console.log('[ADMIN DANGER ZONE]: Complete database reset successfully executed by Administrator.');

    return res.json({
      success: true,
      message: 'Datenbank wurde erfolgreich und vollständig zurückgesetzt! Alle Spieler, Scores, Orders und Season-Daten wurden bereinigt. Season 0 befindet sich im Status "Vorbereitung".',
    });
  } catch (error: any) {
    console.error('[ADMIN RESET DATABASE ERROR]:', error);
    return res.status(500).json({ error: 'Fehler beim Zurücksetzen der Datenbank', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/coins — List all market coins, AMM pool reserves, volume & price
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminCoins(_req: Request, res: Response) {
  try {
    const hasMarketCoins = await db.schema.hasTable('market_coins');
    if (!hasMarketCoins) {
      return res.json({ success: true, coins: [] });
    }

    const coins = await db('market_coins').select('*').orderBy('symbol', 'asc');
    return res.json({
      success: true,
      coins: coins.map((c: any) => ({
        symbol: c.symbol,
        name: c.name,
        gameId: c.game_id,
        currentPrice: Number(c.current_price || 0.00000001),
        basePrice: Number(c.base_price || 0.00000001),
        virtualGameReserve: Number(c.virtual_game_reserve || 100000.0),
        virtualTokenReserve: Number(c.virtual_token_reserve || 10000000000000.0),
        constantProductK: Number(c.constant_product_k || 1e18),
        circulatingSupply: Number(c.circulating_supply || 10000000000000.0),
        totalBurned: Number(c.total_burned || 0),
        volume24h: Number(c.volume_24h || 0),
        updatedAt: c.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('[ADMIN COINS ERROR]:', error);
    return res.status(500).json({ error: 'Fehler beim Laden der Coins', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/coins/:symbol — Adjust price, AMM reserves, volume & supply
// ─────────────────────────────────────────────────────────────────────────────
export async function updateAdminCoin(req: Request, res: Response) {
  try {
    const symbol = (req.params.symbol || '').toUpperCase().trim();
    const {
      currentPrice,
      basePrice,
      virtualGameReserve,
      virtualTokenReserve,
      constantProductK,
      circulatingSupply,
      volume24h,
      totalBurned,
    } = req.body;

    const coin = await db('market_coins').where({ symbol }).first();
    if (!coin) {
      return res.status(404).json({ error: `Coin $${symbol} nicht gefunden.` });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    let newPrice = currentPrice !== undefined && !isNaN(parseFloat(currentPrice)) ? parseFloat(currentPrice) : Number(coin.current_price);
    let newGameReserve = virtualGameReserve !== undefined && !isNaN(parseFloat(virtualGameReserve)) ? parseFloat(virtualGameReserve) : Number(coin.virtual_game_reserve || 100000.0);
    let newTokenReserve = virtualTokenReserve !== undefined && !isNaN(parseFloat(virtualTokenReserve)) ? parseFloat(virtualTokenReserve) : Number(coin.virtual_token_reserve || 10000000000000.0);
    let newK = constantProductK !== undefined && !isNaN(parseFloat(constantProductK)) ? parseFloat(constantProductK) : Number(coin.constant_product_k || 1e18);

    // Consistency calculations:
    // When virtualGameReserve or currentPrice is adjusted, automatically compute matching token reserve and constant product k
    if (virtualGameReserve !== undefined || currentPrice !== undefined) {
      if (newPrice > 0 && newGameReserve > 0) {
        newTokenReserve = newGameReserve / newPrice;
        newK = newGameReserve * newTokenReserve;
      }
    } else if (virtualTokenReserve !== undefined) {
      if (newTokenReserve > 0 && newGameReserve > 0) {
        newPrice = newGameReserve / newTokenReserve;
        newK = newGameReserve * newTokenReserve;
      }
    }

    updates.current_price = Math.max(1e-8, Math.round(newPrice * 1e12) / 1e12);
    updates.virtual_game_reserve = Math.max(100.0, newGameReserve);
    updates.virtual_token_reserve = Math.max(100.0, newTokenReserve);
    updates.constant_product_k = Math.max(1.0, newK);

    if (basePrice !== undefined && !isNaN(parseFloat(basePrice))) {
      updates.base_price = Math.max(1e-8, parseFloat(basePrice));
    }
    if (circulatingSupply !== undefined && !isNaN(parseFloat(circulatingSupply))) {
      updates.circulating_supply = Math.max(0, parseFloat(circulatingSupply));
    } else if (virtualTokenReserve !== undefined || currentPrice !== undefined || virtualGameReserve !== undefined) {
      updates.circulating_supply = updates.virtual_token_reserve;
    }
    if (volume24h !== undefined && !isNaN(parseFloat(volume24h))) {
      updates.volume_24h = Math.max(0, parseFloat(volume24h));
    }
    if (totalBurned !== undefined && !isNaN(parseFloat(totalBurned))) {
      updates.total_burned = Math.max(0, parseFloat(totalBurned));
    }

    await db('market_coins').where({ symbol }).update(updates);

    // Insert a price history point so charts update immediately
    await db('market_price_history').insert({
      coin_symbol: symbol,
      price: updates.current_price,
      volume: 0,
      timestamp: new Date(),
    });

    console.log(`[ADMIN COIN UPDATE]: $${symbol} updated: Price=${updates.current_price}, GameReserve=${updates.virtual_game_reserve}, TokenReserve=${updates.virtual_token_reserve}, K=${updates.constant_product_k}`);

    return res.json({
      success: true,
      message: `Coin $${symbol} erfolgreich aktualisiert!`,
      coin: {
        symbol,
        ...updates,
      },
    });
  } catch (error: any) {
    console.error('[ADMIN UPDATE COIN ERROR]:', error);
    return res.status(500).json({ error: 'Fehler beim Aktualisieren des Coins', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/coins/:symbol/reset — Reset AMM pool to default parameters
// ─────────────────────────────────────────────────────────────────────────────
export async function resetAdminCoinPool(req: Request, res: Response) {
  try {
    const symbol = (req.params.symbol || '').toUpperCase().trim();
    const { initCoinPool } = require('../services/marketEngine');

    await initCoinPool(symbol, 0.00000001, 100000.0);

    return res.json({
      success: true,
      message: `Pool für $${symbol} wurde erfolgreich auf die Standard-Parameter (P0=0.00000001, x=100.000 Game$, y=10 Trillion, k=10^18) zurückgesetzt.`,
    });
  } catch (error: any) {
    console.error('[ADMIN RESET POOL ERROR]:', error);
    return res.status(500).json({ error: 'Fehler beim Zurücksetzen des Pools', detail: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id/logs — Fetch player match logs, activity & game stats
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminUserLogs(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const user = await db('users').where({ id }).first();
    if (!user) {
      return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    }

    // 1. Fetch recent score logs (up to 150 most recent matches)
    const scoreLogs = await db('scores')
      .where({ user_id: id })
      .orderBy('created_at', 'desc')
      .limit(150);

    // 2. Aggregate per-game statistics
    const gameStatsRaw = await db('scores')
      .where({ user_id: id })
      .select('game_id')
      .count('* as total_plays')
      .max('score as high_score')
      .sum('score as total_score')
      .max('created_at as last_played')
      .groupBy('game_id')
      .orderBy('total_plays', 'desc');

    const gameStats = gameStatsRaw.map((g: any) => ({
      gameId: String(g.game_id || ''),
      totalPlays: Number(g.total_plays || 0),
      highScore: Number(g.high_score || 0),
      totalScore: Number(g.total_score || 0),
      lastPlayed: g.last_played,
    }));

    // 3. Overall player gameplay stats
    const totalRounds = scoreLogs.length > 0
      ? gameStats.reduce((acc, curr) => acc + curr.totalPlays, 0)
      : 0;
    const totalScore = scoreLogs.length > 0
      ? gameStats.reduce((acc, curr) => acc + curr.totalScore, 0)
      : 0;
    const highestScore = scoreLogs.length > 0
      ? Math.max(...gameStats.map((g) => g.highScore))
      : 0;

    // 4. Fetch recent AMM trades (up to 50)
    let trades: any[] = [];
    try {
      trades = await db('user_trades')
        .where({ user_id: id })
        .orderBy('created_at', 'desc')
        .limit(50);
    } catch {}

    // 5. Fetch shop orders (up to 50)
    let orders: any[] = [];
    try {
      orders = await db('shop_orders')
        .where({ user_id: id })
        .orderBy('created_at', 'desc')
        .limit(50);
    } catch {}

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        displayName: user.display_name,
        energyValue: user.energy_value,
        gameCash: user.game_cash,
        createdAt: user.created_at,
        walletLtc: user.wallet_ltc,
        walletBtc: user.wallet_btc,
      },
      stats: {
        totalRounds,
        totalScore,
        highestScore,
        uniqueGamesPlayed: gameStats.length,
      },
      gameStats,
      scores: scoreLogs.map((s: any) => ({
        id: s.id,
        gameId: s.game_id,
        score: Number(s.score || 0),
        validationPayload: s.validation_payload,
        createdAt: s.created_at,
      })),
      trades: trades.map((t: any) => ({
        id: t.id,
        coinSymbol: t.coin_symbol,
        tradeType: t.trade_type,
        amountTokens: Number(t.amount_tokens || 0),
        pricePerToken: Number(t.price_per_token || 0),
        totalCash: Number(t.total_cash || 0),
        gasFee: Number(t.gas_fee || 0),
        createdAt: t.created_at,
      })),
      orders: orders.map((o: any) => ({
        id: o.id,
        productId: o.product_id,
        amountEur: Number(o.amount_eur || 0),
        amountCrypto: o.amount_crypto ? Number(o.amount_crypto) : null,
        coin: o.coin,
        status: o.status,
        createdAt: o.created_at,
        paidAt: o.paid_at,
      })),
    });
  } catch (error: any) {
    console.error('[ADMIN USER LOGS ERROR]:', error);
    return res.status(500).json({ error: 'Fehler beim Laden der Spieler-Logs', detail: error.message });
  }
}
