import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { getMarketOverview, getCoinChart, executeMarketTrade, getMarketEvents } from '../services/marketEngine';

/**
 * GET /api/market/overview
 * Returns all coins, 24h performance, user cash balance, portfolio, and recent trigger events.
 */
export async function getMarketData(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }

    const data = await getMarketOverview(userId);
    return res.json(data);
  } catch (error: any) {
    console.error('Error fetching market overview:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/market/events
 * Returns recent random market trigger events.
 */
export async function getMarketEventsData(_req: AuthenticatedRequest, res: Response) {
  try {
    const events = await getMarketEvents(15);
    return res.json({ success: true, events });
  } catch (error: any) {
    console.error('Error fetching market events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/market/chart/:symbol
 * Returns historical price points for charting.
 */
export async function getCoinChartData(req: AuthenticatedRequest, res: Response) {
  try {
    const { symbol } = req.params;
    const timeframe = (req.query.timeframe as string) || '30m';
    if (!symbol) {
      return res.status(400).json({ error: 'Coin symbol parameter is required' });
    }

    const chartPoints = await getCoinChart(symbol, timeframe);
    return res.json({ symbol: symbol.toUpperCase(), timeframe, history: chartPoints });
  } catch (error: any) {
    console.error('Error fetching coin chart:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/market/trade
 * Executes BUY or SELL order for a specific coin.
 */
export async function tradeCoin(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    const { symbol, tradeType, amount } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }
    if (!symbol || !tradeType || !amount) {
      return res.status(400).json({ error: 'Missing required parameters: symbol, tradeType, amount' });
    }
    if (tradeType !== 'BUY' && tradeType !== 'SELL') {
      return res.status(400).json({ error: 'tradeType must be either BUY or SELL' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const result = await executeMarketTrade(userId, symbol, tradeType, parsedAmount);

    return res.json({
      success: true,
      message: tradeType === 'BUY'
        ? `Erfolgreich ${result.tokensAcquired} $${symbol} gekauft!`
        : `Erfolgreich ${result.tokensSold} $${symbol} verkauft!`,
      result,
    });
  } catch (error: any) {
    console.error('Error executing market trade:', error);
    return res.status(400).json({ error: error.message || 'Handel konnte nicht ausgeführt werden.' });
  }
}
