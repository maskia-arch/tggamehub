import Redis from 'ioredis';
import { config } from '../config';
import db from '../database/client';
import { getRegisteredGame, getDynamicGame, getDynamicGamesList, HubGameConfig } from '../config/games';

let isRedisConnected = false;
let redis: Redis | null = null;

if (config.redisUrl) {
  try {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 5000,
      retryStrategy(times) {
        return Math.min(times * 150, 3000);
      },
    });

    redis.on('ready', () => {
      isRedisConnected = true;
    });

    redis.on('close', () => {
      isRedisConnected = false;
    });

    redis.on('error', () => {
      isRedisConnected = false;
    });
  } catch (error) {
    console.warn('[GAME LEADERBOARD]: Redis initialization failed, using in-memory emulator.');
  }
}

// In-Memory emulator for local dev or if Redis is offline
const memoryGameLeaderboards = new Map<string, Map<string, number>>();

export type LeaderboardTimeframe = 'daily' | 'weekly' | 'monthly' | 'all_time';

export interface GameHighscoreEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName: string | null;
  avatarId?: string;
  isVip: boolean;
  seasonPassType: 'NONE' | 'SEASON' | 'VIP';
  highscore: number;
  achievedAt?: string | null;
  rank: number;
}

export interface UserPersonalHighscore {
  rank: number | null;
  highscore: number;
  achievedAt: string | null;
  isRanked: boolean;
}

export interface GameLeaderboardResponse {
  game: HubGameConfig;
  timeframe: LeaderboardTimeframe;
  totalParticipants: number;
  entries: GameHighscoreEntry[];
  userEntry: UserPersonalHighscore | null;
}

/**
 * Returns date range start timestamp for a given timeframe
 */
export function getTimeframeStartDate(timeframe: LeaderboardTimeframe, now: Date = new Date()): Date | null {
  const date = new Date(now.getTime());
  if (timeframe === 'all_time') {
    return null; // No date filter
  }

  if (timeframe === 'daily') {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  if (timeframe === 'weekly') {
    const dayOfWeek = date.getDay();
    const diffToMonday = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    date.setDate(diffToMonday);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  if (timeframe === 'monthly') {
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  return null;
}

/**
 * Generates Redis cache key and expiration TTL in seconds
 */
export function getRedisGameKey(
  gameId: string,
  timeframe: LeaderboardTimeframe,
  now: Date = new Date()
): { key: string; ttlSeconds: number } {
  const gId = gameId.toLowerCase();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dayStr = String(now.getDate()).padStart(2, '0');

  if (timeframe === 'daily') {
    return {
      key: `lb:game:${gId}:daily:${year}-${month}-${dayStr}`,
      ttlSeconds: 2 * 24 * 3600, // 48h
    };
  }

  if (timeframe === 'weekly') {
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(now.getTime());
    monday.setDate(diffToMonday);
    const weekStr = `${monday.getFullYear()}-W${String(Math.ceil((monday.getDate() + 1) / 7))}`;
    return {
      key: `lb:game:${gId}:weekly:${weekStr}`,
      ttlSeconds: 14 * 24 * 3600, // 14 days
    };
  }

  if (timeframe === 'monthly') {
    return {
      key: `lb:game:${gId}:monthly:${year}-${month}`,
      ttlSeconds: 60 * 24 * 3600, // 60 days
    };
  }

  return {
    key: `lb:game:${gId}:all_time`,
    ttlSeconds: 0, // No expiration
  };
}

/**
 * Records a game score for a user across all 4 timeframes (Daily, Weekly, Monthly, All-Time).
 * Updates Redis / Memory if score is higher than current highscore.
 */
export async function recordGameHighscore(userId: string, gameId: string, score: number): Promise<void> {
  if (!userId || userId.startsWith('guest_') || isNaN(score) || score <= 0) return;

  const timeframes: LeaderboardTimeframe[] = ['daily', 'weekly', 'monthly', 'all_time'];
  const now = new Date();

  for (const tf of timeframes) {
    const { key, ttlSeconds } = getRedisGameKey(gameId, tf, now);

    if (redis && isRedisConnected) {
      try {
        // Fetch current stored highscore in Redis
        const currentScoreStr = await redis.zscore(key, userId);
        const currentScore = currentScoreStr !== null ? parseFloat(currentScoreStr) : -1;

        if (score > currentScore) {
          await redis.zadd(key, score, userId);
          if (ttlSeconds > 0 && currentScoreStr === null) {
            await redis.expire(key, ttlSeconds);
          }
        }
      } catch (err) {
        console.warn(`[GAME LEADERBOARD REDIS ERR] key=${key}:`, err);
      }
    }

    // In-memory fallback
    if (!memoryGameLeaderboards.has(key)) {
      memoryGameLeaderboards.set(key, new Map<string, number>());
    }
    const map = memoryGameLeaderboards.get(key)!;
    const existing = map.get(userId) || 0;
    if (score > existing) {
      map.set(userId, score);
    }
  }
}

/**
 * Retrieves the highscore leaderboard for a specific game and timeframe.
 * Includes personal rank & highscore for the requesting user.
 */
export async function getGameLeaderboard(
  gameId: string,
  timeframe: LeaderboardTimeframe = 'daily',
  limit: number = 100,
  requestingUserId?: string
): Promise<GameLeaderboardResponse> {
  const gameConfig: HubGameConfig = (await getDynamicGame(gameId)) || getRegisteredGame(gameId) || {
    id: gameId,
    title: gameId.toUpperCase(),
    genre: 'Arcade',
    icon: '🎮',
    path: `/games/${gameId}/index.html`,
    scoreUnit: 'pts',
    targetScore: 100,
    coinSymbol: gameId.toUpperCase(),
    status: 'active',
  };

  const parsedLimit = Math.min(100, Math.max(1, limit));
  const { key, ttlSeconds } = getRedisGameKey(gameId, timeframe);

  let rawEntries: { userId: string; score: number }[] = [];

  // 1. Try Redis cache
  if (redis && isRedisConnected) {
    try {
      const zResult = await redis.zrevrange(key, 0, parsedLimit - 1, 'WITHSCORES');
      if (zResult && zResult.length > 0) {
        for (let i = 0; i < zResult.length; i += 2) {
          rawEntries.push({
            userId: zResult[i],
            score: parseInt(zResult[i + 1], 10),
          });
        }
      }
    } catch (err) {
      console.warn(`[REDIS FETCH ERROR] key=${key}:`, err);
    }
  }

  // 2. Try In-Memory emulator
  if (rawEntries.length === 0 && memoryGameLeaderboards.has(key)) {
    const map = memoryGameLeaderboards.get(key)!;
    const sorted = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, parsedLimit);
    rawEntries = sorted.map(([uId, sc]) => ({ userId: uId, score: sc }));
  }

  // 3. Fallback: Aggregate from persistent SQL database (scores table)
  if (rawEntries.length === 0) {
    const startDate = getTimeframeStartDate(timeframe);

    let query = db('scores')
      .where('game_id', gameId)
      .whereNot('user_id', 'like', 'guest_%')
      .groupBy('user_id')
      .select('user_id')
      .max('score as highscore')
      .orderBy('highscore', 'desc')
      .limit(parsedLimit);

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }

    const sqlRows = await query;
    if (sqlRows && sqlRows.length > 0) {
      rawEntries = sqlRows.map((r: any) => ({
        userId: r.user_id,
        score: parseInt(r.highscore, 10),
      }));

      // Backfill Redis cache
      if (redis && isRedisConnected) {
        try {
          const pipeline = redis.pipeline();
          for (const row of rawEntries) {
            pipeline.zadd(key, row.score, row.userId);
          }
          if (ttlSeconds > 0) {
            pipeline.expire(key, ttlSeconds);
          }
          await pipeline.exec();
        } catch (e) {}
      }

      // Backfill memory map
      if (!memoryGameLeaderboards.has(key)) {
        memoryGameLeaderboards.set(key, new Map<string, number>());
      }
      const map = memoryGameLeaderboards.get(key)!;
      for (const row of rawEntries) {
        map.set(row.userId, row.score);
      }
    }
  }

  // Fetch user profiles & achieve timestamps
  const userIds = rawEntries.map((e) => e.userId);
  const users = userIds.length > 0
    ? await db('users')
        .whereIn('id', userIds)
        .select('id', 'username', 'first_name', 'display_name', 'season_pass_type', 'avatar_id')
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Fetch timestamp of when the exact highscore was first achieved for each top entry
  const startDate = getTimeframeStartDate(timeframe);
  const dateMap = new Map<string, string>();

  if (rawEntries.length > 0) {
    let scoreMatchesQuery = db('scores')
      .where('game_id', gameId)
      .where((builder) => {
        for (const entry of rawEntries) {
          builder.orWhere(function () {
            this.where('user_id', entry.userId).andWhere('score', entry.score);
          });
        }
      })
      .select('user_id', 'score', 'created_at')
      .orderBy('created_at', 'asc');

    if (startDate) {
      scoreMatchesQuery = scoreMatchesQuery.where('created_at', '>=', startDate);
    }

    const matchingScoreRows = await scoreMatchesQuery;
    for (const r of matchingScoreRows) {
      // First occurrence is the earliest time the highscore was achieved
      if (!dateMap.has(r.user_id)) {
        dateMap.set(r.user_id, r.created_at);
      }
    }

    // Safety fallback for any entry not matched exactly
    for (const entry of rawEntries) {
      if (!dateMap.has(entry.userId)) {
        let fallbackQuery = db('scores')
          .where({
            game_id: gameId,
            user_id: entry.userId,
          })
          .orderBy('score', 'desc')
          .orderBy('created_at', 'asc')
          .first();

        if (startDate) {
          fallbackQuery = fallbackQuery.where('created_at', '>=', startDate);
        }

        const fallbackRow = await fallbackQuery;
        if (fallbackRow?.created_at) {
          dateMap.set(entry.userId, fallbackRow.created_at);
        }
      }
    }
  }

  const entries: GameHighscoreEntry[] = rawEntries.map((entry, index) => {
    const userDetail = userMap.get(entry.userId);
    const passType = userDetail?.season_pass_type || 'NONE';
    const achievedAt = dateMap.get(entry.userId) || null;

    return {
      userId: entry.userId,
      username: userDetail?.username || null,
      firstName: userDetail?.first_name || 'Spieler',
      displayName: userDetail?.display_name || userDetail?.first_name || 'Spieler',
      avatarId: userDetail?.avatar_id || 'avatar_1',
      isVip: passType === 'VIP',
      seasonPassType: passType,
      highscore: entry.score,
      achievedAt: achievedAt ? new Date(achievedAt).toISOString() : null,
      rank: index + 1,
    };
  });

  // Calculate requesting user's personal rank & highscore
  let userEntry: UserPersonalHighscore | null = null;
  if (requestingUserId && !requestingUserId.startsWith('guest_')) {
    // Check if user is in top entries
    const foundInTop = entries.find((e) => e.userId === requestingUserId);
    if (foundInTop) {
      userEntry = {
        rank: foundInTop.rank,
        highscore: foundInTop.highscore,
        achievedAt: foundInTop.achievedAt || null,
        isRanked: true,
      };
    } else {
      // Find from SQL
      let userScoreQuery = db('scores')
        .where('game_id', gameId)
        .where('user_id', requestingUserId)
        .max('score as highscore')
        .first();

      if (startDate) {
        userScoreQuery = userScoreQuery.where('created_at', '>=', startDate);
      }

      const userRow = await userScoreQuery;
      const userHighscore = userRow?.highscore ? parseInt(userRow.highscore, 10) : 0;

      if (userHighscore > 0) {
        // Calculate exact rank by counting distinct users with higher score
        let countBetterQuery = db('scores')
          .where('game_id', gameId)
          .whereNot('user_id', requestingUserId)
          .whereNot('user_id', 'like', 'guest_%')
          .groupBy('user_id')
          .having(db.raw('MAX(score) > ?', [userHighscore]));

        if (startDate) {
          countBetterQuery = countBetterQuery.where('created_at', '>=', startDate);
        }

        const betterUsers = await countBetterQuery.select('user_id');
        const exactRank = (betterUsers?.length || 0) + 1;

        // Query the earliest timestamp when this exact highscore was achieved
        let userDateQuery = db('scores')
          .where({
            game_id: gameId,
            user_id: requestingUserId,
            score: userHighscore,
          })
          .orderBy('created_at', 'asc')
          .first();

        if (startDate) {
          userDateQuery = userDateQuery.where('created_at', '>=', startDate);
        }

        const userDateRow = await userDateQuery;

        userEntry = {
          rank: exactRank,
          highscore: userHighscore,
          achievedAt: userDateRow?.created_at ? new Date(userDateRow.created_at).toISOString() : null,
          isRanked: true,
        };
      } else {
        userEntry = {
          rank: null,
          highscore: 0,
          achievedAt: null,
          isRanked: false,
        };
      }
    }
  }

  // Count total distinct participants
  let totalParticipants = entries.length;
  try {
    let countQuery = db('scores')
      .where('game_id', gameId)
      .whereNot('user_id', 'like', 'guest_%');
    if (startDate) {
      countQuery = countQuery.where('created_at', '>=', startDate);
    }
    const [partRow] = await countQuery.countDistinct('user_id as count');
    totalParticipants = Number(partRow?.count || entries.length);
  } catch (e) {}

  return {
    game: gameConfig,
    timeframe,
    totalParticipants,
    entries,
    userEntry,
  };
}

/**
 * Returns registered active hub games for dynamic UI rendering
 */
export async function getRegisteredGamesList(onlyActive: boolean = true): Promise<HubGameConfig[]> {
  const all = await getDynamicGamesList();
  return onlyActive ? all.filter((g) => g.status === 'active') : all;
}

/**
 * Completely resets all scores, highscores, and cached leaderboards for a given game ID
 */
export async function resetGameLeaderboardAndScores(gameId: string): Promise<{ deletedScores: number }> {
  const gId = gameId.toLowerCase();

  // 1. Delete all database scores
  let deleted = 0;
  try {
    const hasScoresTable = await db.schema.hasTable('scores');
    if (hasScoresTable) {
      deleted = await db('scores').where({ game_id: gId }).del();
    }
  } catch (err) {
    console.warn('[RESET GAME SCORES] DB score deletion note:', err);
  }

  // 2. Clear Redis cached keys
  if (redis && isRedisConnected) {
    try {
      const keys = await redis.keys(`*${gId}*`);
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (e) {
      console.warn('[RESET GAME SCORES] Redis key deletion note:', e);
    }
  }

  // 3. Clear In-Memory Emulator Map
  for (const key of Array.from(memoryGameLeaderboards.keys())) {
    if (key.toLowerCase().includes(gId)) {
      memoryGameLeaderboards.delete(key);
    }
  }

  console.log(`[LEADERBOARD RESET]: Completely wiped ${deleted} scores and reset all leaderboards for ${gId}.`);
  return { deletedScores: deleted };
}

