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
 * Clears all leaderboard keys in Redis and in-memory caches
 */
export async function resetLeaderboardCache(): Promise<void> {
  memoryLeaderboards.clear();
  if (redis) {
    try {
      const keys = await redis.keys('leaderboard:*');
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
      console.log('[REDIS LEADERBOARD]: Cleared all leaderboard sorted sets.');
    } catch (err) {
      console.error('[REDIS RESET ERROR]:', err);
    }
  }
}

/**
 * Returns period-based keys for leaderboards (day, week, month)
 */
export function getLeaderboardKeys(date: Date = new Date()): {
  day: string;
  week: string;
  month: string;
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

  return {
    day: `leaderboard:day:${year}-${month}-${dayStr}`,
    week: `leaderboard:week:${weekStr}`,
    month: `leaderboard:month:${year}-${month}`,
  };
}

/**
 * Submits earned InGame$ to the daily, weekly, and monthly leaderboards.
 * Updates Redis if present, otherwise updates the in-memory emulator.
 */
export async function submitScoreToLeaderboards(userId: string, earnedCash: number): Promise<void> {
  if (!earnedCash || isNaN(earnedCash) || earnedCash <= 0) return;
  const keys = getLeaderboardKeys();

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      for (const key of Object.values(keys)) {
        // Increment the member's earned InGame$ in the sorted set
        pipeline.zincrby(key, earnedCash, userId);
      }
      await pipeline.exec();
      return;
    } catch (err) {
      console.error('[REDIS LEADERBOARD ERROR]: failed to write earned InGame$, falling back to memory', err);
    }
  }

  // Memory fallback write
  for (const key of Object.values(keys)) {
    if (!memoryLeaderboards.has(key)) {
      memoryLeaderboards.set(key, new Map<string, number>());
    }
    const board = memoryLeaderboards.get(key)!;
    const existing = board.get(userId) || 0;
    board.set(userId, existing + earnedCash);
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

export async function getTopScores(period: 'day' | 'week' | 'month', limit: number = 100): Promise<LeaderboardEntry[]> {
  const keys = getLeaderboardKeys();
  const key = keys[period];

  // Standard periods: day, week, month
  let rawEntries: { userId: string; score: number }[] = [];

  if (redis) {
    try {
      const result = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
      for (let i = 0; i < result.length; i += 2) {
        rawEntries.push({
          userId: result[i],
          score: parseFloat(parseFloat(result[i + 1]).toFixed(4)),
        });
      }
    } catch (err) {
      console.error('[REDIS LEADERBOARD FETCH ERROR]:', err);
    }
  }

  if (rawEntries.length === 0 && memoryLeaderboards.has(key)) {
    const board = memoryLeaderboards.get(key)!;
    const sorted = Array.from(board.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
    
    rawEntries = sorted.map(([userId, score]) => ({
      userId,
      score: parseFloat(parseFloat(String(score)).toFixed(4)),
    }));
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

    return {
      userId: entry.userId,
      username: userDetail?.username || null,
      firstName: userDetail?.first_name || 'Anonymous',
      displayName: userDetail?.display_name || userDetail?.first_name || 'Anonymous',
      isVip: passType === 'VIP',
      seasonPassType: passType,
      score: entry.score,
      rank,
    };
  });
}
