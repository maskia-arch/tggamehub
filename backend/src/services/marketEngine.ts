import db from '../database/client';
import { recordUserMarketProfit } from './seasonService';

export interface HourlyMilestone {
  hourlyVolumeThreshold: number;
  boostMultiplier: number;
  label: string;
}

export const HOURLY_MILESTONES: HourlyMilestone[] = [
  { hourlyVolumeThreshold: 1000, boostMultiplier: 1.05, label: 'Bronze 1h (1.05x Boost)' },
  { hourlyVolumeThreshold: 5000, boostMultiplier: 1.12, label: 'Silber 1h (1.12x Boost)' },
  { hourlyVolumeThreshold: 25000, boostMultiplier: 1.25, label: 'Gold 1h (1.25x Boost)' },
  { hourlyVolumeThreshold: 100000, boostMultiplier: 1.50, label: 'Platin 1h (1.50x Boost)' },
];

export interface MarketCoinOverview {
  symbol: string;
  name: string;
  gameId: string;
  currentPrice: number;
  basePrice: number;
  circulatingSupply: number;
  totalBurned: number;
  volume24h: number;
  volume1h: number;
  change24hPercent: number;
  targetScore: number;
  hourlyBoost?: {
    label: string;
    multiplier: number;
    hourlyVolume: number;
  };
  updatedAt: string;
}

export interface MarketEvent {
  id: number;
  coinSymbol: string;
  eventType: string;
  title: string;
  description: string;
  priceImpactPercent: number;
  createdAt: string;
}

export interface DynamicGameBenchmark {
  gameId: string;
  symbol: string;
  name: string;
  targetScore: number;
  minScoreThreshold: number;
  totalRoundsPlayed: number;
  basePayoutCash: number;
}

/**
 * Dynamically computes game score benchmark metrics directly from actual gameplay scores in DB.
 * Never uses fixed hardcoded values -- adapts continuously in real-time as players submit scores!
 */
export async function getDynamicGameBenchmark(gameId: string): Promise<DynamicGameBenchmark> {
  const cleanGameId = (gameId || '').toLowerCase().trim();
  const coinMapping = GAME_COIN_MAP[cleanGameId] || { symbol: 'DOODLE', name: 'Game Coin' };

  // Initial fallback baseline if no scores exist yet
  const initialBaselines: Record<string, number> = {
    doodlejump: 1500,
    neonbird: 25,
    crossyneonroad: 40,
    neonstacking: 15,
  };
  const fallbackTarget = initialBaselines[cleanGameId] || 100;

  try {
    const hasScoresTable = await db.schema.hasTable('scores');
    if (!hasScoresTable) {
      return {
        gameId: cleanGameId,
        symbol: coinMapping.symbol,
        name: coinMapping.name,
        targetScore: fallbackTarget,
        minScoreThreshold: Math.round(fallbackTarget * 0.5),
        totalRoundsPlayed: 0,
        basePayoutCash: 0.05,
      };
    }

    const stats = await db('scores')
      .where({ game_id: cleanGameId })
      .select(
        db.raw('AVG(score) as avg_score'),
        db.raw('COUNT(id) as total_rounds')
      )
      .first();

    const totalRounds = stats && stats.total_rounds ? parseInt(stats.total_rounds as string, 10) || 0 : 0;

    let targetScore = fallbackTarget;
    if (totalRounds >= 3 && stats && stats.avg_score != null) {
      targetScore = Math.max(1, Math.round(Number(stats.avg_score)));
    }

    const minScoreThreshold = Math.max(1, Math.round(targetScore * 0.5));

    return {
      gameId: cleanGameId,
      symbol: coinMapping.symbol,
      name: coinMapping.name,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed: totalRounds,
      basePayoutCash: 0.05,
    };
  } catch (err) {
    console.error(`[Market Engine]: Error computing dynamic benchmark for ${gameId}:`, err);
    return {
      gameId: cleanGameId,
      symbol: coinMapping.symbol,
      name: coinMapping.name,
      targetScore: fallbackTarget,
      minScoreThreshold: Math.round(fallbackTarget * 0.5),
      totalRoundsPlayed: 0,
      basePayoutCash: 0.05,
    };
  }
}

export interface UserPortfolioItem {
  coinSymbol: string;
  coinName: string;
  amount: number;
  avgBuyPrice: number;
  currentPrice: number;
  currentValue: number;
  totalInvested: number;
  pnlCash: number;
  pnlPercent: number;
}

export interface CandlePoint {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
  isBullish: boolean;
}

/**
 * Game-Id to Coin-Symbol Mapping (Only active/visible games)
 */
export const GAME_COIN_MAP: Record<string, { symbol: string; name: string }> = {
  doodlejump: { symbol: 'DOODLE', name: 'Doodle Jump Coin' },
  neonbird: { symbol: 'FLAPPY', name: 'Neon Flappy Coin' },
};

// Global activity tracker map for continuous market ticker
let marketTickerInterval: NodeJS.Timeout | null = null;
const lastActivityMap: Record<string, number> = {};

export function markCoinActivity(coinSymbol: string) {
  lastActivityMap[coinSymbol.toUpperCase()] = Date.now();
}

/**
 * Continuous 5-second market ticker loop.
 * Recalculates market prices every 5 seconds so candles move live in real-time.
 * Inactivity causes mean-reverting cooling decay (-0.05% per tick) + micro orderbook noise.
 */
export function startMarketTicker() {
  if (marketTickerInterval) return;
  console.log('[Market Engine]: Starting continuous 5-second market ticker loop...');
  
  marketTickerInterval = setInterval(async () => {
    try {
      await tickMarketPrices();
    } catch (err) {
      console.error('[Market Ticker Error]:', err);
    }
  }, 5000);
}

export async function getMarketEvents(limit: number = 10): Promise<MarketEvent[]> {
  try {
    const hasEventsTable = await db.schema.hasTable('market_events');
    if (!hasEventsTable) return [];
    
    const rows = await db('market_events')
      .orderBy('created_at', 'desc')
      .limit(limit);

    return rows.map((r: any) => ({
      id: r.id,
      coinSymbol: r.coin_symbol,
      eventType: r.event_type,
      title: r.title,
      description: r.description,
      priceImpactPercent: Number(r.price_impact_percent),
      createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
    }));
  } catch (err) {
    console.error('[Market Engine]: Error fetching market events:', err);
    return [];
  }
}

export async function tickMarketPrices() {
  try {
    const coins = await db('market_coins').select('*');
    if (!coins || coins.length === 0) return;
    const now = Date.now();

    for (const coin of coins) {
      const symbol = coin.symbol;
      const currentPrice = Number(coin.current_price);
      const lastActivity = lastActivityMap[symbol] || 0;
      const secondsSinceActivity = (now - lastActivity) / 1000;

      let priceShiftPercent = 0.0;

      if (secondsSinceActivity < 15) {
        // Active interval: stochastic positive bias with random micro-swings
        const baseFactor = (Math.random() * 0.0015 + 0.0005); // +0.05% to +0.20%
        const stochasticNoise = (Math.random() * 0.001 - 0.0003); // Random variation
        priceShiftPercent = baseFactor + stochasticNoise;
      } else {
        // Inactivity period: stochastic cooling decay with random rebounds and dips
        const decayFactor = -0.0004;
        const randomReboundOrDrop = (Math.random() * 0.0012 - 0.0006); // -0.06% to +0.06%
        priceShiftPercent = decayFactor + randomReboundOrDrop;
      }

      const rawNewPrice = currentPrice * (1 + priceShiftPercent);
      const newPrice = Math.max(0.00000001, Math.round(rawNewPrice * 1e12) / 1e12);

      if (Math.abs(newPrice - currentPrice) >= 1e-12) {
        await db('market_coins')
          .where({ symbol })
          .update({
            current_price: newPrice,
            updated_at: new Date(),
          });

        await db('market_price_history').insert({
          coin_symbol: symbol,
          price: newPrice,
          volume: 0,
          timestamp: new Date(),
        });
      }
    }

    // Stochastic Random Market Trigger Events (~8% chance per 5-second tick cycle)
    if (Math.random() < 0.08) {
      await triggerRandomMarketEvent(coins);
    }
  } catch (err) {
    // Silent catch during server shutdown
  }
}

/**
 * Random Market Event Trigger Generator
 * Triggers news events (Bull Rallies, Bear Dumps, Whale Buys, Volatility Spikes, Hype News)
 */
async function triggerRandomMarketEvent(coins: any[]) {
  try {
    const hasEventsTable = await db.schema.hasTable('market_events');
    if (!hasEventsTable || coins.length === 0) return;

    const randomCoin = coins[Math.floor(Math.random() * coins.length)];
    const symbol = randomCoin.symbol;
    const currentPrice = Number(randomCoin.current_price);

    const eventTemplates = [
      {
        type: 'COMMUNITY_RALLY',
        title: '⚡ Community Kaufwelle',
        description: `Starkes Interesse in der Player-Community treibt den $${symbol} Kurs an.`,
        minImpact: 0.008,
        maxImpact: 0.022,
      },
      {
        type: 'PROFIT_TAKING',
        title: '📉 Gewinnmitnahmen',
        description: `Händler realisieren Gewinne nach Kursanstieg bei $${symbol}.`,
        minImpact: -0.018,
        maxImpact: -0.006,
      },
      {
        type: 'TOKEN_BURN_EVENT',
        title: '🔥 Gameplay Token Burn',
        description: `Durch hohe Spielrunden wurden erneut viele $${symbol} Token verbrannt!`,
        minImpact: 0.010,
        maxImpact: 0.025,
      },
      {
        type: 'VOLATILITY_SPIKE',
        title: '📊 Handels-Volatilität',
        description: `Preisfindung und Orderbuch-Aktivität bei $${symbol}.`,
        minImpact: -0.012,
        maxImpact: 0.012,
      },
      {
        type: 'VIRAL_TREND',
        title: '🚀 Arcade Highscore Trend',
        description: `Aktuelle Rekordjagd im Minigame verleiht $${symbol} Aufwind.`,
        minImpact: 0.012,
        maxImpact: 0.028,
      },
    ];

    const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
    const impactPercentFactor = template.minImpact + Math.random() * (template.maxImpact - template.minImpact);
    const priceImpactPercent = Math.round(impactPercentFactor * 10000) / 100;

    const newPrice = Math.max(0.00000001, Math.round((currentPrice * (1 + impactPercentFactor)) * 1e12) / 1e12);

    await db('market_coins')
      .where({ symbol })
      .update({
        current_price: newPrice,
        updated_at: new Date(),
      });

    await db('market_price_history').insert({
      coin_symbol: symbol,
      price: newPrice,
      volume: 0,
      timestamp: new Date(),
    });

    await db('market_events').insert({
      coin_symbol: symbol,
      event_type: template.type,
      title: template.title,
      description: template.description,
      price_impact_percent: priceImpactPercent,
      created_at: new Date(),
    });

    console.log(`[Market Trigger Event]: ${template.title} on $${symbol} -> Impact: ${priceImpactPercent >= 0 ? '+' : ''}${priceImpactPercent}% (New Price: ${newPrice.toFixed(8)} $)`);
  } catch (err) {
    console.error('[Market Event Trigger Error]:', err);
  }
}

/**
 * Triggered on score submission.
 * Evaluates performance against the game's benchmark target score.
 * Benchmark score reached -> Positive stock impact!
 * Below benchmark score -> Small negative stock impact!
 * Equalizes Ingame$ payouts across games for fair gameplay rewards.
 */
export async function recordGameplayVolume(gameId: string, score: number): Promise<{
  earnedCash: number;
  newPrice?: number;
  burned?: number;
  targetScore: number;
  minScoreThreshold: number;
  totalRoundsPlayed: number;
  performanceRatio: number;
  isPositiveImpact: boolean;
  priceChangePercent: number;
}> {
  const cleanGameId = (gameId || '').toLowerCase().trim();
  // Dynamically calculate benchmark metrics from actual SQL score stats
  const benchmark = await getDynamicGameBenchmark(cleanGameId);

  const targetScore = benchmark.targetScore;
  const minScoreThreshold = benchmark.minScoreThreshold;
  const totalRoundsPlayed = benchmark.totalRoundsPlayed;
  const performanceRatio = score > 0 ? Math.round((score / targetScore) * 1000) / 1000 : 0;

  // Balanced Ingame$ Cash Payout across games:
  // Average performance ratio (1.0) yields 0.05 Game$ in ANY game.
  let earnedCash = 0.0;
  if (score > 0) {
    const rawCash = benchmark.basePayoutCash * performanceRatio;
    earnedCash = Math.min(0.25, Math.max(0.0001, Math.round(rawCash * 10000) / 10000));
  }

  const coinMapping = GAME_COIN_MAP[cleanGameId];
  if (!coinMapping || score <= 0) {
    return {
      earnedCash,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed,
      performanceRatio,
      isPositiveImpact: false,
      priceChangePercent: 0,
    };
  }

  const coinSymbol = coinMapping.symbol;
  markCoinActivity(coinSymbol);

  try {
    const coin = await db('market_coins').where({ symbol: coinSymbol }).first();
    if (!coin) {
      return { earnedCash, targetScore, minScoreThreshold, totalRoundsPlayed, performanceRatio, isPositiveImpact: false, priceChangePercent: 0 };
    }

    // Fetch 1-hour volume history to calculate hourly volume velocity
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const hourlyHistory = await db('market_price_history')
      .where({ coin_symbol: coinSymbol })
      .where('timestamp', '>=', oneHourAgo);
    
    const past1hVolume = hourlyHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);
    const total1hVolume = past1hVolume + score;

    let boostMultiplier = 1.0;
    let activeMilestoneLabel = 'Standard 1h';
    for (const ms of HOURLY_MILESTONES) {
      if (total1hVolume >= ms.hourlyVolumeThreshold) {
        boostMultiplier = ms.boostMultiplier;
        activeMilestoneLabel = ms.label;
      }
    }

    const burnedTokens = Math.round((score * 0.002) * 100) / 100;
    const newSupply = Math.max(100, Number(coin.circulating_supply) - burnedTokens);
    const newTotalBurned = Number(coin.total_burned || 0) + burnedTokens;
    const newVolume24h = Math.round((Number(coin.volume_24h || 0) + score) * 100) / 100;

    // Stock price effect based on dynamic score benchmark
    // Score >= targetScore -> positive price gain (+0.1% to +2.5% * boostMultiplier)
    // Score < targetScore -> small negative price drop (-0.05% to -0.30%)
    let priceShiftPercent = 0.0;
    const isPositiveImpact = performanceRatio >= 1.0;

    if (isPositiveImpact) {
      const baseGain = 0.001 + Math.min(0.025, (performanceRatio - 1.0) * 0.01);
      priceShiftPercent = baseGain * boostMultiplier;
    } else {
      const penalty = 0.0005 + Math.min(0.0025, (1.0 - performanceRatio) * 0.002);
      priceShiftPercent = -penalty;
    }

    const burnBoost = Math.pow(1 + (burnedTokens / Math.max(100000, newSupply)), 0.5);
    const currentPrice = Number(coin.current_price);
    const rawPrice = currentPrice * (1 + priceShiftPercent) * burnBoost;
    const newPrice = Math.max(0.00000001, Math.round(rawPrice * 1e12) / 1e12);

    const priceChangePercent = Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100;

    await db('market_coins')
      .where({ symbol: coinSymbol })
      .update({
        current_price: newPrice,
        circulating_supply: newSupply,
        total_burned: newTotalBurned,
        volume_24h: newVolume24h,
        updated_at: new Date(),
      });

    // Record price history snapshot
    await db('market_price_history').insert({
      coin_symbol: coinSymbol,
      price: newPrice,
      volume: score,
      timestamp: new Date(),
    });

    // Record real player gameplay event in market_events table
    if (Math.abs(priceChangePercent) >= 0.05) {
      const eventTitle = isPositiveImpact ? '🔥 Highscore Token Burn' : '📉 Score Unter Benchmark';
      const eventDesc = isPositiveImpact
        ? `Ein Spieler hat ${score.toLocaleString()} Punkte erzielt und $${coinSymbol} Token verbrannt!`
        : `Spielrunde lag unter dem dynamischen Benchmark von ${targetScore.toLocaleString()} Pkt.`;

      await db('market_events').insert({
        coin_symbol: coinSymbol,
        event_type: isPositiveImpact ? 'HIGHSCORE_BURN' : 'MIN_SCORE_PENALTY',
        title: eventTitle,
        description: eventDesc,
        price_impact_percent: priceChangePercent,
        created_at: new Date(),
      });
    }

    console.log(`[Market Engine]: Score ${score} vs Dynamic Benchmark ${targetScore} (${(performanceRatio * 100).toFixed(0)}%) -> $${coinSymbol} Price: ${newPrice.toFixed(8)} $ (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%), Earned: ${earnedCash.toFixed(4)} Game$ (${activeMilestoneLabel})`);
    
    return {
      earnedCash,
      newPrice,
      burned: burnedTokens,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed,
      performanceRatio,
      isPositiveImpact,
      priceChangePercent,
    };
  } catch (err) {
    console.error(`[Market Engine ERROR]: Failed to record gameplay volume for ${gameId}:`, err);
    return { earnedCash, targetScore, minScoreThreshold, totalRoundsPlayed, performanceRatio, isPositiveImpact: false, priceChangePercent: 0 };
  }
}

/**
 * Returns full market overview, 24h price changes, 1h hourly volume, dynamic target benchmarks, recent trigger events, user cash balance and portfolio.
 */
export async function getMarketOverview(userId: string) {
  const coins = await db('market_coins').select('*');
  const user = await db('users').where({ id: userId }).first();

  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 3600 * 1000);
  const oneHourAgo = new Date(now - 3600 * 1000);

  const coinsWith24h: MarketCoinOverview[] = await Promise.all(
    coins.map(async (c) => {
      // Fetch historical price around 24 hours ago
      const oldHistory = await db('market_price_history')
        .where('coin_symbol', c.symbol)
        .where('timestamp', '>=', twentyFourHoursAgo)
        .orderBy('timestamp', 'asc')
        .first();

      // Fetch 1-hour volume velocity
      const hourlyHistory = await db('market_price_history')
        .where('coin_symbol', c.symbol)
        .where('timestamp', '>=', oneHourAgo);

      const volume1h = hourlyHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);

      let boostMultiplier = 1.0;
      let activeLabel = 'Standard';
      for (const ms of HOURLY_MILESTONES) {
        if (volume1h >= ms.hourlyVolumeThreshold) {
          boostMultiplier = ms.boostMultiplier;
          activeLabel = ms.label;
        }
      }

      const oldPrice = oldHistory ? Number(oldHistory.price) : Number(c.base_price);
      const currentPrice = Number(c.current_price);
      const change24hPercent = oldPrice > 0 ? Math.round(((currentPrice - oldPrice) / oldPrice) * 10000) / 100 : 0;
      
      const cleanGameId = (c.game_id || '').toLowerCase().trim();
      const benchmark = await getDynamicGameBenchmark(cleanGameId);

      return {
        symbol: c.symbol,
        name: c.name,
        gameId: c.game_id,
        currentPrice: currentPrice,
        basePrice: Number(c.base_price),
        circulatingSupply: Number(c.circulating_supply),
        totalBurned: Number(c.total_burned),
        volume24h: Number(c.volume_24h || 0),
        volume1h,
        change24hPercent,
        targetScore: benchmark.targetScore,
        minScoreThreshold: benchmark.minScoreThreshold,
        totalRoundsPlayed: benchmark.totalRoundsPlayed,
        hourlyBoost: {
          label: activeLabel,
          multiplier: boostMultiplier,
          hourlyVolume: volume1h,
        },
        updatedAt: c.updated_at,
      };
    })
  );

  // Fetch user portfolio
  const rawPortfolio = await db('user_portfolios').where({ user_id: userId }).where('amount', '>', 0);
  const portfolio: UserPortfolioItem[] = rawPortfolio.map((p) => {
    const coinMatch = coinsWith24h.find((c) => c.symbol === p.coin_symbol);
    const curPrice = coinMatch ? coinMatch.currentPrice : 0.00000001;
    const amount = Number(p.amount);
    const avgBuyPrice = Number(p.avg_buy_price);
    const currentValue = Math.round(amount * curPrice * 10000) / 10000;
    const totalInvested = Math.round(amount * avgBuyPrice * 10000) / 10000;
    const pnlCash = Math.round((currentValue - totalInvested) * 10000) / 10000;
    const pnlPercent = totalInvested > 0 ? Math.round(((currentValue - totalInvested) / totalInvested) * 10000) / 100 : 0;

    return {
      coinSymbol: p.coin_symbol,
      coinName: coinMatch?.name || p.coin_symbol,
      amount,
      avgBuyPrice,
      currentPrice: curPrice,
      currentValue,
      totalInvested,
      pnlCash,
      pnlPercent,
    };
  });

  // Fetch recent trigger events
  const recentEvents = await getMarketEvents(8);

  return {
    userCash: Number(user?.game_cash || 0.0),
    coins: coinsWith24h,
    portfolio,
    events: recentEvents,
  };
}

/**
 * Fetch OHLC Candlesticks for charting supporting timeframes: 30m (default), 60m, 12h, 24h
 */
export async function getCoinChart(coinSymbol: string, timeframe: string = '30m'): Promise<CandlePoint[]> {
  const cleanSymbol = coinSymbol.replace('$', '').toUpperCase();
  const coin = await db('market_coins').where({ symbol: cleanSymbol }).first();
  const currentPrice = coin ? Number(coin.current_price) : 0.00000001;

  // Determine timeframe duration in minutes
  let timeframeMinutes = 30;
  if (timeframe === '60m') timeframeMinutes = 60;
  else if (timeframe === '12h') timeframeMinutes = 12 * 60;
  else if (timeframe === '24h') timeframeMinutes = 24 * 60;

  const candleCount = 24;
  const candleSpanMs = (timeframeMinutes * 60 * 1000) / candleCount;
  const now = Date.now();
  const timeframeStart = new Date(now - timeframeMinutes * 60 * 1000);

  const history = await db('market_price_history')
    .where({ coin_symbol: cleanSymbol })
    .where('timestamp', '>=', timeframeStart)
    .orderBy('timestamp', 'asc');

  const candles: CandlePoint[] = [];

  if (!history || history.length < 5) {
    for (let i = candleCount - 1; i >= 0; i--) {
      const timeOffset = i * candleSpanMs;

      candles.push({
        open: Math.round(currentPrice * 1e12) / 1e12,
        high: Math.round(currentPrice * 1e12) / 1e12,
        low: Math.round(currentPrice * 1e12) / 1e12,
        close: Math.round(currentPrice * 1e12) / 1e12,
        volume: 0,
        timestamp: new Date(now - timeOffset).toISOString(),
        isBullish: true,
      });
    }
    return candles;
  }

  // Aggregate raw DB points into candles
  const totalPoints = history.length;
  const chunkSize = Math.max(1, Math.floor(totalPoints / candleCount));

  for (let i = 0; i < totalPoints; i += chunkSize) {
    const chunk = history.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    const prices = chunk.map((h: any) => Number(h.price));
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const volume = chunk.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);
    const timestamp = typeof chunk[chunk.length - 1].timestamp === 'string'
      ? chunk[chunk.length - 1].timestamp
      : new Date(chunk[chunk.length - 1].timestamp).toISOString();

    candles.push({
      open: Math.round(open * 1e12) / 1e12,
      high: Math.round(high * 1e12) / 1e12,
      low: Math.round(low * 1e12) / 1e12,
      close: Math.round(close * 1e12) / 1e12,
      volume: Math.round(volume),
      timestamp,
      isBullish: close >= open,
    });
  }

  if (candles.length > 0) {
    const lastCandle = candles[candles.length - 1];
    lastCandle.close = currentPrice;
    lastCandle.high = Math.max(lastCandle.high, currentPrice);
    lastCandle.low = Math.min(lastCandle.low, currentPrice);
    lastCandle.isBullish = lastCandle.close >= lastCandle.open;
  }

  return candles;
}

/**
 * Atomic Buy/Sell Order Execution with Gas Fee calculation & Real Market Price Impact.
 *
 * Price impact model (√-scaled, realistic for small-cap crypto):
 *   BUY  → +impact%  where impact = sqrt(cashSpent)  × 0.025   → capped at +15%
 *   SELL → -impact%  where impact = sqrt(grossCash)  × 0.035   → capped at -30%
 *
 * Larger trades cause proportionally MORE impact (whale behaviour), but the square-root
 * dampens it so it doesn't go vertical — exactly like real thin-orderbook markets.
 */
export async function executeMarketTrade(
  userId: string,
  coinSymbol: string,
  tradeType: 'BUY' | 'SELL',
  amountInput: number
) {
  const symbol = coinSymbol.toUpperCase();

  if (!amountInput || isNaN(amountInput) || amountInput <= 0) {
    throw new Error('Ein positiver Betrag ist erforderlich.');
  }

  markCoinActivity(symbol);

  // NOTE: SQLite does not support row-level FOR UPDATE locks.
  // We rely on the SQLite transaction (DEFERRED) for atomicity instead.
  const result = await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).first();
    if (!user) throw new Error('Benutzerkonto nicht gefunden.');

    const coin = await trx('market_coins').where({ symbol }).first();
    if (!coin) throw new Error(`Coin $${symbol} ist nicht auf der Börse gelistet.`);

    const currentPrice = Number(coin.current_price);
    if (!currentPrice || currentPrice <= 0) throw new Error('Ungültiger Kurs – bitte kurz warten und erneut versuchen.');

    const userCash = Number(user.game_cash || 0);

    if (tradeType === 'BUY') {
      // amountInput = Game$ to spend
      const cashToSpend = amountInput;
      const gasFee = Math.max(0.0001, Math.round((0.0005 + cashToSpend * 0.001) * 10000) / 10000);
      const totalRequiredCash = Math.round((cashToSpend + gasFee) * 10000) / 10000;

      if (userCash < totalRequiredCash) {
        throw new Error(
          `Zu wenig Game$. Benötigt: ${totalRequiredCash.toFixed(4)} Game$, Verfügbar: ${userCash.toFixed(4)} Game$`
        );
      }

      const tokensAcquired = Math.round((cashToSpend / currentPrice) * 1000000) / 1000000;
      if (tokensAcquired <= 0) throw new Error('Kaufbetrag zu gering – bitte größeren Betrag eingeben.');

      // BUY price impact: √(cashSpent) × 0.025, capped at +15%
      const rawImpact = Math.sqrt(cashToSpend) * 0.025;
      const priceImpact = Math.min(0.15, rawImpact);
      const newPrice = Math.max(0.00000001, Math.round((currentPrice * (1 + priceImpact)) * 1e12) / 1e12);

      await trx('users').where({ id: userId }).update({ game_cash: Math.round((userCash - totalRequiredCash) * 10000) / 10000 });

      const existingPortfolio = await trx('user_portfolios').where({ user_id: userId, coin_symbol: symbol }).first();
      if (existingPortfolio) {
        const oldAmount = Number(existingPortfolio.amount);
        const oldAvgPrice = Number(existingPortfolio.avg_buy_price);
        const newAmount = Math.round((oldAmount + tokensAcquired) * 1000000) / 1000000;
        const newAvgPrice = ((oldAmount * oldAvgPrice) + (tokensAcquired * currentPrice)) / newAmount;

        await trx('user_portfolios')
          .where({ id: existingPortfolio.id })
          .update({ amount: newAmount, avg_buy_price: Math.round(newAvgPrice * 1e12) / 1e12, updated_at: new Date() });
      } else {
        await trx('user_portfolios').insert({
          user_id: userId,
          coin_symbol: symbol,
          amount: tokensAcquired,
          avg_buy_price: currentPrice,
          updated_at: new Date(),
        });
      }

      await trx('market_coins').where({ symbol }).update({
        current_price: newPrice,
        volume_24h: Math.round((Number(coin.volume_24h || 0) + cashToSpend) * 100) / 100,
        updated_at: new Date(),
      });

      await trx('user_trades').insert({
        user_id: userId,
        coin_symbol: symbol,
        trade_type: 'BUY',
        amount_tokens: tokensAcquired,
        price_per_token: currentPrice,
        total_cash: cashToSpend,
        gas_fee: gasFee,
        created_at: new Date(),
      });

      await trx('market_price_history').insert({
        coin_symbol: symbol,
        price: newPrice,
        volume: cashToSpend,
        timestamp: new Date(),
      });

      const priceImpactPercent = Math.round(priceImpact * 10000) / 100;
      await trx('market_events').insert({
        coin_symbol: symbol,
        event_type: 'PLAYER_BUY',
        title: '🛒 Player Buy Order',
        description: `Ein Händler hat ${cashToSpend.toFixed(2)} Game$ in $${symbol} investiert! (+${priceImpactPercent.toFixed(2)}% Kursimpact)`,
        price_impact_percent: priceImpactPercent,
        created_at: new Date(),
      });

      console.log(`[Market Trade BUY]: $${symbol} bought for ${cashToSpend} Game$. +${(priceImpact * 100).toFixed(2)}% impact → New Price: ${newPrice.toFixed(10)} $`);
      return {
        tradeType: 'BUY',
        tokensAcquired,
        pricePerToken: currentPrice,
        totalCashSpent: cashToSpend,
        gasFee,
        newCashBalance: Math.round((userCash - totalRequiredCash) * 10000) / 10000,
        newPrice,
        priceImpactPercent,
      };

    } else {
      // SELL: amountInput = token count to sell
      const tokensToSell = amountInput;

      const portfolio = await trx('user_portfolios').where({ user_id: userId, coin_symbol: symbol }).first();
      const currentTokenBalance = portfolio ? Number(portfolio.amount) : 0;

      if (currentTokenBalance <= 0) {
        throw new Error(`Du besitzt keine $${symbol} Token zum Verkaufen.`);
      }
      if (tokensToSell > currentTokenBalance + 0.000001) {
        throw new Error(
          `Nicht genug $${symbol}. Verfügbar: ${currentTokenBalance.toLocaleString('de-DE', { maximumFractionDigits: 6 })} Token`
        );
      }

      // Sell exactly what they have if the difference is rounding dust
      const actualSell = Math.min(tokensToSell, currentTokenBalance);

      // Precise gross cash using full floating-point price
      const grossCash = Math.round(actualSell * currentPrice * 10000) / 10000;
      if (grossCash < 0.00001) {
        throw new Error('Der Verkaufswert ist zu gering (unter dem Mindestbetrag). Bitte größere Menge wählen.');
      }

      const gasFee = Math.max(0.0001, Math.round((0.0005 + grossCash * 0.001) * 10000) / 10000);
      const netCashReceived = Math.max(0, Math.round((grossCash - gasFee) * 10000) / 10000);

      // SELL price impact: √(grossCash) × 0.035, capped at -30%
      // A whale selling 10 Game$ worth → √10 × 0.035 ≈ 11% drop
      // A small sell of 0.01 Game$ worth → √0.01 × 0.035 ≈ 0.35% drop  
      const rawImpact = Math.sqrt(grossCash) * 0.035;
      const priceImpact = Math.min(0.30, rawImpact);
      const newPrice = Math.max(0.00000001, Math.round((currentPrice * (1 - priceImpact)) * 1e12) / 1e12);

      await trx('users').where({ id: userId }).update({
        game_cash: Math.round((userCash + netCashReceived) * 10000) / 10000,
      });

      const newAmount = Math.round((currentTokenBalance - actualSell) * 1000000) / 1000000;
      if (newAmount <= 0.0001) {
        await trx('user_portfolios').where({ id: portfolio!.id }).update({ amount: 0, updated_at: new Date() });
      } else {
        await trx('user_portfolios').where({ id: portfolio!.id }).update({ amount: newAmount, updated_at: new Date() });
      }

      await trx('market_coins').where({ symbol }).update({
        current_price: newPrice,
        volume_24h: Math.round((Number(coin.volume_24h || 0) + grossCash) * 100) / 100,
        updated_at: new Date(),
      });

      await trx('user_trades').insert({
        user_id: userId,
        coin_symbol: symbol,
        trade_type: 'SELL',
        amount_tokens: actualSell,
        price_per_token: currentPrice,
        total_cash: grossCash,
        gas_fee: gasFee,
        created_at: new Date(),
      });

      await trx('market_price_history').insert({
        coin_symbol: symbol,
        price: newPrice,
        volume: grossCash,
        timestamp: new Date(),
      });

      const sellImpactPercent = Math.round(-priceImpact * 10000) / 100;
      await trx('market_events').insert({
        coin_symbol: symbol,
        event_type: 'PLAYER_SELL',
        title: priceImpact > 0.08 ? '🐋 Whale Sell Order!' : '💰 Player Sell Order',
        description: priceImpact > 0.08
          ? `⚠️ Großer Verkauf! ${actualSell.toLocaleString('de-DE', { maximumFractionDigits: 0 })} $${symbol} Token im Wert von ${grossCash.toFixed(4)} Game$ verkauft. Kurseinbruch: ${(priceImpact * 100).toFixed(2)}%`
          : `Ein Händler hat $${symbol} Token im Wert von ${grossCash.toFixed(4)} Game$ verkauft.`,
        price_impact_percent: sellImpactPercent,
        created_at: new Date(),
      });

      // Calculate realized profit for season stats
      const avgBuyPrice = Number(portfolio?.avg_buy_price || currentPrice);
      const costBasis = actualSell * avgBuyPrice;
      const netTradeProfit = grossCash - costBasis - gasFee;

      console.log(
        `[Market Trade SELL]: ${actualSell.toLocaleString('de-DE')} $${symbol} → ${grossCash.toFixed(6)} Game$ gross, -${(priceImpact * 100).toFixed(2)}% impact, Net: ${netCashReceived.toFixed(4)} Game$. New Price: ${newPrice.toFixed(10)} $`
      );
      return {
        tradeType: 'SELL',
        tokensSold: actualSell,
        pricePerToken: currentPrice,
        grossCash,
        netCashReceived,
        gasFee,
        priceImpactPercent: sellImpactPercent,
        newCashBalance: Math.round((userCash + netCashReceived) * 10000) / 10000,
        newPrice,
        netTradeProfit: netTradeProfit > 0 ? netTradeProfit : 0,
      };
    }
  });

  // Record realized profit for season stats outside the transaction
  if (result && result.tradeType === 'SELL' && (result as any).netTradeProfit > 0) {
    try {
      await recordUserMarketProfit(userId, (result as any).netTradeProfit);
    } catch (e: any) {
      console.warn('[Market Trade]: Could not record season market profit:', e.message);
    }
  }

  return result;
}

