import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { getGameLeaderboard, getRegisteredGamesList, LeaderboardTimeframe } from '../services/gameLeaderboardService';
import { getCurrentSeason, getSeasonProfitLeaderboard } from '../services/seasonService';
import { getTopScores } from '../services/redis';
import db from '../database/client';

/**
 * GET /api/leaderboard/games
 * Returns the list of registered minigames for dynamic client navigation
 */
export async function getGamesList(_req: Request, res: Response) {
  try {
    const games = await getRegisteredGamesList(true);
    return res.json({
      success: true,
      games,
    });
  } catch (error) {
    console.error('Error fetching games list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/leaderboard/game/:gameId
 * Returns the game-specific highscore leaderboard for a given timeframe (daily, weekly, monthly, all_time)
 */
export async function getGameLeaderboardHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const gameId = req.params.gameId || (req.query.gameId as string);
    if (!gameId) {
      return res.status(400).json({ error: 'gameId parameter is required' });
    }

    const timeframe = (req.query.timeframe as LeaderboardTimeframe) || 'daily';
    if (!['daily', 'weekly', 'monthly', 'all_time'].includes(timeframe)) {
      return res.status(400).json({
        error: 'Invalid timeframe parameter. Must be one of: daily, weekly, monthly, all_time.',
      });
    }

    const limit = parseInt(req.query.limit as string || '100', 10);
    const requestingUserId = req.telegramUser?.id;

    const result = await getGameLeaderboard(gameId, timeframe, limit, requestingUserId);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error fetching game leaderboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/leaderboard/season
 * Returns the seasonal economic profit leaderboard (active during official seasons)
 */
export async function getSeasonLeaderboardHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string || '100', 10);
    const parsedLimit = isNaN(limit) ? 100 : Math.min(100, Math.max(1, limit));
    const requestingUserId = req.telegramUser?.id;

    const seasonInfo = await getCurrentSeason();

    if (seasonInfo.status !== 'active') {
      return res.json({
        success: true,
        period: 'season',
        isSeasonActive: false,
        seasonInfo,
        count: 0,
        entries: [],
        userEntry: null,
        message: `Season ${seasonInfo.seasonNumber} ist noch nicht offiziell gestartet.`,
      });
    }

    const seasonEntries = await getSeasonProfitLeaderboard(seasonInfo.id, parsedLimit);

    // Find requesting user rank & profit
    let userEntry: any = null;
    if (requestingUserId && !requestingUserId.startsWith('guest_')) {
      const inTop = seasonEntries.find((e) => e.userId === requestingUserId);
      if (inTop) {
        userEntry = {
          rank: inTop.rank,
          netProfit: inTop.netProfit,
          totalRounds: inTop.totalRounds,
          estimatedTop10Prize: inTop.estimatedTop10Prize || 0,
          isRanked: true,
        };
      } else {
        const userStat = await db('season_user_stats')
          .where({ season_id: seasonInfo.id, user_id: requestingUserId })
          .first();

        if (userStat) {
          const userProfit = Number(userStat.net_profit || 0);
          const [betterCountRow] = await db('season_user_stats')
            .where('season_id', seasonInfo.id)
            .where('net_profit', '>', userProfit)
            .count('* as count');

          const exactRank = Number(betterCountRow?.count || 0) + 1;
          userEntry = {
            rank: exactRank,
            netProfit: userProfit,
            totalRounds: Number(userStat.total_rounds || 0),
            estimatedTop10Prize: 0,
            isRanked: true,
          };
        } else {
          userEntry = {
            rank: null,
            netProfit: 0,
            totalRounds: 0,
            estimatedTop10Prize: 0,
            isRanked: false,
          };
        }
      }
    }

    return res.json({
      success: true,
      period: 'season',
      isSeasonActive: true,
      seasonInfo,
      count: seasonEntries.length,
      entries: seasonEntries.map((e) => ({
        userId: e.userId,
        username: e.username,
        firstName: e.firstName,
        displayName: e.displayName,
        isVip: e.isVip,
        seasonPassType: e.seasonPassType,
        score: e.netProfit,
        netProfit: e.netProfit,
        totalRounds: e.totalRounds,
        estimatedTop10Prize: e.estimatedTop10Prize,
        rank: e.rank,
      })),
      userEntry,
    });
  } catch (error) {
    console.error('Error fetching season leaderboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/leaderboard (Backward compatibility wrapper)
 */
export async function getLeaderboard(req: AuthenticatedRequest, res: Response) {
  try {
    const period = req.query.period as 'day' | 'week' | 'month' | 'season';
    
    if (period === 'season') {
      return getSeasonLeaderboardHandler(req, res);
    }

    if (req.query.gameId) {
      const timeframeMap: Record<string, LeaderboardTimeframe> = {
        day: 'daily',
        week: 'weekly',
        month: 'monthly',
        all: 'all_time',
      };
      const tf = timeframeMap[period] || 'daily';
      req.query.timeframe = tf;
      return getGameLeaderboardHandler(req, res);
    }

    // Default legacy cash scores fallback
    const limit = parseInt(req.query.limit as string || '100', 10);
    const parsedLimit = isNaN(limit) ? 100 : Math.min(100, Math.max(1, limit));
    const periodKey = (period === 'week' ? 'week' : period === 'month' ? 'month' : 'day');
    const topScores = await getTopScores(periodKey, parsedLimit);

    return res.json({
      period: periodKey,
      count: topScores.length,
      entries: topScores,
    });
  } catch (error) {
    console.error('Error in getLeaderboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
