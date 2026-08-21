import db from '../database/client';
import { recordUserMarketProfit } from './seasonService';

// ============================================================================
// MARKET & AMM CONFIGURATION CONSTANTS (EASILY TWEAKABLE)
// ============================================================================
export const MARKET_CONFIG = {
  // Initial Pool Parameters (Mandatory)
  BASE_PRICE: 0.00000001, // P_0 = 10^-8 Game$
  INITIAL_VIRTUAL_GAME_RESERVE: 100_000.0, // x_0 = 100,000.00 Game$
  INITIAL_VIRTUAL_TOKEN_RESERVE: 10_000_000_000_000.0, // y_0 = 10 Trillion (10^13)
  CONSTANT_PRODUCT_K: 1e18, // k = x_0 * y_0 = 100,000 * 10^13 = 10^18
  MIN_PRICE: 0.00000001, // Strict floor price clamp

  // Normalization Engine
  ROLLING_SCORE_SAMPLE_SIZE: 500, // Rolling window for dynamic mean & standard deviation
  SCORE_IMPACT_FACTOR: 0.0004, // Sublinear scaling factor for z-score impact
  BASE_TOKENS_BURNED_PER_ROUND: 10_000.0, // Base tokens burned on average benchmark round (10k tokens)

  // AMM Trading Parameters
  GAS_FEE_RATE: 0.001, // 0.1% transaction fee
  GAS_FEE_MIN: 0.0005, // Minimum gas fee in Game$
  DEFAULT_MAX_SLIPPAGE_PERCENT: 15.0, // Default 15% slippage protection limit

  // Volatility & Market Dynamics
  PASSIVE_DRIFT_PER_TICK: -0.0002, // -0.02% cooling drift per idle tick (5s)
  MOMENTUM_BOOST_PER_STREAK: 0.00015, // +0.015% per consecutive green momentum candle
  MAX_MOMENTUM_STREAK: 5,
  WHALE_SURGE_THRESHOLD: 0.40, // +40% surge triggers whale take-profit check
  WHALE_DUMP_MIN: 0.15, // -15% correction
  WHALE_DUMP_MAX: 0.25, // -25% correction
  MICRO_SPREAD_NOISE: 0.0003, // ±0.03% orderbook micro-spread noise

  // Ticker Interval
  TICK_INTERVAL_MS: 5000, // 5-second continuous market tick loop
};

// ============================================================================
// DATA TYPES & INTERFACES
// ============================================================================
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

export interface GameScoreStatistics {
  gameId: string;
  symbol: string;
  name: string;
  mean: number;
  stdDev: number;
  sampleSize: number;
  benchmarkTarget: number;
  minScoreThreshold: number;
  basePayoutCash: number;
}

export interface MarketCoinOverview {
  symbol: string;
  name: string;
  gameId: string;
  currentPrice: number;
  basePrice: number;
  virtualGameReserve: number;
  virtualTokenReserve: number;
  constantProductK: number;
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

export interface AmmTradeCalculation {
  tradeType: 'BUY' | 'SELL';
  amountIn: number;
  amountOut: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
  executionPrice: number;
  priceImpactPercent: number;
  gasFee: number;
  newGameReserve: number;
  newTokenReserve: number;
}

// Canonical Minigame to Coin mapping
export const GAME_COIN_MAP: Record<string, { symbol: string; name: string }> = {
  doodlejump: { symbol: 'DOODLE', name: 'Neon Jump Coin' },
  neonbird: { symbol: 'FLAPPY', name: 'Neon Bird Coin' },
};

// Internal momentum & activity state
interface CoinMomentumState {
  consecutiveBuys: number;
  consecutiveSells: number;
  lastTickPrice: number;
  lastActivityTime: number;
  peak24hPrice: number;
}

const momentumTracker: Record<string, CoinMomentumState> = {};
let marketTickerInterval: NodeJS.Timeout | null = null;

function getCoinMomentum(symbol: string): CoinMomentumState {
  const sym = symbol.toUpperCase();
  if (!momentumTracker[sym]) {
    momentumTracker[sym] = {
      consecutiveBuys: 0,
      consecutiveSells: 0,
      lastTickPrice: MARKET_CONFIG.BASE_PRICE,
      lastActivityTime: Date.now(),
      peak24hPrice: MARKET_CONFIG.BASE_PRICE,
    };
  }
  return momentumTracker[sym];
}

export function markCoinActivity(coinSymbol: string) {
  const momentum = getCoinMomentum(coinSymbol);
  momentum.lastActivityTime = Date.now();
}

// ============================================================================
// 1. POOL INITIALIZATION & MANAGEMENT
// ============================================================================

/**
 * Initializes or resets a Coin Pool to exact mandatory parameters (x0 = 100,000, y0 = 10 Trillion, k = 10^18)
 */
export async function initCoinPool(
  coinSymbol: string,
  initialPrice: number = MARKET_CONFIG.BASE_PRICE,
  initialVirtualGame: number = MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE
) {
  const sym = coinSymbol.toUpperCase();
  const safePrice = Math.max(MARKET_CONFIG.MIN_PRICE, initialPrice);
  const safeGameReserve = Math.max(1000.0, initialVirtualGame);
  const tokenReserve = safeGameReserve / safePrice;
  const constantK = safeGameReserve * tokenReserve;

  const mapping = Object.values(GAME_COIN_MAP).find((m) => m.symbol === sym) || {
    symbol: sym,
    name: sym === 'FLAPPY' ? 'Neon Bird Coin' : (sym === 'DOODLE' ? 'Neon Jump Coin' : `${sym} Coin`),
  };

  const existing = await db('market_coins').where({ symbol: sym }).first();
  if (existing) {
    await db('market_coins')
      .where({ symbol: sym })
      .update({
        current_price: safePrice,
        base_price: safePrice,
        virtual_game_reserve: safeGameReserve,
        virtual_token_reserve: tokenReserve,
        constant_product_k: constantK,
        circulating_supply: tokenReserve,
        updated_at: new Date(),
      });
  } else {
    const gameId = Object.keys(GAME_COIN_MAP).find((k) => GAME_COIN_MAP[k].symbol === sym) || sym.toLowerCase();
    await db('market_coins').insert({
      symbol: sym,
      name: mapping.name,
      game_id: gameId,
      current_price: safePrice,
      base_price: safePrice,
      virtual_game_reserve: safeGameReserve,
      virtual_token_reserve: tokenReserve,
      constant_product_k: constantK,
      circulating_supply: tokenReserve,
      total_burned: 0.0,
      volume_24h: 0.0,
      updated_at: new Date(),
    });
  }

  console.log(`[Market Engine]: Initialized pool for $${sym} (P0=${safePrice}, x0=${safeGameReserve}, y0=${tokenReserve}, k=${constantK})`);
}

// ============================================================================
// 2. NORMALIZED SCORE-IMPACT ENGINE (Δperf = (S - μ) / σ)
// ============================================================================

/**
 * Computes rolling mean (μ) and standard deviation (σ) over the last 500 runs for a given minigame.
 * Uses robust game-specific baseline fallbacks for cold-start.
 */
export async function getRollingScoreStatistics(gameId: string): Promise<GameScoreStatistics> {
  const cleanGameId = (gameId || '').toLowerCase().trim();
  const coinMapping = GAME_COIN_MAP[cleanGameId] || { symbol: 'DOODLE', name: 'Game Coin' };

  // Cold-start fallback baselines
  const fallbackBaselines: Record<string, { mean: number; stdDev: number }> = {
    doodlejump: { mean: 1500, stdDev: 500 },
    neonbird: { mean: 20, stdDev: 10 },
    crossyneonroad: { mean: 40, stdDev: 20 },
    neonstacking: { mean: 15, stdDev: 8 },
  };

  const baseline = fallbackBaselines[cleanGameId] || { mean: 100, stdDev: 50 };

  try {
    const hasScoresTable = await db.schema.hasTable('scores');
    if (!hasScoresTable) {
      return {
        gameId: cleanGameId,
        symbol: coinMapping.symbol,
        name: coinMapping.name,
        mean: baseline.mean,
        stdDev: baseline.stdDev,
        sampleSize: 0,
        benchmarkTarget: baseline.mean,
        minScoreThreshold: Math.max(1, Math.round(baseline.mean * 0.5)),
        basePayoutCash: 0.05,
      };
    }

    // Fetch the last 500 scores for this game
    const recentScores = await db('scores')
      .where({ game_id: cleanGameId })
      .select('score')
      .orderBy('id', 'desc')
      .limit(MARKET_CONFIG.ROLLING_SCORE_SAMPLE_SIZE);

    const sampleSize = recentScores.length;
    if (sampleSize < 5) {
      return {
        gameId: cleanGameId,
        symbol: coinMapping.symbol,
        name: coinMapping.name,
        mean: baseline.mean,
        stdDev: baseline.stdDev,
        sampleSize,
        benchmarkTarget: baseline.mean,
        minScoreThreshold: Math.max(1, Math.round(baseline.mean * 0.5)),
        basePayoutCash: 0.05,
      };
    }

    const scoresArray = recentScores.map((s: any) => Number(s.score || 0));
    const mean = scoresArray.reduce((sum, val) => sum + val, 0) / sampleSize;

    const variance =
      scoresArray.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / Math.max(1, sampleSize - 1);
    const stdDev = Math.max(1.0, Math.sqrt(variance));

    const benchmarkTarget = Math.max(1, Math.round(mean));
    const minScoreThreshold = Math.max(1, Math.round(benchmarkTarget * 0.5));

    return {
      gameId: cleanGameId,
      symbol: coinMapping.symbol,
      name: coinMapping.name,
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      sampleSize,
      benchmarkTarget,
      minScoreThreshold,
      basePayoutCash: 0.05,
    };
  } catch (err) {
    console.error(`[Market Engine]: Error computing rolling statistics for ${cleanGameId}:`, err);
    return {
      gameId: cleanGameId,
      symbol: coinMapping.symbol,
      name: coinMapping.name,
      mean: baseline.mean,
      stdDev: baseline.stdDev,
      sampleSize: 0,
      benchmarkTarget: baseline.mean,
      minScoreThreshold: Math.max(1, Math.round(baseline.mean * 0.5)),
      basePayoutCash: 0.05,
    };
  }
}

// Backward-compatible alias
export const getDynamicGameBenchmark = getRollingScoreStatistics;

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

    const hourlyHistory = await db('market_price_history')
      .where({ coin_symbol: coinSymbol })
      .where('timestamp', '>=', oneHourAgo);

    const past1hScoreSum = hourlyHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);
    const hourlyPoints = Math.round(past1hScoreSum + extraRounds * benchmarkScore);
    const normalizedRounds1h = hourlyPoints / benchmarkScore;

    const prevCycleHistory = await db('market_price_history')
      .where({ coin_symbol: coinSymbol })
      .where('timestamp', '>=', fourHoursAgo)
      .where('timestamp', '<', oneHourAgo);

    const prevScoreSum = prevCycleHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);
    const prevAvgHourlyRounds = prevScoreSum / benchmarkScore / 3.0;

    let difficultyFactor = 1.0;
    if (prevAvgHourlyRounds >= 30) {
      difficultyFactor = 1.0 + Math.min(0.35, Math.max(0, (prevAvgHourlyRounds - 30) / 100) * 0.35);
    }

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
      multiplier = 1.5;
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

    const progressPercent =
      tier === 'PLATIN' ? 100 : Math.min(100, Math.round((hourlyPoints / nextTierTargetPoints) * 100));

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

/**
 * Normalized Score-to-Market Mapping Engine:
 * - Computes z-score: Δperf = (S - μ) / σ
 * - Injects synthetic buy / token burn on Δperf > 0
 * - Applies cooling sell pressure on Δperf < 0
 * - Triggers immediate impulse event on record breaks (+5% to +15%)
 */
export async function recordGameScore(
  gameId: string,
  score: number,
  tokensBurnedParam?: number,
  userId?: string
): Promise<{
  earnedCash: number;
  newPrice?: number;
  burned?: number;
  zScore: number;
  performanceRatio: number;
  targetScore: number;
  minScoreThreshold: number;
  totalRoundsPlayed: number;
  isPositiveImpact: boolean;
  isRecordBreak: boolean;
  priceChangePercent: number;
}> {
  const cleanGameId = (gameId || '').toLowerCase().trim();
  const stats = await getRollingScoreStatistics(cleanGameId);

  const mean = stats.mean;
  const stdDev = Math.max(1.0, stats.stdDev);
  const targetScore = stats.benchmarkTarget;
  const minScoreThreshold = stats.minScoreThreshold;
  const totalRoundsPlayed = stats.sampleSize;

  // 1. Compute normalized z-score performance
  const rawZScore = score > 0 ? (score - mean) / stdDev : -2.0;
  // Clamp z-score to safe bounds to prevent outlier exploitation
  const zScore = Math.max(-3.0, Math.min(5.0, Math.round(rawZScore * 100) / 100));

  // Normalized performance ratio (1.0 = average performance)
  const performanceRatio = Math.max(0.0, Math.round((1.0 + zScore * 0.5) * 1000) / 1000);

  // Balanced InGame$ Cash Payout strictly based on normalized performance
  let earnedCash = 0.0;
  if (score > 0) {
    const rawCash = stats.basePayoutCash * Math.min(3.0, Math.pow(Math.max(0.1, performanceRatio), 0.85));
    earnedCash = Math.min(0.2, Math.max(0.0001, Math.round(rawCash * 10000) / 10000));
  }

  const coinMapping = GAME_COIN_MAP[cleanGameId];
  if (!coinMapping || score <= 0) {
    return {
      earnedCash,
      zScore,
      performanceRatio,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed,
      isPositiveImpact: false,
      isRecordBreak: false,
      priceChangePercent: 0,
    };
  }

  const coinSymbol = coinMapping.symbol;
  markCoinActivity(coinSymbol);

  try {
    const coin = await db('market_coins').where({ symbol: coinSymbol }).first();
    if (!coin) {
      return {
        earnedCash,
        zScore,
        performanceRatio,
        targetScore,
        minScoreThreshold,
        totalRoundsPlayed,
        isPositiveImpact: false,
        isRecordBreak: false,
        priceChangePercent: 0,
      };
    }

    const currentPrice = Number(coin.current_price || MARKET_CONFIG.BASE_PRICE);
    const virtualTokens = Number(coin.virtual_token_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_TOKEN_RESERVE);
    const constantK = Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);
    const circulatingSupply = Number(coin.circulating_supply || virtualTokens);

    // Hourly boost multiplier
    const boostInfo = await calculateDynamicHourlyBoost(coinSymbol, targetScore, 1);
    const boostMultiplier = boostInfo.multiplier;

    // Check for Highscore / Record Break
    let isRecordBreak = false;
    let impulseBonusPercent = 0.0;

    if (userId) {
      const allTimeHigh = await db('scores').where({ game_id: cleanGameId }).max('score as max_score').first();
      const userBest = await db('scores')
        .where({ game_id: cleanGameId, user_id: userId })
        .max('score as user_max')
        .first();

      const globalMax = Number(allTimeHigh?.max_score || 0);
      const userMax = Number(userBest?.user_max || 0);

      if (globalMax > 0 && score >= globalMax && zScore >= 2.0) {
        isRecordBreak = true;
        impulseBonusPercent = 0.12; // +12% All-Time High Record Spike!
      } else if (userMax > 0 && score > userMax && zScore >= 1.5) {
        isRecordBreak = true;
        impulseBonusPercent = 0.06; // +6% Personal Record Spike!
      }
    }

    // Token Burn: standard burning rate scaled by positive performance
    const baseBurn = MARKET_CONFIG.BASE_TOKENS_BURNED_PER_ROUND;
    const burnedTokens =
      tokensBurnedParam ||
      Math.max(100.0, Math.round(baseBurn * Math.max(0.1, 1.0 + Math.max(0, zScore)) * 100) / 100);

    const newSupply = Math.max(1000.0, circulatingSupply - burnedTokens);
    const newTotalBurned = Math.round((Number(coin.total_burned || 0) + burnedTokens) * 100) / 100;
    const newVolume24h = Math.round((Number(coin.volume_24h || 0) + score) * 100) / 100;

    // Normalized Score-to-Market Price Impact:
    const isPositiveImpact = zScore >= 0;
    let deltaScore = 0.0;

    if (isPositiveImpact) {
      // Sublinear logarithmic scaling on positive performance
      deltaScore = MARKET_CONFIG.SCORE_IMPACT_FACTOR * Math.log(1 + 2 * Math.max(0.1, zScore)) * boostMultiplier;
    } else {
      // Gentle cooling penalty on below-average runs
      const penalty = 0.0003 * Math.min(2.0, Math.pow(Math.abs(zScore), 1.2));
      deltaScore = -penalty;
    }

    const totalPriceShift = deltaScore + impulseBonusPercent;
    const rawNewPrice = currentPrice * (1 + totalPriceShift);
    const newPrice = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(rawNewPrice * 1e12) / 1e12);
    const priceChangePercent = Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100;

    // Rebalance AMM virtual reserves to align spot price: x = sqrt(k * P), y = sqrt(k / P)
    const newGameReserve = Math.sqrt(constantK * newPrice);
    const newTokenReserve = Math.sqrt(constantK / newPrice);

    await db('market_coins')
      .where({ symbol: coinSymbol })
      .update({
        current_price: newPrice,
        virtual_game_reserve: newGameReserve,
        virtual_token_reserve: newTokenReserve,
        circulating_supply: newSupply,
        total_burned: newTotalBurned,
        volume_24h: newVolume24h,
        updated_at: new Date(),
      });

    // Record price history
    await db('market_price_history').insert({
      coin_symbol: coinSymbol,
      price: newPrice,
      volume: score,
      timestamp: new Date(),
    });

    // Record market events
    if (isRecordBreak) {
      await db('market_events').insert({
        coin_symbol: coinSymbol,
        event_type: 'HIGHSCORE_RECORD_BREAK',
        title: '🚀 NEUER HIGHSCORE-REKORD!',
        description: `Ein Spieler hat mit ${score.toLocaleString()} Punkten einen neuen Rekord aufgestellt! $${coinSymbol} schießt um +${(impulseBonusPercent * 100).toFixed(1)}% nach oben!`,
        price_impact_percent: Math.round(impulseBonusPercent * 10000) / 100,
        created_at: new Date(),
      });
    } else if (isPositiveImpact && (burnedTokens >= 5000 || Math.abs(priceChangePercent) >= 0.01)) {
      await db('market_events').insert({
        coin_symbol: coinSymbol,
        event_type: 'GAMEPLAY_TOKEN_BURN',
        title: '🔥 Token Burn Rallye',
        description: `Starke Runde mit ${score.toLocaleString()} Punkten (Z-Score: +${zScore.toFixed(2)}). ${burnedTokens.toLocaleString()} $${coinSymbol} verbrannt!`,
        price_impact_percent: priceChangePercent,
        created_at: new Date(),
      });
    }

    return {
      earnedCash,
      newPrice,
      burned: burnedTokens,
      zScore,
      performanceRatio,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed: totalRoundsPlayed + 1,
      isPositiveImpact,
      isRecordBreak,
      priceChangePercent,
    };
  } catch (err) {
    console.error(`[Market Engine]: Error recording game score for ${cleanGameId}:`, err);
    return {
      earnedCash,
      zScore,
      performanceRatio,
      targetScore,
      minScoreThreshold,
      totalRoundsPlayed,
      isPositiveImpact: false,
      isRecordBreak: false,
      priceChangePercent: 0,
    };
  }
}

// Backward-compatible alias
export const recordGameplayVolume = recordGameScore;

// ============================================================================
// 3. VIRTUAL AMM FOR PLAYER TRADES (x * y = k)
// ============================================================================

/**
 * Pure AMM Calculation for BUY order:
 * Δy = y - k / (x + amountGameIn)
 */
export function calculateAmmBuy(
  amountGameIn: number,
  currentGameReserve: number,
  currentTokenReserve: number,
  constantProductK: number = MARKET_CONFIG.CONSTANT_PRODUCT_K,
  gasFeeRate: number = MARKET_CONFIG.GAS_FEE_RATE,
  gasFeeMin: number = MARKET_CONFIG.GAS_FEE_MIN
): AmmTradeCalculation {
  const spotPriceBefore = Math.max(MARKET_CONFIG.MIN_PRICE, currentGameReserve / currentTokenReserve);
  const gasFee = Math.max(gasFeeMin, Math.round((gasFeeMin + amountGameIn * gasFeeRate) * 10000) / 10000);

  const newGameReserve = currentGameReserve + amountGameIn;
  const newTokenReserve = constantProductK / newGameReserve;
  const tokensAcquired = Math.max(0, currentTokenReserve - newTokenReserve);

  const rawSpotPriceAfter = newGameReserve / newTokenReserve;
  const spotPriceAfter = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(rawSpotPriceAfter * 1e12) / 1e12);

  const executionPrice = tokensAcquired > 0 ? amountGameIn / tokensAcquired : spotPriceBefore;
  const priceImpactPercent = Math.round(((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 10000) / 100;

  return {
    tradeType: 'BUY',
    amountIn: amountGameIn,
    amountOut: tokensAcquired,
    spotPriceBefore,
    spotPriceAfter,
    executionPrice,
    priceImpactPercent,
    gasFee,
    newGameReserve,
    newTokenReserve,
  };
}

/**
 * Pure AMM Calculation for SELL order:
 * Δx = x - k / (y + amountTokensIn)
 */
export function calculateAmmSell(
  amountTokensIn: number,
  currentGameReserve: number,
  currentTokenReserve: number,
  constantProductK: number = MARKET_CONFIG.CONSTANT_PRODUCT_K,
  gasFeeRate: number = MARKET_CONFIG.GAS_FEE_RATE,
  gasFeeMin: number = MARKET_CONFIG.GAS_FEE_MIN
): AmmTradeCalculation {
  const spotPriceBefore = Math.max(MARKET_CONFIG.MIN_PRICE, currentGameReserve / currentTokenReserve);

  const newTokenReserve = currentTokenReserve + amountTokensIn;
  const newGameReserve = constantProductK / newTokenReserve;
  const grossCashOut = Math.max(0, currentGameReserve - newGameReserve);

  const gasFee = Math.max(gasFeeMin, Math.round((gasFeeMin + grossCashOut * gasFeeRate) * 10000) / 10000);
  const netCashOut = Math.max(0, Math.round((grossCashOut - gasFee) * 10000) / 10000);

  const rawSpotPriceAfter = newGameReserve / newTokenReserve;
  const spotPriceAfter = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(rawSpotPriceAfter * 1e12) / 1e12);

  const executionPrice = amountTokensIn > 0 ? grossCashOut / amountTokensIn : spotPriceBefore;
  const priceImpactPercent = Math.round(((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 10000) / 100;

  return {
    tradeType: 'SELL',
    amountIn: amountTokensIn,
    amountOut: netCashOut,
    spotPriceBefore,
    spotPriceAfter,
    executionPrice,
    priceImpactPercent,
    gasFee,
    newGameReserve,
    newTokenReserve,
  };
}

/**
 * Executes a Player Buy/Sell order atomically against the Virtual AMM Bonding Curve.
 */
export async function executeTrade(
  userId: string,
  coinSymbol: string,
  tradeType: 'BUY' | 'SELL',
  amountInput: number,
  maxSlippagePercent: number = MARKET_CONFIG.DEFAULT_MAX_SLIPPAGE_PERCENT
) {
  const symbol = coinSymbol.toUpperCase();

  if (!amountInput || isNaN(amountInput) || amountInput <= 0) {
    throw new Error('Ein positiver Betrag ist erforderlich.');
  }

  markCoinActivity(symbol);
  const momentum = getCoinMomentum(symbol);

  const result = await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).first();
    if (!user) throw new Error('Benutzerkonto nicht gefunden.');

    const coin = await trx('market_coins').where({ symbol }).first();
    if (!coin) throw new Error(`Coin $${symbol} ist nicht auf der Börse gelistet.`);

    const virtualGame = Number(coin.virtual_game_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE);
    const virtualTokens = Number(coin.virtual_token_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_TOKEN_RESERVE);
    const constantK = Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);
    const userCash = Number(user.game_cash || 0);

    if (tradeType === 'BUY') {
      const cashToSpend = amountInput;
      const calc = calculateAmmBuy(cashToSpend, virtualGame, virtualTokens, constantK);
      const totalRequiredCash = Math.round((cashToSpend + calc.gasFee) * 10000) / 10000;

      if (userCash < totalRequiredCash) {
        throw new Error(
          `Zu wenig Game$. Benötigt: ${totalRequiredCash.toFixed(4)} Game$, Verfügbar: ${userCash.toFixed(4)} Game$`
        );
      }

      if (calc.priceImpactPercent > maxSlippagePercent) {
        throw new Error(
          `Slippage zu hoch (${calc.priceImpactPercent.toFixed(2)}% > Max ${maxSlippagePercent}%). Bitte kleineren Betrag wählen.`
        );
      }

      const tokensAcquired = Math.round(calc.amountOut * 1000000) / 1000000;
      if (tokensAcquired <= 0) {
        throw new Error('Kaufbetrag zu gering – bitte größeren Betrag eingeben.');
      }

      // Deduct Game$ from user
      await trx('users')
        .where({ id: userId })
        .update({ game_cash: Math.round((userCash - totalRequiredCash) * 10000) / 10000 });

      // Update or create user portfolio
      const existingPortfolio = await trx('user_portfolios').where({ user_id: userId, coin_symbol: symbol }).first();
      if (existingPortfolio) {
        const oldAmount = Number(existingPortfolio.amount);
        const oldAvgPrice = Number(existingPortfolio.avg_buy_price);
        const newAmount = Math.round((oldAmount + tokensAcquired) * 1000000) / 1000000;
        const newAvgPrice = (oldAmount * oldAvgPrice + tokensAcquired * calc.executionPrice) / newAmount;

        await trx('user_portfolios')
          .where({ id: existingPortfolio.id })
          .update({
            amount: newAmount,
            avg_buy_price: Math.round(newAvgPrice * 1e12) / 1e12,
            updated_at: new Date(),
          });
      } else {
        await trx('user_portfolios').insert({
          user_id: userId,
          coin_symbol: symbol,
          amount: tokensAcquired,
          avg_buy_price: calc.executionPrice,
          updated_at: new Date(),
        });
      }

      // Update AMM Pool reserves and spot price
      await trx('market_coins')
        .where({ symbol })
        .update({
          current_price: calc.spotPriceAfter,
          virtual_game_reserve: calc.newGameReserve,
          virtual_token_reserve: calc.newTokenReserve,
          volume_24h: Math.round((Number(coin.volume_24h || 0) + cashToSpend) * 100) / 100,
          updated_at: new Date(),
        });

      // Record trade transaction
      await trx('user_trades').insert({
        user_id: userId,
        coin_symbol: symbol,
        trade_type: 'BUY',
        amount_tokens: tokensAcquired,
        price_per_token: calc.executionPrice,
        total_cash: cashToSpend,
        gas_fee: calc.gasFee,
        price_impact_percent: calc.priceImpactPercent,
        created_at: new Date(),
      });

      // Price history point
      await trx('market_price_history').insert({
        coin_symbol: symbol,
        price: calc.spotPriceAfter,
        volume: cashToSpend,
        timestamp: new Date(),
      });

      // Market event
      await trx('market_events').insert({
        coin_symbol: symbol,
        event_type: 'AMM_BUY_ORDER',
        title: '🛒 AMM Buy Order',
        description: `Ein Händler hat ${cashToSpend.toFixed(2)} Game$ in $${symbol} investiert! (+${calc.priceImpactPercent.toFixed(2)}% Kursimpact)`,
        price_impact_percent: calc.priceImpactPercent,
        created_at: new Date(),
      });

      // Update momentum tracker
      momentum.consecutiveBuys++;
      momentum.consecutiveSells = 0;

      return {
        tradeType: 'BUY',
        tokensAcquired,
        pricePerToken: calc.executionPrice,
        totalCashSpent: cashToSpend,
        gasFee: calc.gasFee,
        newCashBalance: Math.round((userCash - totalRequiredCash) * 10000) / 10000,
        newPrice: calc.spotPriceAfter,
        priceImpactPercent: calc.priceImpactPercent,
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
      const calc = calculateAmmSell(actualSell, virtualGame, virtualTokens, constantK);

      if (Math.abs(calc.priceImpactPercent) > maxSlippagePercent) {
        throw new Error(
          `Slippage zu hoch (${Math.abs(calc.priceImpactPercent).toFixed(2)}% > Max ${maxSlippagePercent}%). Bitte kleineren Verkaufsbetrag wählen.`
        );
      }

      const netCashReceived = calc.amountOut;
      if (netCashReceived < 0.00001) {
        throw new Error('Der Verkaufswert ist zu gering (unter Mindestbetrag). Bitte größere Menge wählen.');
      }

      // Credit Game$ to user
      await trx('users')
        .where({ id: userId })
        .update({
          game_cash: Math.round((userCash + netCashReceived) * 10000) / 10000,
        });

      // Deduct tokens from user portfolio
      const newAmount = Math.round((currentTokenBalance - actualSell) * 1000000) / 1000000;
      if (newAmount <= 0.0001) {
        await trx('user_portfolios').where({ id: portfolio!.id }).update({ amount: 0, updated_at: new Date() });
      } else {
        await trx('user_portfolios').where({ id: portfolio!.id }).update({ amount: newAmount, updated_at: new Date() });
      }

      // Update AMM Pool reserves and spot price
      await trx('market_coins')
        .where({ symbol })
        .update({
          current_price: calc.spotPriceAfter,
          virtual_game_reserve: calc.newGameReserve,
          virtual_token_reserve: calc.newTokenReserve,
          volume_24h: Math.round((Number(coin.volume_24h || 0) + (netCashReceived + calc.gasFee)) * 100) / 100,
          updated_at: new Date(),
        });

      // Record trade transaction
      await trx('user_trades').insert({
        user_id: userId,
        coin_symbol: symbol,
        trade_type: 'SELL',
        amount_tokens: actualSell,
        price_per_token: calc.executionPrice,
        total_cash: netCashReceived + calc.gasFee,
        gas_fee: calc.gasFee,
        price_impact_percent: calc.priceImpactPercent,
        created_at: new Date(),
      });

      // Price history point
      await trx('market_price_history').insert({
        coin_symbol: symbol,
        price: calc.spotPriceAfter,
        volume: netCashReceived,
        timestamp: new Date(),
      });

      // Market event
      const isWhaleSell = Math.abs(calc.priceImpactPercent) >= 5.0;
      await trx('market_events').insert({
        coin_symbol: symbol,
        event_type: isWhaleSell ? 'WHALE_SELL_DUMP' : 'AMM_SELL_ORDER',
        title: isWhaleSell ? '🐋 Whale Sell Order!' : '💰 AMM Sell Order',
        description: isWhaleSell
          ? `⚠️ Großer Verkauf! ${actualSell.toLocaleString('de-DE', { maximumFractionDigits: 0 })} $${symbol} Token verkauft. Kursrutsch: ${calc.priceImpactPercent.toFixed(2)}%`
          : `Ein Händler hat $${symbol} Token im Wert von ${netCashReceived.toFixed(4)} Game$ verkauft.`,
        price_impact_percent: calc.priceImpactPercent,
        created_at: new Date(),
      });

      // Update momentum tracker
      momentum.consecutiveSells++;
      momentum.consecutiveBuys = 0;

      // Realized profit calculation for season leaderboards
      const avgBuyPrice = Number(portfolio?.avg_buy_price || calc.executionPrice);
      const costBasis = actualSell * avgBuyPrice;
      const netTradeProfit = netCashReceived - costBasis;

      return {
        tradeType: 'SELL',
        tokensSold: actualSell,
        pricePerToken: calc.executionPrice,
        grossCash: netCashReceived + calc.gasFee,
        netCashReceived,
        gasFee: calc.gasFee,
        priceImpactPercent: calc.priceImpactPercent,
        newCashBalance: Math.round((userCash + netCashReceived) * 10000) / 10000,
        newPrice: calc.spotPriceAfter,
        netTradeProfit: netTradeProfit > 0 ? netTradeProfit : 0,
      };
    }
  });

  // Record season market profit
  if (result && result.tradeType === 'SELL' && (result as any).netTradeProfit > 0) {
    try {
      await recordUserMarketProfit(userId, (result as any).netTradeProfit);
    } catch (e: any) {
      console.warn('[Market Trade]: Could not record season market profit:', e.message);
    }
  }

  return result;
}

// Backward-compatible alias
export const executeMarketTrade = executeTrade;

// ============================================================================
// 4. TICK-BASED PRICE AGGREGATOR & VOLATILITY DYNAMICS
// ============================================================================

/**
 * Composite Market Update Tick:
 * Pt = Pt-1 * (1 + Δtrade + Δscore + Δmomentum - Drift + Noise)
 * - Evaluates hype cycles / momentum
 * - Applies cooling drift when inactive
 * - Triggers stochastic Whale Take-Profit pullbacks on >+40% surges
 * - Syncs spot price back to AMM virtual reserves
 */
export async function processMarketTick() {
  try {
    const coins = await db('market_coins').select('*');
    if (!coins || coins.length === 0) return;
    const now = Date.now();

    for (const coin of coins) {
      const symbol = coin.symbol;
      const currentPrice = Number(coin.current_price || MARKET_CONFIG.BASE_PRICE);
      const basePrice = Number(coin.base_price || MARKET_CONFIG.BASE_PRICE);
      const constantK = Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);

      const momentum = getCoinMomentum(symbol);
      const secondsSinceActivity = (now - momentum.lastActivityTime) / 1000;

      // 1. Orderbook Micro-Spread Noise (±0.03%)
      const microNoise = (Math.random() * 2 - 1) * MARKET_CONFIG.MICRO_SPREAD_NOISE;

      // 2. Momentum / Hype Cycles Booster
      let deltaMomentum = 0.0;
      if (momentum.consecutiveBuys > 0) {
        const streak = Math.min(MARKET_CONFIG.MAX_MOMENTUM_STREAK, momentum.consecutiveBuys);
        deltaMomentum = streak * MARKET_CONFIG.MOMENTUM_BOOST_PER_STREAK;
      }

      // 3. Passive Mean Reversion / Cooling Drift
      let drift = 0.0;
      if (secondsSinceActivity > 30) {
        const deviationRatio = (currentPrice - basePrice) / Math.max(1e-8, basePrice);
        drift = MARKET_CONFIG.PASSIVE_DRIFT_PER_TICK * Math.sign(deviationRatio) * Math.min(2.0, Math.abs(deviationRatio));
      }

      // 4. Whale Take-Profit / Flash Crash Check
      let whaleDump = 0.0;
      const surgeFromBase = (currentPrice - basePrice) / basePrice;
      if (surgeFromBase >= MARKET_CONFIG.WHALE_SURGE_THRESHOLD) {
        // 3% probability per tick to trigger meme-coin whale profit-taking pullback (-15% to -25%)
        if (Math.random() < 0.03) {
          const dumpPercent =
            MARKET_CONFIG.WHALE_DUMP_MIN +
            Math.random() * (MARKET_CONFIG.WHALE_DUMP_MAX - MARKET_CONFIG.WHALE_DUMP_MIN);
          whaleDump = -dumpPercent;

          await db('market_events').insert({
            coin_symbol: symbol,
            event_type: 'WHALE_TAKE_PROFIT',
            title: '🐋 Whale Gewinnmitnahme',
            description: `Nach starkem Kursanstieg realisieren Großhändler Gewinne bei $${symbol}. Gesunder Pullback um -${(dumpPercent * 100).toFixed(1)}%!`,
            price_impact_percent: Math.round(-dumpPercent * 10000) / 100,
            created_at: new Date(),
          });
          console.log(`[Market Tick]: Whale Take-Profit triggered on $${symbol} (-${(dumpPercent * 100).toFixed(1)}%)`);
        }
      }

      // Composite Price Formula
      const totalShift = deltaMomentum + drift + whaleDump + microNoise;
      const rawNewPrice = currentPrice * (1 + totalShift);
      const newPrice = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(rawNewPrice * 1e12) / 1e12);

      if (Math.abs(newPrice - currentPrice) >= 1e-12) {
        // Rebalance AMM virtual reserves: x = sqrt(k * P), y = sqrt(k / P)
        const newGameReserve = Math.sqrt(constantK * newPrice);
        const newTokenReserve = Math.sqrt(constantK / newPrice);

        await db('market_coins')
          .where({ symbol })
          .update({
            current_price: newPrice,
            virtual_game_reserve: newGameReserve,
            virtual_token_reserve: newTokenReserve,
            updated_at: new Date(),
          });

        await db('market_price_history').insert({
          coin_symbol: symbol,
          price: newPrice,
          volume: 0,
          timestamp: new Date(),
        });

        momentum.lastTickPrice = newPrice;
      }
    }

    // Stochastic Random Market Events (1.5% chance per 5s tick)
    if (Math.random() < 0.015) {
      await triggerRandomMarketEvent(coins);
    }
  } catch (err) {
    // Silent catch during shutdown
  }
}

// Backward-compatible alias
export const tickMarketPrices = processMarketTick;

export function startMarketTicker() {
  if (marketTickerInterval) return;
  console.log('[Market Engine]: Starting continuous 5-second market ticker loop...');

  marketTickerInterval = setInterval(async () => {
    try {
      await processMarketTick();
    } catch (err) {
      console.error('[Market Ticker Error]:', err);
    }
  }, MARKET_CONFIG.TICK_INTERVAL_MS);
}

/**
 * Random Market News & Narrative Triggers
 */
async function triggerRandomMarketEvent(coins: any[]) {
  try {
    const hasEventsTable = await db.schema.hasTable('market_events');
    if (!hasEventsTable || coins.length === 0) return;

    const randomCoin = coins[Math.floor(Math.random() * coins.length)];
    const symbol = randomCoin.symbol;
    const currentPrice = Number(randomCoin.current_price || MARKET_CONFIG.BASE_PRICE);
    const constantK = Number(randomCoin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);

    const eventTemplates = [
      {
        type: 'COMMUNITY_RALLY',
        title: '⚡ Community Kaufwelle',
        description: `Starkes Interesse in der Player-Community treibt den $${symbol} Kurs an.`,
        minImpact: 0.004,
        maxImpact: 0.012,
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
        title: '🔥 Massive Token Burn Welle',
        description: `Durch hohe Gameplay-Runden wurden $${symbol} Token verbrannt!`,
        minImpact: 0.005,
        maxImpact: 0.015,
      },
      {
        type: 'VIRAL_TREND',
        title: '🚀 Arcade Rekord-Hype',
        description: `Aktuelle Rekordjagd im Minigame verleiht $${symbol} starken Auftrieb.`,
        minImpact: 0.006,
        maxImpact: 0.018,
      },
    ];

    const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
    const impactFactor = template.minImpact + Math.random() * (template.maxImpact - template.minImpact);
    const priceImpactPercent = Math.round(impactFactor * 10000) / 100;

    const newPrice = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(currentPrice * (1 + impactFactor) * 1e12) / 1e12);

    const newGameReserve = Math.sqrt(constantK * newPrice);
    const newTokenReserve = Math.sqrt(constantK / newPrice);

    await db('market_coins')
      .where({ symbol })
      .update({
        current_price: newPrice,
        virtual_game_reserve: newGameReserve,
        virtual_token_reserve: newTokenReserve,
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

    console.log(`[Market Trigger Event]: ${template.title} on $${symbol} -> ${priceImpactPercent >= 0 ? '+' : ''}${priceImpactPercent}%`);
  } catch (err) {
    console.error('[Market Event Trigger Error]:', err);
  }
}

// ============================================================================
// 5. QUERY & REPORTING METHODS
// ============================================================================

export async function getMarketEvents(limit: number = 10): Promise<MarketEvent[]> {
  try {
    const hasEventsTable = await db.schema.hasTable('market_events');
    if (!hasEventsTable) return [];

    const rows = await db('market_events').orderBy('created_at', 'desc').limit(limit);

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

/**
 * Returns full market overview, 24h price changes, AMM pool statistics, dynamic target benchmarks, recent trigger events, user cash balance and portfolio.
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
      const oldHistory = await db('market_price_history')
        .where('coin_symbol', c.symbol)
        .where('timestamp', '>=', twentyFourHoursAgo)
        .orderBy('timestamp', 'asc')
        .first();

      const hourlyHistory = await db('market_price_history')
        .where('coin_symbol', c.symbol)
        .where('timestamp', '>=', oneHourAgo);

      const volume1h = hourlyHistory.reduce((sum: number, h: any) => sum + Number(h.volume || 0), 0);

      const cleanGameId = (c.game_id || '').toLowerCase().trim();
      const stats = await getRollingScoreStatistics(cleanGameId);
      const boostInfo = await calculateDynamicHourlyBoost(c.symbol, stats.benchmarkTarget);

      const oldPrice = oldHistory ? Number(oldHistory.price) : Number(c.base_price || MARKET_CONFIG.BASE_PRICE);
      const currentPrice = Number(c.current_price || MARKET_CONFIG.BASE_PRICE);
      const change24hPercent = oldPrice > 0 ? Math.round(((currentPrice - oldPrice) / oldPrice) * 10000) / 100 : 0;

      return {
        symbol: c.symbol,
        name: c.symbol === 'DOODLE' ? 'Neon Jump Coin' : (c.symbol === 'FLAPPY' ? 'Neon Bird Coin' : c.name),
        gameId: c.game_id,
        currentPrice,
        basePrice: Number(c.base_price || MARKET_CONFIG.BASE_PRICE),
        virtualGameReserve: Number(c.virtual_game_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE),
        virtualTokenReserve: Number(c.virtual_token_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_TOKEN_RESERVE),
        constantProductK: Number(c.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K),
        circulatingSupply: Number(c.circulating_supply || MARKET_CONFIG.INITIAL_VIRTUAL_TOKEN_RESERVE),
        totalBurned: Number(c.total_burned || 0),
        volume24h: Number(c.volume_24h || 0),
        volume1h,
        change24hPercent,
        targetScore: stats.benchmarkTarget,
        hourlyBoost: boostInfo,
        updatedAt: c.updated_at,
      };
    })
  );

  // Guarantee strict canonical order
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
    const curPrice = coinMatch ? coinMatch.currentPrice : MARKET_CONFIG.BASE_PRICE;
    const amount = Number(p.amount);
    const avgBuyPrice = Number(p.avg_buy_price);
    const currentValue = Math.round(amount * curPrice * 10000) / 10000;
    const totalInvested = Math.round(amount * avgBuyPrice * 10000) / 10000;
    const pnlCash = Math.round((currentValue - totalInvested) * 10000) / 10000;
    const pnlPercent =
      totalInvested > 0 ? Math.round(((currentValue - totalInvested) / totalInvested) * 10000) / 100 : 0;

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
 * Uses deterministic fixed time-bucket grouping so past closed candles never mutate.
 */
export async function getCoinChart(coinSymbol: string, timeframe: string = '30m'): Promise<CandlePoint[]> {
  const cleanSymbol = coinSymbol.replace('$', '').toUpperCase();
  const coin = await db('market_coins').where({ symbol: cleanSymbol }).first();
  const currentPrice = coin ? Number(coin.current_price) : MARKET_CONFIG.BASE_PRICE;

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

