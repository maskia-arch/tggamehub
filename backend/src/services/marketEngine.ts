import db from '../database/client';
import { recordUserMarketProfit } from './seasonService';

export interface DynamicHourlyBoost {
  tier: 'NONE' | 'BRONZE' | 'SILBER' | 'GOLD' | 'PLATIN';
  label: string;
  multiplier: number;
  hourlyPoints: number;
  hourlyRounds: number;
  difficultyFactor: number;
  nextTierTarget: number;
  nextTierTargetPoints: number;
  nextTierLabel: string;
  progressPercent: number;
}

/**
 * Dynamically computes hourly coin market boosts using verified community points per hour
 * and adaptive difficulty scaling.
 */
export async function calculateDynamicHourlyBoost(
  coinSymbol: string,
  targetScore: number,
  extraRounds: number = 0
): Promise<DynamicHourlyBoost> {
  const now = Date.now();
  const oneHourAgo = new Date(now - 3600 * 1000);
  const fourHoursAgo = new Date(now - 4 * 3600 * 1000);
  const benchmarkScore = Math.max(1, targetScore);

  try {
    const hasHistoryTable = await db.schema.hasTable('market_price_history');
    if (!hasHistoryTable) {
      const defaultBronzePoints = Math.round(15 * benchmarkScore);
      return {
        tier: 'NONE',
        label: 'Standard (1.00x)',
        multiplier: 1.0,
        hourlyPoints: 0,
        hourlyRounds: 0,
        difficultyFactor: 1.0,
        nextTierTarget: defaultBronzePoints,
        nextTierTargetPoints: defaultBronzePoints,
        nextTierLabel: `Bronze (${defaultBronzePoints.toLocaleString()} Pkt)`,
        progressPercent: 0,
      };
    }

    // Past 1h verified score history
    const hourlyHistory = await db('market_price_history')
      .where({ coin_symbol: coinSymbol })
      .where('timestamp', '>=', oneHourAgo);

    const past1hScoreSum = hourlyHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);
    const hourlyPoints = Math.round(past1hScoreSum + (extraRounds * benchmarkScore));
    const normalizedRounds1h = hourlyPoints / benchmarkScore;

    // Past 4h history to assess previous cycle performance and calculate adaptive difficulty
    const prevCycleHistory = await db('market_price_history')
      .where({ coin_symbol: coinSymbol })
      .where('timestamp', '>=', fourHoursAgo)
      .where('timestamp', '<', oneHourAgo);

    const prevScoreSum = prevCycleHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);
    const prevAvgHourlyRounds = (prevScoreSum / benchmarkScore) / 3.0; // 3-hour average

    // Adaptive difficulty scaling:
    // If previous activity was intense (e.g. Gold tier >= 30 rounds/h), difficulty increases by up to +35%
    let difficultyFactor = 1.0;
    if (prevAvgHourlyRounds >= 30) {
      difficultyFactor = 1.0 + Math.min(0.35, Math.max(0, (prevAvgHourlyRounds - 30) / 100) * 0.35);
    }

    // Base tier requirements in points (scaled to benchmark score & adaptive difficulty)
    const bronzePoints = Math.max(1, Math.round(15 * benchmarkScore * difficultyFactor));
    const silberPoints = Math.max(1, Math.round(40 * benchmarkScore * difficultyFactor));
    const goldPoints = Math.max(1, Math.round(100 * benchmarkScore * difficultyFactor));
    const platinPoints = Math.max(1, Math.round(250 * benchmarkScore * difficultyFactor));

    let tier: 'NONE' | 'BRONZE' | 'SILBER' | 'GOLD' | 'PLATIN' = 'NONE';
    let label = 'Standard (1.00x)';
    let multiplier = 1.0;
    let nextTierTargetPoints = bronzePoints;
    let nextTierLabel = `Bronze (${bronzePoints.toLocaleString()} Pkt)`;

    if (hourlyPoints >= platinPoints) {
      tier = 'PLATIN';
      label = 'Platin (1.50x Boost)';
      multiplier = 1.50;
      nextTierTargetPoints = platinPoints;
      nextTierLabel = 'Max Stufe erreicht';
    } else if (hourlyPoints >= goldPoints) {
      tier = 'GOLD';
      label = 'Gold (1.25x Boost)';
      multiplier = 1.25;
      nextTierTargetPoints = platinPoints;
      nextTierLabel = `Platin (${platinPoints.toLocaleString()} Pkt)`;
    } else if (hourlyPoints >= silberPoints) {
      tier = 'SILBER';
      label = 'Silber (1.12x Boost)';
      multiplier = 1.12;
      nextTierTargetPoints = goldPoints;
      nextTierLabel = `Gold (${goldPoints.toLocaleString()} Pkt)`;
    } else if (hourlyPoints >= bronzePoints) {
      tier = 'BRONZE';
      label = 'Bronze (1.05x Boost)';
      multiplier = 1.05;
      nextTierTargetPoints = silberPoints;
      nextTierLabel = `Silber (${silberPoints.toLocaleString()} Pkt)`;
    }

    const progressPercent = tier === 'PLATIN' ? 100 : Math.min(100, Math.round((hourlyPoints / nextTierTargetPoints) * 100));

    return {
      tier,
      label,
      multiplier,
      hourlyPoints,
      hourlyRounds: Math.round(normalizedRounds1h * 10) / 10,
      difficultyFactor: Math.round(difficultyFactor * 100) / 100,
      nextTierTarget: nextTierTargetPoints,
      nextTierTargetPoints,
      nextTierLabel,
      progressPercent,
    };
  } catch (err) {
    console.error('[Market Engine]: Error calculating dynamic hourly boost:', err);
    const defaultBronzePoints = Math.round(15 * benchmarkScore);
    return {
      tier: 'NONE',
      label: 'Standard (1.00x)',
      multiplier: 1.0,
      hourlyPoints: 0,
      hourlyRounds: 0,
      difficultyFactor: 1.0,
      nextTierTarget: defaultBronzePoints,
      nextTierTargetPoints: defaultBronzePoints,
      nextTierLabel: `Bronze (${defaultBronzePoints.toLocaleString()} Pkt)`,
      progressPercent: 0,
    };
  }
}

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
  hourlyBoost?: DynamicHourlyBoost;
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
  doodlejump: { symbol: 'DOODLE', name: 'Neon Jump Coin' },
  neonbird: { symbol: 'FLAPPY', name: 'Neon Bird Coin' },
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
      const basePrice = Number(coin.base_price || currentPrice);
      const lastActivity = lastActivityMap[symbol] || 0;
      const secondsSinceActivity = (now - lastActivity) / 1000;

      let priceShiftPercent = 0.0;

      // Realistic orderbook micro-spread noise (creates natural candle wicks)
      const microNoise = (Math.random() * 0.0004 - 0.0002); // ±0.02% micro bid/ask spread

      if (secondsSinceActivity < 30) {
        // Active gameplay period: mild positive momentum with micro-fluctuations
        const activeBias = 0.00008 + (Math.random() * 0.00012); // +0.008% to +0.020%
        priceShiftPercent = activeBias + microNoise;
      } else {
        // Inactive cooling: subtle mean-reverting drift towards base price
        const deviationRatio = (currentPrice - basePrice) / Math.max(1e-8, basePrice);
        const meanRevertDrift = -0.00003 * Math.sign(deviationRatio) * Math.min(2.0, Math.abs(deviationRatio));
        priceShiftPercent = meanRevertDrift + microNoise;
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

    // Stochastic Market Trigger Events (~1.5% chance per 5-second tick, approx every 5-8 minutes)
    if (Math.random() < 0.015) {
      await triggerRandomMarketEvent(coins);
    }
  } catch (err) {
    // Silent catch during server shutdown
  }
}

/**
 * Random Market Event Trigger Generator
 * Triggers realistic crypto market events (Bull Rallies, Bear Dumps, Whale Buys, News)
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
        minImpact: 0.003,
        maxImpact: 0.009,
      },
      {
        type: 'PROFIT_TAKING',
        title: '📉 Gewinnmitnahmen',
        description: `Händler realisieren Gewinne nach Kursanstieg bei $${symbol}.`,
        minImpact: -0.008,
        maxImpact: -0.003,
      },
      {
        type: 'TOKEN_BURN_EVENT',
        title: '🔥 Gameplay Token Burn',
        description: `Durch hohe Spielrunden wurden $${symbol} Token verbrannt!`,
        minImpact: 0.004,
        maxImpact: 0.012,
      },
      {
        type: 'VOLATILITY_SPIKE',
        title: '📊 Handels-Volatilität',
        description: `Preisfindung und Orderbuch-Aktivität bei $${symbol}.`,
        minImpact: -0.005,
        maxImpact: 0.005,
      },
      {
        type: 'VIRAL_TREND',
        title: '🚀 Arcade Highscore Trend',
        description: `Aktuelle Rekordjagd im Minigame verleiht $${symbol} Aufwind.`,
        minImpact: 0.005,
        maxImpact: 0.014,
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

    console.log(`[Market Trigger Event]: ${template.title} on $${symbol} -> Impact: ${priceImpactPercent >= 0 ? '+' : ''}${priceImpactPercent}%`);
  } catch (err) {
    console.error('[Market Event Trigger Error]:', err);
  }
}

/**
 * Triggered on score submission.
 * Highscore & Gameplay Performance Effect:
 * Realistic benchmark-relative logarithmic scaling.
 * Supports collective community pushes through 1-hour volume velocity.
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
  const benchmark = await getDynamicGameBenchmark(cleanGameId);

  const targetScore = Math.max(1, benchmark.targetScore);
  const minScoreThreshold = benchmark.minScoreThreshold;
  const totalRoundsPlayed = benchmark.totalRoundsPlayed;
  const performanceRatio = score > 0 ? Math.round((score / targetScore) * 1000) / 1000 : 0;

  // Balanced Ingame$ Cash Payout strictly proportional to current dynamic point average (1.0 ratio yields 0.05 Game$)
  let earnedCash = 0.0;
  if (score > 0) {
    const rawCash = benchmark.basePayoutCash * Math.min(3.0, Math.pow(performanceRatio, 0.85));
    earnedCash = Math.min(0.20, Math.max(0.0001, Math.round(rawCash * 10000) / 10000));
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

    // Dynamic community hourly boost evaluation based on standardized rounds
    const currentRoundUnit = score / targetScore;
    const boostInfo = await calculateDynamicHourlyBoost(coinSymbol, targetScore, currentRoundUnit);
    const boostMultiplier = boostInfo.multiplier;

    // Standardized, controlled Token Burn across ALL games:
    // A benchmark average round (1.0x) burns 10.0 Tokens; a 2.0x round burns 20.0 Tokens.
    // Minimum 0.1 tokens burned per submitted game.
    const burnedTokens = Math.max(0.1, Math.round((performanceRatio * 10.0) * 100) / 100);
    const newSupply = Math.max(100, Number(coin.circulating_supply) - burnedTokens);
    const newTotalBurned = Math.round((Number(coin.total_burned || 0) + burnedTokens) * 100) / 100;
    const newVolume24h = Math.round((Number(coin.volume_24h || 0) + score) * 100) / 100;

    // Unified Symmetrical Price Impact Formula across all games:
    const isPositiveImpact = performanceRatio >= 1.0;
    let priceShiftPercent = 0.0;

    if (isPositiveImpact) {
      // Sublinear logarithmic scaling prevents single-user score inflation
      const baseGain = 0.0003 * Math.log(1 + 2 * performanceRatio);
      priceShiftPercent = baseGain * boostMultiplier;
    } else {
      const penalty = 0.00025 * Math.pow(Math.max(0, 1.0 - performanceRatio), 1.2);
      priceShiftPercent = -penalty;
    }

    // Liquidity Depth Resistance: As price grows relative to base price, resistance increases
    const basePrice = Number(coin.base_price || coin.current_price);
    const currentPrice = Number(coin.current_price);
    const priceElevation = Math.max(1.0, currentPrice / Math.max(1e-8, basePrice));
    const liquidityResistance = Math.sqrt(priceElevation);

    const effectiveShift = priceShiftPercent / liquidityResistance;
    const rawPrice = currentPrice * (1 + effectiveShift);
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

    // Record price history snapshot with score volume
    await db('market_price_history').insert({
      coin_symbol: coinSymbol,
      price: newPrice,
      volume: score,
      timestamp: new Date(),
    });

    // Record significant market event for gameplay round (supports both DOODLE and FLAPPY)
    if (isPositiveImpact || burnedTokens >= 5.0 || Math.abs(priceChangePercent) >= 0.01) {
      const eventTitle = isPositiveImpact ? '🔥 Highscore Token Burn' : '📉 Score Unter Benchmark';
      const eventDesc = isPositiveImpact
        ? `Ein Spieler hat ${score.toLocaleString()} Punkte erzielt und ${burnedTokens.toFixed(1)} $${coinSymbol} verbrannt!`
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

    return {
      earnedCash,
      newPrice,
      burned: burnedTokens,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed: totalRoundsPlayed + 1,
      performanceRatio,
      isPositiveImpact,
      priceChangePercent,
    };
  } catch (err) {
    console.error(`[Market Engine]: Error recording gameplay volume:`, err);
    return { earnedCash, targetScore, minScoreThreshold, totalRoundsPlayed, performanceRatio, isPositiveImpact: false, priceChangePercent: 0 };
  }
}

/**
 * Returns full market overview, 24h price changes, dynamic 1h hourly volume boost, dynamic target benchmarks, recent trigger events, user cash balance and portfolio.
 */
export async function getMarketOverview(userId: string) {
  const CANONICAL_COIN_ORDER = ['DOODLE', 'FLAPPY'];
  const rawCoins = await db('market_coins').select('*');
  const coins = [...rawCoins].sort((a, b) => {
    const idxA = CANONICAL_COIN_ORDER.indexOf(a.symbol.toUpperCase());
    const idxB = CANONICAL_COIN_ORDER.indexOf(b.symbol.toUpperCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return a.symbol.localeCompare(b.symbol);
  });

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

      // Fetch 1-hour volume history
      const hourlyHistory = await db('market_price_history')
        .where('coin_symbol', c.symbol)
        .where('timestamp', '>=', oneHourAgo);

      const volume1h = hourlyHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);

      const cleanGameId = (c.game_id || '').toLowerCase().trim();
      const benchmark = await getDynamicGameBenchmark(cleanGameId);
      const boostInfo = await calculateDynamicHourlyBoost(c.symbol, benchmark.targetScore);

      const oldPrice = oldHistory ? Number(oldHistory.price) : Number(c.base_price);
      const currentPrice = Number(c.current_price);
      const change24hPercent = oldPrice > 0 ? Math.round(((currentPrice - oldPrice) / oldPrice) * 10000) / 100 : 0;

      return {
        symbol: c.symbol,
        name: c.symbol === 'DOODLE' ? 'Neon Jump Coin' : (c.symbol === 'FLAPPY' ? 'Neon Bird Coin' : c.name),
        gameId: c.game_id,
        currentPrice: currentPrice,
        basePrice: Number(c.base_price),
        circulatingSupply: Number(c.circulating_supply),
        totalBurned: Number(c.total_burned || 0),
        volume24h: Number(c.volume_24h || 0),
        volume1h,
        change24hPercent,
        targetScore: benchmark.targetScore,
        minScoreThreshold: benchmark.minScoreThreshold,
        totalRoundsPlayed: benchmark.totalRoundsPlayed,
        hourlyBoost: boostInfo,
        updatedAt: c.updated_at,
      };
    })
  );

  // Guarantee strict fixed order
  coinsWith24h.sort((a, b) => {
    const idxA = CANONICAL_COIN_ORDER.indexOf(a.symbol.toUpperCase());
    const idxB = CANONICAL_COIN_ORDER.indexOf(b.symbol.toUpperCase());
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return a.symbol.localeCompare(b.symbol);
  });

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
/**
 * Fetch OHLC Candlesticks for charting supporting timeframes: 30m (default), 60m, 12h, 24h
 * Uses deterministic fixed time-bucket grouping so past closed candles NEVER mutate.
 * Only the latest open candle updates live.
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
  const currentBucketIndex = Math.floor(now / candleSpanMs);
  const oldestBucketStartTime = (currentBucketIndex - candleCount + 1) * candleSpanMs;

  const history = await db('market_price_history')
    .where({ coin_symbol: cleanSymbol })
    .where('timestamp', '>=', new Date(oldestBucketStartTime - candleSpanMs * 2))
    .orderBy('timestamp', 'asc');

  let lastKnownPrice = currentPrice;
  if (history.length > 0) {
    lastKnownPrice = Number(history[0].price);
  }

  // Pre-sort history into discrete, fixed time buckets
  const bucketMap = new Map<number, Array<{ price: number; volume: number; timestamp: number }>>();

  for (const h of history) {
    const ts = new Date(h.timestamp).getTime();
    if (ts < oldestBucketStartTime) {
      lastKnownPrice = Number(h.price);
      continue;
    }
    const bIndex = Math.floor(ts / candleSpanMs);
    if (!bucketMap.has(bIndex)) {
      bucketMap.set(bIndex, []);
    }
    bucketMap.get(bIndex)!.push({
      price: Number(h.price),
      volume: Number(h.volume || 0),
      timestamp: ts,
    });
  }

  const candles: CandlePoint[] = [];

  for (let i = 0; i < candleCount; i++) {
    const bucketIndex = currentBucketIndex - candleCount + 1 + i;
    const bucketStartTime = bucketIndex * candleSpanMs;
    const isCurrentActiveCandle = i === candleCount - 1;

    const points = bucketMap.get(bucketIndex);

    let open: number;
    let high: number;
    let low: number;
    let close: number;
    let volume = 0;

    if (points && points.length > 0) {
      open = points[0].price;
      close = points[points.length - 1].price;
      high = Math.max(...points.map((p) => p.price));
      low = Math.min(...points.map((p) => p.price));
      volume = points.reduce((sum, p) => sum + p.volume, 0);
      lastKnownPrice = close;
    } else {
      open = lastKnownPrice;
      high = lastKnownPrice;
      low = lastKnownPrice;
      close = lastKnownPrice;
      volume = 0;
    }

    if (isCurrentActiveCandle) {
      // Live active unclosed candle incorporates the real-time ticker price
      close = currentPrice;
      high = Math.max(high, currentPrice);
      low = Math.min(low, currentPrice);
    }

    candles.push({
      open: Math.round(open * 1e12) / 1e12,
      high: Math.round(high * 1e12) / 1e12,
      low: Math.round(low * 1e12) / 1e12,
      close: Math.round(close * 1e12) / 1e12,
      volume: Math.round(volume),
      timestamp: new Date(bucketStartTime).toISOString(),
      isBullish: close >= open,
    });
  }

  return candles;
}

/**
 * Atomic Buy/Sell Order Execution with Gas Fee calculation & Balanced AMM Price Impact.
 *
 * Constant Product AMM Slippage:
 *   Impact = Amount / (VirtualLiquidityDepth + Amount) * MaxSlippageFactor
 *   Virtual liquidity depth = 50.00 Game$
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

  const result = await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).first();
    if (!user) throw new Error('Benutzerkonto nicht gefunden.');

    const coin = await trx('market_coins').where({ symbol }).first();
    if (!coin) throw new Error(`Coin $${symbol} ist nicht auf der Börse gelistet.`);

    const currentPrice = Number(coin.current_price);
    if (!currentPrice || currentPrice <= 0) throw new Error('Ungültiger Kurs – bitte kurz warten und erneut versuchen.');

    const userCash = Number(user.game_cash || 0);
    const virtualLiquidity = 50.0; // 50 Game$ AMM Depth

    if (tradeType === 'BUY') {
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

      // Realistic AMM Buy Slippage: Amount / (Depth + Amount) * 0.08
      const priceImpact = (cashToSpend / (virtualLiquidity + cashToSpend)) * 0.08;
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

      const actualSell = Math.min(tokensToSell, currentTokenBalance);
      const grossCash = Math.round(actualSell * currentPrice * 10000) / 10000;
      if (grossCash < 0.00001) {
        throw new Error('Der Verkaufswert ist zu gering (unter dem Mindestbetrag). Bitte größere Menge wählen.');
      }

      const gasFee = Math.max(0.0001, Math.round((0.0005 + grossCash * 0.001) * 10000) / 10000);
      const netCashReceived = Math.max(0, Math.round((grossCash - gasFee) * 10000) / 10000);

      // Realistic AMM Sell Slippage: Amount / (Depth + Amount) * 0.08
      const priceImpact = (grossCash / (virtualLiquidity + grossCash)) * 0.08;
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

