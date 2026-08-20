import db from '../database/client';

export interface SeasonInfo {
  id: number;
  seasonNumber: number;
  name: string;
  status: 'preparing' | 'active' | 'ended' | 'settled';
  targetAmount: number;
  currentPot: number;
  revenueSharePercent: number;
  startDate: string | null;
  endDate: string | null;
  durationDays: number;
  top10SharePercent: number;
  active20SharePercent: number;
  randomSharePercent: number;
  daysLeft: number;
  progressPercent: number;
  isGoalReached: boolean;
  totalParticipants: number;
}

export interface SeasonLeaderboardEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName: string | null;
  netProfit: number;
  totalRounds: number;
  rank: number;
  estimatedTop10Prize?: number;
}

export interface ActivePlayerEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName: string | null;
  totalRounds: number;
  netProfit: number;
  rank: number;
  estimatedActivePrize?: number;
}

export interface AirdropPreview {
  totalPot: number;
  top10Pool: number;
  active20Pool: number;
  randomPool: number;
  top10Winners: Array<{ user: any; netProfit: number; prizeEur: number }>;
  active20Winners: Array<{ user: any; totalRounds: number; prizeEur: number }>;
  randomWinners: Array<{ user: any; prizeEur: number }>;
}

/**
 * Gets or initializes the latest season (Season 0 by default)
 */
export async function getCurrentSeason(): Promise<SeasonInfo> {
  let season = await db('seasons').orderBy('id', 'desc').first();

  if (!season) {
    const nowStr = new Date().toISOString();
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
      start_date: nowStr,
      end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      created_at: nowStr,
      updated_at: nowStr,
    });
    season = await db('seasons').orderBy('id', 'desc').first();
  }

  const currentPot = parseFloat(String(season.current_pot || 0));
  const targetAmount = parseFloat(String(season.target_amount || 1000));
  const progressPercent = Math.min(100, Math.round((currentPot / Math.max(1, targetAmount)) * 100));
  const isGoalReached = currentPot >= targetAmount;

  let daysLeft = 0;
  if (season.status === 'active' && season.end_date) {
    const end = new Date(season.end_date).getTime();
    const now = Date.now();
    daysLeft = Math.max(0, Math.ceil((end - now) / (24 * 3600 * 1000)));
  }

  // Count participants for this season
  const [participantCountRow] = await db('season_user_stats')
    .where('season_id', season.id)
    .count('* as count');
  const totalParticipants = Number(participantCountRow?.count || 0);

  return {
    id: season.id,
    seasonNumber: season.season_number ?? 0,
    name: season.name,
    status: season.status || (season.is_active ? 'active' : 'preparing'),
    targetAmount,
    currentPot,
    revenueSharePercent: parseFloat(String(season.revenue_share_percent || 30)),
    startDate: season.start_date ? new Date(season.start_date).toISOString() : null,
    endDate: season.end_date ? new Date(season.end_date).toISOString() : null,
    durationDays: season.duration_days || 30,
    top10SharePercent: parseFloat(String(season.top10_share_percent || 60)),
    active20SharePercent: parseFloat(String(season.active20_share_percent || 20)),
    randomSharePercent: parseFloat(String(season.random_share_percent || 20)),
    daysLeft,
    progressPercent,
    isGoalReached,
    totalParticipants,
  };
}

/**
 * Records 30% shop revenue contribution into the active or preparing season pot.
 */
export async function recordShopRevenueContribution(amountEur: number) {
  if (amountEur <= 0) return;
  const season = await getCurrentSeason();
  const shareRate = season.revenueSharePercent / 100;
  const potAddition = Math.round((amountEur * shareRate) * 100) / 100;

  if (potAddition > 0) {
    const newPot = season.currentPot + potAddition;
    await db('seasons')
      .where({ id: season.id })
      .update({
        current_pot: newPot,
        updated_at: new Date().toISOString(),
      });
    console.log(`[Season Pot]: +${potAddition.toFixed(2)} € added to ${season.name} Pot (Total: ${newPot.toFixed(2)} € / Goal: ${season.targetAmount} €)`);
  }
}

/**
 * Records game activity and cash rewards for a player during active season.
 */
export async function recordUserGameActivity(userId: string, earnedCash: number) {
  const season = await getCurrentSeason();
  if (season.status !== 'active') return;

  const existing = await db('season_user_stats')
    .where({ season_id: season.id, user_id: userId })
    .first();

  if (existing) {
    await db('season_user_stats')
      .where({ id: existing.id })
      .update({
        total_rounds: Number(existing.total_rounds || 0) + 1,
        net_profit: parseFloat(String(existing.net_profit || 0)) + Math.max(0, earnedCash),
        updated_at: new Date().toISOString(),
      });
  } else {
    await db('season_user_stats').insert({
      season_id: season.id,
      user_id: userId,
      total_rounds: 1,
      net_profit: Math.max(0, earnedCash),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * Records market trading net profit for a player during active season.
 */
export async function recordUserMarketProfit(userId: string, netProfit: number) {
  if (netProfit <= 0) return;
  const season = await getCurrentSeason();
  if (season.status !== 'active') return;

  const existing = await db('season_user_stats')
    .where({ season_id: season.id, user_id: userId })
    .first();

  if (existing) {
    await db('season_user_stats')
      .where({ id: existing.id })
      .update({
        net_profit: parseFloat(String(existing.net_profit || 0)) + netProfit,
        updated_at: new Date().toISOString(),
      });
  } else {
    await db('season_user_stats').insert({
      season_id: season.id,
      user_id: userId,
      total_rounds: 0,
      net_profit: netProfit,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * Gets Season Leaderboard (sorted strictly by Net Profit DESC)
 */
export async function getSeasonProfitLeaderboard(seasonId?: number, limit = 100): Promise<SeasonLeaderboardEntry[]> {
  const targetSeasonId = seasonId || (await getCurrentSeason()).id;

  const rows = await db('season_user_stats')
    .join('users', 'season_user_stats.user_id', 'users.id')
    .where('season_user_stats.season_id', targetSeasonId)
    .select(
      'season_user_stats.user_id',
      'season_user_stats.net_profit',
      'season_user_stats.total_rounds',
      'users.username',
      'users.first_name',
      'users.display_name'
    )
    .orderBy('season_user_stats.net_profit', 'desc')
    .limit(limit);

  return rows.map((r, index) => ({
    userId: r.user_id,
    username: r.username,
    firstName: r.first_name,
    displayName: r.display_name,
    netProfit: parseFloat(parseFloat(String(r.net_profit || 0)).toFixed(4)),
    totalRounds: Number(r.total_rounds || 0),
    rank: index + 1,
  }));
}

/**
 * Gets Top Active Players (sorted strictly by total_rounds DESC)
 */
export async function getSeasonActivePlayers(seasonId?: number, limit = 20): Promise<ActivePlayerEntry[]> {
  const targetSeasonId = seasonId || (await getCurrentSeason()).id;

  const rows = await db('season_user_stats')
    .join('users', 'season_user_stats.user_id', 'users.id')
    .where('season_user_stats.season_id', targetSeasonId)
    .where('season_user_stats.total_rounds', '>', 0)
    .select(
      'season_user_stats.user_id',
      'season_user_stats.net_profit',
      'season_user_stats.total_rounds',
      'users.username',
      'users.first_name',
      'users.display_name'
    )
    .orderBy('season_user_stats.total_rounds', 'desc')
    .limit(limit);

  return rows.map((r, index) => ({
    userId: r.user_id,
    username: r.username,
    firstName: r.first_name,
    displayName: r.display_name,
    totalRounds: Number(r.total_rounds || 0),
    netProfit: parseFloat(parseFloat(String(r.net_profit || 0)).toFixed(4)),
    rank: index + 1,
  }));
}

/**
 * Officially starts the season for 30 days
 */
export async function startOfficialSeason(seasonId?: number) {
  const season = await getCurrentSeason();
  const idToStart = seasonId || season.id;

  const now = new Date();
  const startDate = now.toISOString();
  const endDate = new Date(now.getTime() + (season.durationDays || 30) * 24 * 3600 * 1000).toISOString();

  await db('seasons')
    .where({ id: idToStart })
    .update({
      status: 'active',
      is_active: true,
      start_date: startDate,
      end_date: endDate,
      started_at: startDate,
      updated_at: startDate,
    });

  console.log(`[Season Engine]: ${season.name} officially started! Duration: ${season.durationDays} days (ends ${endDate})`);
  return await getCurrentSeason();
}

/**
 * Generates a preview of Airdrop distribution
 */
export async function getAirdropPreview(seasonId?: number): Promise<AirdropPreview> {
  const season = await getCurrentSeason();
  const targetId = seasonId || season.id;
  const pot = season.currentPot;

  const top10Pool = Math.round(pot * (season.top10SharePercent / 100) * 100) / 100;
  const active20Pool = Math.round(pot * (season.active20SharePercent / 100) * 100) / 100;
  const randomPool = Math.round(pot * (season.randomSharePercent / 100) * 100) / 100;

  // Top 10 profit winners
  const top10Ranked = await getSeasonProfitLeaderboard(targetId, 10);

  // Top 10 payout distribution weights (60% pool split: #1 gets 30%, #2 gets 20%, #3 gets 15%, #4-10 split remaining 35%)
  const top10Weights = [0.30, 0.20, 0.15, 0.07, 0.06, 0.06, 0.04, 0.04, 0.04, 0.04];
  const top10Winners = top10Ranked.map((player, idx) => {
    const weight = top10Weights[idx] || (1 / top10Ranked.length);
    const prizeEur = Math.round(top10Pool * weight * 100) / 100;
    return { user: player, netProfit: player.netProfit, prizeEur };
  });

  // Top 20 active players (equal split of 20% pool)
  const active20Ranked = await getSeasonActivePlayers(targetId, 20);
  const activePrizePerUser = active20Ranked.length > 0
    ? Math.round((active20Pool / active20Ranked.length) * 100) / 100
    : 0;
  const active20Winners = active20Ranked.map((player) => ({
    user: player,
    totalRounds: player.totalRounds,
    prizeEur: activePrizePerUser,
  }));

  // All participants for random draw
  const allParticipants = await db('season_user_stats')
    .join('users', 'season_user_stats.user_id', 'users.id')
    .where('season_user_stats.season_id', targetId)
    .select('users.id', 'users.username', 'users.first_name', 'users.display_name');

  // Randomly select up to 10 lucky winners (or split among up to 10 participants)
  const shuffled = [...allParticipants].sort(() => 0.5 - Math.random());
  const randomSelected = shuffled.slice(0, Math.min(10, shuffled.length));
  const randomPrizePerUser = randomSelected.length > 0
    ? Math.round((randomPool / randomSelected.length) * 100) / 100
    : 0;

  const randomWinners = randomSelected.map((u) => ({
    user: {
      userId: u.id,
      username: u.username,
      firstName: u.first_name,
      displayName: u.display_name,
    },
    prizeEur: randomPrizePerUser,
  }));

  return {
    totalPot: pot,
    top10Pool,
    active20Pool,
    randomPool,
    top10Winners,
    active20Winners,
    randomWinners,
  };
}

import { getCoinEurRate } from './rates';

/**
 * Settles current season, payouts Airdrop log entries, and starts next season in preparing state
 */
export async function settleAndFinalizeSeason(seasonId?: number) {
  const currentSeason = await getCurrentSeason();
  const targetId = seasonId || currentSeason.id;

  const preview = await getAirdropPreview(targetId);
  const nowIso = new Date().toISOString();
  const ltcRate = await getCoinEurRate('LTC');

  const processWinner = async (userId: string, category: string, rank: number | null, prizeEur: number) => {
    if (prizeEur <= 0) return;
    const user = await db('users').where({ id: userId }).first();
    const walletAddress = user?.wallet_ltc || null;
    const coin = 'LTC';
    const rate = ltcRate;
    const amountCrypto = rate > 0 ? parseFloat((prizeEur / rate).toFixed(8)) : 0;

    await db('airdrop_payouts').insert({
      season_id: targetId,
      user_id: userId,
      category,
      rank,
      amount_eur: prizeEur,
      amount_crypto: amountCrypto,
      coin,
      wallet_address: walletAddress,
      status: 'pending',
      tx_hash: null,
      created_at: nowIso,
      paid_at: null,
    });
  };

  // Log airdrop payouts as pending for wallet confirmation
  for (const item of preview.top10Winners) {
    await processWinner(item.user.userId, 'top10', item.user.rank, item.prizeEur);
  }

  for (const item of preview.active20Winners) {
    await processWinner(item.user.userId, 'active20', item.user.rank, item.prizeEur);
  }

  for (const item of preview.randomWinners) {
    await processWinner(item.user.userId, 'random', null, item.prizeEur);
  }

  // Mark current season as settled
  await db('seasons').where({ id: targetId }).update({
    status: 'settled',
    is_active: false,
    settled_at: nowIso,
    updated_at: nowIso,
  });

  // Create next season (Season N + 1) in 'preparing' state
  const nextSeasonNumber = currentSeason.seasonNumber + 1;
  await db('seasons').insert({
    season_number: nextSeasonNumber,
    name: `Season ${nextSeasonNumber}`,
    status: 'preparing',
    target_amount: currentSeason.targetAmount || 1000.00,
    current_pot: 0.00,
    revenue_share_percent: currentSeason.revenueSharePercent || 30.00,
    duration_days: 30,
    top10_share_percent: 60.00,
    active20_share_percent: 20.00,
    random_share_percent: 20.00,
    is_active: false,
    start_date: nowIso,
    end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    created_at: nowIso,
    updated_at: nowIso,
  });

  const createdSeason = await db('seasons').orderBy('id', 'desc').first();
  const newId = createdSeason?.id;

  console.log(`[Season Engine]: Season ${currentSeason.seasonNumber} settled! Airdrops recorded. Created Season ${nextSeasonNumber} (ID: ${newId}).`);
  return { success: true, oldSeasonId: targetId, newSeasonId: newId, preview };
}
