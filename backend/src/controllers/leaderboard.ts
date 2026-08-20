import { Request, Response } from 'express';
import { getTopScores } from '../services/redis';
import { getCurrentSeason, getSeasonProfitLeaderboard } from '../services/seasonService';

/**
 * Retrieves the leaderboard list for a specified period (day, week, month, season)
 */
export async function getLeaderboard(req: Request, res: Response) {
  try {
    const period = req.query.period as 'day' | 'week' | 'month' | 'season';
    
    if (!period || !['day', 'week', 'month', 'season'].includes(period)) {
      return res.status(400).json({ 
        error: 'Invalid period parameter. Must be one of: day, week, month, season.' 
      });
    }

    const limit = parseInt(req.query.limit as string || '100', 10);
    const parsedLimit = isNaN(limit) ? 100 : Math.min(100, Math.max(1, limit));

    if (period === 'season') {
      const seasonInfo = await getCurrentSeason();
      if (seasonInfo.status !== 'active') {
        return res.json({
          period: 'season',
          isSeasonActive: false,
          seasonInfo,
          count: 0,
          entries: [],
          message: `Season ${seasonInfo.seasonNumber} ist noch nicht offiziell gestartet.`,
        });
      }

      const seasonEntries = await getSeasonProfitLeaderboard(seasonInfo.id, parsedLimit);
      return res.json({
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
          score: e.netProfit, // Net profit amount in Game$
          netProfit: e.netProfit,
          totalRounds: e.totalRounds,
          rank: e.rank,
        })),
      });
    }

    const topScores = await getTopScores(period, parsedLimit);

    return res.json({
      period,
      count: topScores.length,
      entries: topScores,
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
