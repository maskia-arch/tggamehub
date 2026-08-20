import Redis from 'ioredis';
import { config } from '../config';
import db from '../database/client';

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
        // Automatic exponential backoff with max 3s delay for resilient auto-reconnect
        const delay = Math.min(times * 150, 3000);
        return delay;
      }
    });

    redis.on('connect', () => {
      console.log('[REDIS]: Connecting to Redis server...');
    });

    redis.on('ready', () => {
      isRedisConnected = true;
      console.log('[REDIS]: Connection established and ready.');
    });

    redis.on('reconnecting', () => {
      console.log('[REDIS]: Reconnecting to Redis...');
    });

    redis.on('close', () => {
      isRedisConnected = false;
    });

    redis.on('error', (err) => {
      isRedisConnected = false;
      console.warn('[REDIS ERROR]:', err.message);
    });
  } catch (error) {
    console.warn('[REDIS EXCEPTION]: Could not initialize Redis client, using in-memory emulator.', error);
  }
} else {
  console.log('[LEADERBOARD]: No REDIS_URL provided. Using in-memory leaderboard emulator.');
}

/**
 * Returns current Redis connection and health status
 */
export function getRedisStatus() {
  return {
    enabled: !!config.redisUrl,
    connected: isRedisConnected,
    mode: (redis && isRedisConnected) ? 'redis' : 'in-memory-fallback',
  };
}


// In-memory fallback database for leaderboards
const memoryLeaderboards = new Map<string, Map<string, number>>();

/**
 * Returns period-based keys for leaderboards
 */
export function getLeaderboardKeys(date: Date = new Date()): {
  day: string;
  week: string;
  month: string;
  season: string;
} {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayStr = String(date.getDate()).padStart(2, '0');

  // Calculate Monday of current week
  const dayOfWeek = date.getDay();
  const diffToMonday = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(date.getTime());
  monday.setDate(diffToMonday);
  const weekStr = `${monday.getFullYear()}-W${String(Math.ceil((monday.getDate() + 1) / 7))}`;

  // Season (3-month cycle)
  const season = Math.floor(date.getMonth() / 3) + 1;
  const seasonStr = `${year}-S${season}`;

  return {
    day: `leaderboard:day:${year}-${month}-${dayStr}`,
    week: `leaderboard:week:${weekStr}`,
    month: `leaderboard:month:${year}-${month}`,
    season: `leaderboard:season:${seasonStr}`,
  };
}

/**
 * Submits a validated score to the daily, weekly, monthly, and seasonal leaderboards.
 * Updates Redis if present, otherwise updates the in-memory emulator.
 */
export async function submitScoreToLeaderboards(userId: string, score: number): Promise<void> {
  const keys = getLeaderboardKeys();

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      for (const key of Object.values(keys)) {
        // Increment the member's score in the sorted set (cumulative sum scoring)
        pipeline.zincrby(key, score, userId);
      }
      await pipeline.exec();
      return;
    } catch (err) {
      console.error('[REDIS LEADERBOARD ERROR]: failed to write score, falling back to memory', err);
    }
  }

  // Memory fallback write (cumulative sum scoring)
  for (const key of Object.values(keys)) {
    if (!memoryLeaderboards.has(key)) {
      memoryLeaderboards.set(key, new Map<string, number>());
    }
    const board = memoryLeaderboards.get(key)!;
    const existing = board.get(userId) || 0;
    board.set(userId, existing + score);
  }
}

export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  displayName?: string | null;
  isVip?: boolean;
  seasonPassType?: 'NONE' | 'SEASON' | 'VIP';
  score: number;
  rank: number;
  expectedSeasonPoints?: number;
  permanentSeasonScore?: number;
}

// Purge mock data from database and Redis/Memory to ensure only real player data is displayed
export async function purgeMockData() {
  try {
    // Delete mock users from SQLite (cascades to scores)
    await db('users').whereIn('id', ['mock_user_1', 'mock_user_2', 'mock_user_3', 'mock_user_4', 'mock_user_5']).del();
    
    const keys = getLeaderboardKeys();
    const monthKey = keys.month;
    
    if (redis) {
      await redis.zrem(monthKey, 'mock_user_1', 'mock_user_2', 'mock_user_3', 'mock_user_4', 'mock_user_5');
      await redis.zrem('leaderboard:season:permanent', 'mock_user_1', 'mock_user_2', 'mock_user_3', 'mock_user_4', 'mock_user_5');
    }

    // Clean up memory fallback maps
    const monthBoard = memoryLeaderboards.get(monthKey);
    if (monthBoard) {
      monthBoard.delete('mock_user_1');
      monthBoard.delete('mock_user_2');
      monthBoard.delete('mock_user_3');
      monthBoard.delete('mock_user_4');
      monthBoard.delete('mock_user_5');
    }
    const permBoard = memoryLeaderboards.get('leaderboard:season:permanent');
    if (permBoard) {
      permBoard.delete('mock_user_1');
      permBoard.delete('mock_user_2');
      permBoard.delete('mock_user_3');
      permBoard.delete('mock_user_4');
      permBoard.delete('mock_user_5');
    }
    
    console.log('[LEADERBOARD]: Mock data purged successfully.');
  } catch (err) {
    console.error('[LEADERBOARD PURGE ERROR]:', err);
  }
}

// Trigger purge on start
setTimeout(() => {
  purgeMockData();
}, 500);

function calculateExpectedSeasonPoints(rank: number, totalPlayers: number): number {
  const P = totalPlayers <= 250 ? 100 : Math.round(totalPlayers * 0.4);
  if (rank <= P) {
    return P - rank + 1;
  }
  return 0;
}

export async function getTopScores(period: 'day' | 'week' | 'month' | 'season', limit: number = 100): Promise<LeaderboardEntry[]> {
  
  const keys = getLeaderboardKeys();
  const key = keys[period];
  
  if (period === 'season') {
    // Custom Season Leaderboard: Permanent Season Score + Live Expected Month Season Points
    const monthKey = keys.month;
    let monthList: { userId: string; score: number }[] = [];
    let permList: { userId: string; score: number }[] = [];

    // 1. Fetch Month list
    if (redis) {
      try {
        const res = await redis.zrevrange(monthKey, 0, -1, 'WITHSCORES');
        for (let i = 0; i < res.length; i += 2) {
          monthList.push({ userId: res[i], score: parseInt(res[i + 1], 10) });
        }
      } catch (err) {
        console.error('[REDIS MONTH FETCH ERROR]:', err);
      }
    }
    if (monthList.length === 0 && memoryLeaderboards.has(monthKey)) {
      const board = memoryLeaderboards.get(monthKey)!;
      monthList = Array.from(board.entries()).map(([userId, score]) => ({ userId, score }));
    }

    // 2. Fetch Permanent Season list
    if (redis) {
      try {
        const res = await redis.zrevrange('leaderboard:season:permanent', 0, -1, 'WITHSCORES');
        for (let i = 0; i < res.length; i += 2) {
          permList.push({ userId: res[i], score: parseInt(res[i + 1], 10) });
        }
      } catch (err) {
        console.error('[REDIS PERM FETCH ERROR]:', err);
      }
    }
    if (permList.length === 0 && memoryLeaderboards.has('leaderboard:season:permanent')) {
      const board = memoryLeaderboards.get('leaderboard:season:permanent')!;
      permList = Array.from(board.entries()).map(([userId, score]) => ({ userId, score }));
    }

    // 3. Merge & calculate total scores
    const monthRankMap = new Map<string, number>();
    monthList.sort((a, b) => b.score - a.score).forEach((e, idx) => {
      monthRankMap.set(e.userId, idx + 1);
    });

    const totalMonthPlayers = monthList.length;

    const userCombinedScores = new Map<string, { permScore: number; expPoints: number; totalSeason: number }>();
    const allUserIds = new Set([...monthList.map((m) => m.userId), ...permList.map((p) => p.userId)]);

    const permMap = new Map(permList.map((p) => [p.userId, p.score]));

    allUserIds.forEach((uId) => {
      const permScore = permMap.get(uId) || 0;
      const mRank = monthRankMap.get(uId);
      const expPoints = mRank ? calculateExpectedSeasonPoints(mRank, totalMonthPlayers) : 0;
      userCombinedScores.set(uId, {
        permScore,
        expPoints,
        totalSeason: permScore + expPoints,
      });
    });

    const finalSeasonList = Array.from(userCombinedScores.entries())
      .map(([uId, data]) => ({
        userId: uId,
        score: data.totalSeason,
        expectedSeasonPoints: data.expPoints,
        permanentSeasonScore: data.permScore,
      }))
      .sort((a, b) => b.score - a.score);

    // Apply limit
    const slicedList = finalSeasonList.slice(0, limit);

    if (slicedList.length === 0) return [];

    // Fetch user details
    const userIds = slicedList.map((e) => e.userId);
    const users = await db('users').whereIn('id', userIds).select('id', 'username', 'first_name', 'display_name', 'season_pass_type');
    const userMap = new Map(users.map((u) => [u.id, u]));

    return slicedList.map((entry, index) => {
      const userDetail = userMap.get(entry.userId);
      const passType = userDetail?.season_pass_type || 'NONE';
      return {
        userId: entry.userId,
        username: userDetail?.username || null,
        firstName: userDetail?.first_name || 'Anonymous',
        displayName: userDetail?.display_name || userDetail?.first_name || 'Anonymous',
        isVip: passType === 'VIP',
        seasonPassType: passType,
        score: entry.score,
        rank: index + 1,
        expectedSeasonPoints: entry.expectedSeasonPoints,
        permanentSeasonScore: entry.permanentSeasonScore,
      };
    });
  }

  // Fallback / standard periods: day, week, month
  let rawEntries: { userId: string; score: number }[] = [];
  let totalPlayers = 0;

  if (redis) {
    try {
      totalPlayers = await redis.zcard(key);
      const result = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
      for (let i = 0; i < result.length; i += 2) {
        rawEntries.push({
          userId: result[i],
          score: parseInt(result[i + 1], 10),
        });
      }
    } catch (err) {
      console.error('[REDIS LEADERBOARD FETCH ERROR]:', err);
    }
  }

  if (rawEntries.length === 0 && memoryLeaderboards.has(key)) {
    const board = memoryLeaderboards.get(key)!;
    totalPlayers = board.size;
    const sorted = Array.from(board.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    
    rawEntries = sorted.map(([userId, score]) => ({ userId, score }));
  }

  if (rawEntries.length === 0) {
    return [];
  }

  const userIds = rawEntries.map((e) => e.userId);
  const users = await db('users').whereIn('id', userIds).select('id', 'username', 'first_name', 'display_name', 'season_pass_type');
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rawEntries.map((entry, index) => {
    const userDetail = userMap.get(entry.userId);
    const rank = index + 1;
    const passType = userDetail?.season_pass_type || 'NONE';
    let expectedPoints: number | undefined;

    if (period === 'month') {
      expectedPoints = calculateExpectedSeasonPoints(rank, totalPlayers);
    }

    return {
      userId: entry.userId,
      username: userDetail?.username || null,
      firstName: userDetail?.first_name || 'Anonymous',
      displayName: userDetail?.display_name || userDetail?.first_name || 'Anonymous',
      isVip: passType === 'VIP',
      seasonPassType: passType,
      score: entry.score,
      rank,
      expectedSeasonPoints: expectedPoints,
    };
  });
}
