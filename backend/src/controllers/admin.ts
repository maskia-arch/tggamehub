import { Request, Response } from 'express';
import db from '../database/client';
import { submitScoreToLeaderboards } from '../services/redis';
import { config } from '../config';
import * as crypto from 'crypto';



// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/stats  — main overview stats
// ─────────────────────────────────────────────────────────────────────────────
export async function getAdminStats(_req: Request, res: Response) {
  try {
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

