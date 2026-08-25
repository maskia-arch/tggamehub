import db from '../database/client';
import { recordUserMarketProfit } from './seasonService';
import { getDynamicGamesList } from '../config/games';

// ============================================================================
// MARKET & AMM CONFIGURATION CONSTANTS
// ============================================================================
export const MARKET_CONFIG = {
  // Initial Pool Parameters
  BASE_PRICE: 0.00000001, // P_0 = 10^-8 Game$
  INITIAL_VIRTUAL_GAME_RESERVE: 100_000.0, // x_0 = 100,000.00 Game$
  INITIAL_VIRTUAL_TOKEN_RESERVE: 10_000_000_000_000.0, // y_0 = 10 Trillion (10^13)
  CONSTANT_PRODUCT_K: 1e18, // k = x_0 * y_0 = 100,000 * 10^13 = 10^18
  MIN_PRICE: 0.00000001, // Strict floor price clamp

  // Normalization Engine
  ROLLING_SCORE_SAMPLE_SIZE: 500, // Rolling window for dynamic mean & standard deviation
  SCORE_IMPACT_FACTOR: 0.0005, // Scaling factor for z-score price impact

  // AMM Trading Parameters
  GAS_FEE_RATE: 0.001, // 0.1% transaction fee
  GAS_FEE_MIN: 0.0005, // Minimum gas fee in Game$
  DEFAULT_MAX_SLIPPAGE_PERCENT: 15.0, // Default 15% slippage protection limit

  // Volatility & Market Dynamics
  PASSIVE_DRIFT_PER_TICK: -0.0001, // Gentle cooling drift per idle tick (5s)
  MOMENTUM_BOOST_PER_STREAK: 0.0002, // +0.02% per consecutive green momentum candle
  MAX_MOMENTUM_STREAK: 5,
  MICRO_SPREAD_NOISE: 0.0002, // ±0.02% orderbook micro-spread noise

  // Whale & Trader Settings
  WHALE_COOLDOWN_MS: 45 * 60 * 1000, // 45 minutes minimum cooldown between whale events per coin

  // Ticker Interval
  TICK_INTERVAL_MS: 5000, // 5-second continuous market tick loop
};

// ============================================================================
// VALUATION TIERS & MARKET MATURITY STAGES
// ============================================================================
export type MarketTier = 'MICRO_NANO' | 'EMERGING' | 'ESTABLISHED_TRADER';

export function getCoinMarketTier(price: number): MarketTier {
  if (price < 0.0001) return 'MICRO_NANO'; // < 0.0001$ : Meme / Nano stage (No institutional traders, rare whales)
  if (price < 0.01) return 'EMERGING';    // 0.0001$ - 0.01$ : Growth / Emerging stage
  return 'ESTABLISHED_TRADER';             // >= 0.01$ : Full Trader Grade (Händler, Orderbook Bots, Market Makers)
}

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
  targetScore: number;
  totalRoundsPlayed: number;
  minScoreThreshold: number;
  basePayoutCash: number;
}

export interface MarketCoinOverview {
  symbol: string;
  name: string;
  gameId: string;
  currentPrice: number;
  basePrice: number;
  marketTier: MarketTier;
  marketTierLabel: string;
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
  inputAmount: number;
  outputAmount: number;
  executionPrice: number;
  priceImpactPercent: number;
  gasFee: number;
  newGameReserve: number;
  newTokenReserve: number;
}

// Canonical Fallback Minigame to Coin mapping (Active Games Only)
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
  lastWhaleEventTime: number;
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
      lastWhaleEventTime: 0,
      peak24hPrice: MARKET_CONFIG.BASE_PRICE,
    };
  }
  return momentumTracker[sym];
}

export function markCoinActivity(coinSymbol: string) {
  const momentum = getCoinMomentum(coinSymbol);
  momentum.lastActivityTime = Date.now();
}

/**
 * Returns dynamic coin info for any game
 */
export async function getCoinInfoForGame(gameId: string): Promise<{ symbol: string; name: string }> {
  const gId = (gameId || '').toLowerCase().trim();
  if (GAME_COIN_MAP[gId]) {
    return GAME_COIN_MAP[gId];
  }
  const allGames = await getDynamicGamesList();
  const game = allGames.find((g) => g.id.toLowerCase() === gId);
  if (game) {
    return {
      symbol: game.coinSymbol || gId.substring(0, 5).toUpperCase(),
      name: `${game.title} Coin`,
    };
  }
  return {
    symbol: gId.substring(0, 5).toUpperCase(),
    name: `${gId.toUpperCase()} Coin`,
  };
}

// ============================================================================
// 1. POOL INITIALIZATION & MANAGEMENT
// ============================================================================

/**
 * Initializes or resets a Coin Pool to exact mandatory parameters
 */
export async function initCoinPool(
  coinSymbol: string,
  initialPrice: number = MARKET_CONFIG.BASE_PRICE,
  initialVirtualGame: number = MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE,
  gameTitle?: string,
  gameIdParam?: string
) {
  const sym = coinSymbol.toUpperCase();
  const safePrice = Math.max(MARKET_CONFIG.MIN_PRICE, initialPrice);
  const safeGameReserve = Math.max(1000.0, initialVirtualGame);
  const tokenReserve = safeGameReserve / safePrice;
  const constantK = safeGameReserve * tokenReserve;

  const defaultName = gameTitle ? `${gameTitle} Coin` : (GAME_COIN_MAP[sym.toLowerCase()]?.name || `${sym} Coin`);
  const gameId = gameIdParam || Object.keys(GAME_COIN_MAP).find((k) => GAME_COIN_MAP[k].symbol === sym) || sym.toLowerCase();

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
    await db('market_coins').insert({
      symbol: sym,
      name: defaultName,
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

  console.log(`[Market Engine]: Initialized pool for $${sym} (P0=${safePrice}, x0=${safeGameReserve}, y0=${tokenReserve})`);
}

/**
 * Auto-initializes market coins ONLY for active, published games in the Hub.
 * Unreleased or hidden games do not have a coin yet and are pruned from market_coins.
 */
export async function ensureAllGameCoinsInitialized() {
  try {
    const hasTable = await db.schema.hasTable('market_coins');
    if (!hasTable) return;

    const allGames = await getDynamicGamesList();
    const activeGames = allGames.filter((g) => g.status === 'active' && !g.hidden);
    const activeSymbols = activeGames.map((g) => g.coinSymbol.toUpperCase());

    // Prune coins from unreleased or hidden games
    if (activeSymbols.length > 0) {
      await db('market_coins').whereNotIn('symbol', activeSymbols).del();
    }

    for (const game of activeGames) {
      const sym = game.coinSymbol.toUpperCase();
      const existing = await db('market_coins').where({ symbol: sym }).first();
      if (!existing) {
        await initCoinPool(sym, MARKET_CONFIG.BASE_PRICE, MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE, `${game.title} Coin`, game.id);
      }
    }
  } catch (err) {
    console.warn('[Market Engine]: Note during auto-coin initialization:', err);
  }
}

// ============================================================================
// 2. NORMALIZED SCORE-IMPACT & 1:1 EXACT SCORE BURN ENGINE
// ============================================================================

/**
 * Computes rolling mean (μ) and standard deviation (σ) over the last 500 runs for a given minigame.
 */
export async function getRollingScoreStatistics(gameId: string): Promise<GameScoreStatistics> {
  const cleanGameId = (gameId || '').toLowerCase().trim();
  const coinMapping = await getCoinInfoForGame(cleanGameId);

  // Cold-start baseline fallback
  const fallbackBaselines: Record<string, { mean: number; stdDev: number }> = {
    doodlejump: { mean: 120, stdDev: 50 },
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
        targetScore: baseline.mean,
        benchmarkTarget: baseline.mean,
        totalRoundsPlayed: 0,
        minScoreThreshold: Math.max(1, Math.round(baseline.mean * 0.5)),
        basePayoutCash: 0.05,
      };
    }

    const recentScores = await db('scores')
      .where({ game_id: cleanGameId })
      .select('score')
      .orderBy('id', 'desc')
      .limit(MARKET_CONFIG.ROLLING_SCORE_SAMPLE_SIZE);

    const sampleSize = recentScores.length;
    if (sampleSize === 0) {
      return {
        gameId: cleanGameId,
        symbol: coinMapping.symbol,
        name: coinMapping.name,
        mean: baseline.mean,
        stdDev: baseline.stdDev,
        sampleSize: 0,
        targetScore: baseline.mean,
        benchmarkTarget: baseline.mean,
        totalRoundsPlayed: 0,
        minScoreThreshold: Math.max(1, Math.round(baseline.mean * 0.5)),
        basePayoutCash: 0.05,
      };
    }

    const scoresArray = recentScores.map((s: any) => Number(s.score || 0));
    const mean = scoresArray.reduce((sum, val) => sum + val, 0) / sampleSize;

    const variance =
      sampleSize > 1
        ? scoresArray.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (sampleSize - 1)
        : Math.pow(baseline.stdDev, 2);
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
      targetScore: benchmarkTarget,
      benchmarkTarget,
      totalRoundsPlayed: sampleSize,
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
      targetScore: baseline.mean,
      benchmarkTarget: baseline.mean,
      totalRoundsPlayed: 0,
      minScoreThreshold: Math.max(1, Math.round(baseline.mean * 0.5)),
      basePayoutCash: 0.05,
    };
  }
}

export const getDynamicGameBenchmark = getRollingScoreStatistics;

/**
 * Dynamically computes hourly coin market boosts
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
    const hasScoresTable = await db.schema.hasTable('scores');
    if (!hasScoresTable) {
      return {
        tier: 'NONE',
        label: 'Kein Boost',
        multiplier: 1.0,
        hourlyPoints: 0,
        hourlyRounds: 0,
        difficultyFactor: 1.0,
        nextTierTarget: 100,
        nextTierTargetPoints: benchmarkScore * 100,
        nextTierLabel: 'Bronze',
        progressPercent: 0,
      };
    }

    const gameKey = Object.keys(GAME_COIN_MAP).find(
      (k) => GAME_COIN_MAP[k].symbol.toUpperCase() === coinSymbol.toUpperCase()
    ) || coinSymbol.toLowerCase();

    // 1. Hourly scores in the last 60 minutes
    const hourlyScores = await db('scores')
      .where({ game_id: gameKey })
      .where('created_at', '>=', oneHourAgo)
      .select('score');

    const rawHourlyRounds = hourlyScores.length + extraRounds;
    const rawHourlyPoints = hourlyScores.reduce((acc, row) => acc + Number(row.score || 0), 0);

    // 2. 4h Moving Average baseline
    const baselineScores = await db('scores')
      .where({ game_id: gameKey })
      .where('created_at', '>=', fourHoursAgo)
      .where('created_at', '<', oneHourAgo)
      .select('score');

    const baseline4hCount = baselineScores.length;
    const baselinePerHour = Math.max(10, Math.round(baseline4hCount / 3));

    // Dynamic Difficulty Factor
    const difficultyFactor = Math.max(1.0, Math.min(4.0, baselinePerHour / 30));

    // Scaled Tier Thresholds (Normalized points relative to benchmark)
    const TIER_THRESHOLDS = {
      BRONZE: Math.round(25 * difficultyFactor),
      SILBER: Math.round(75 * difficultyFactor),
      GOLD: Math.round(175 * difficultyFactor),
      PLATIN: Math.round(350 * difficultyFactor),
    };

    const effectiveScoreEquivalent = benchmarkScore > 0 ? rawHourlyPoints / benchmarkScore : rawHourlyRounds;

    let tier: DynamicHourlyBoost['tier'] = 'NONE';
    let label = 'Normaler Markt';
    let multiplier = 1.0;
    let nextTierTarget = TIER_THRESHOLDS.BRONZE;
    let nextTierLabel = 'Bronze Boost (1.25x)';

    if (effectiveScoreEquivalent >= TIER_THRESHOLDS.PLATIN) {
      tier = 'PLATIN';
      label = 'Platin Hype (2.50x)';
      multiplier = 2.5;
      nextTierTarget = TIER_THRESHOLDS.PLATIN;
      nextTierLabel = 'Maximaler Boost erreicht';
    } else if (effectiveScoreEquivalent >= TIER_THRESHOLDS.GOLD) {
      tier = 'GOLD';
      label = 'Gold Rallye (1.80x)';
      multiplier = 1.8;
      nextTierTarget = TIER_THRESHOLDS.PLATIN;
      nextTierLabel = 'Platin Boost (2.50x)';
    } else if (effectiveScoreEquivalent >= TIER_THRESHOLDS.SILBER) {
      tier = 'SILBER';
      label = 'Silber Trend (1.50x)';
      multiplier = 1.5;
      nextTierTarget = TIER_THRESHOLDS.GOLD;
      nextTierLabel = 'Gold Boost (1.80x)';
    } else if (effectiveScoreEquivalent >= TIER_THRESHOLDS.BRONZE) {
      tier = 'BRONZE';
      label = 'Bronze Surge (1.25x)';
      multiplier = 1.25;
      nextTierTarget = TIER_THRESHOLDS.SILBER;
      nextTierLabel = 'Silber Boost (1.50x)';
    }

    const progressPercent = Math.min(100, Math.round((effectiveScoreEquivalent / nextTierTarget) * 100));

    return {
      tier,
      label,
      multiplier,
      hourlyPoints: rawHourlyPoints,
      hourlyRounds: rawHourlyRounds,
      difficultyFactor: Math.round(difficultyFactor * 100) / 100,
      nextTierTarget,
      nextTierTargetPoints: Math.round(nextTierTarget * benchmarkScore),
      nextTierLabel,
      progressPercent,
    };
  } catch (err) {
    return {
      tier: 'NONE',
      label: 'Kein Boost',
      multiplier: 1.0,
      hourlyPoints: 0,
      hourlyRounds: 0,
      difficultyFactor: 1.0,
      nextTierTarget: 100,
      nextTierTargetPoints: 10000,
      nextTierLabel: 'Bronze',
      progressPercent: 0,
    };
  }
}

/**
 * Processes game score completion with EXACT 1:1 score burning (1 Point = 1 Token Burned)
 * and Z-score scaled AMM price impact.
 */
export async function processGameScoreAmmImpact(
  gameId: string,
  score: number,
  userId?: string,
  tokensBurnedParam?: number
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
  const stdDev = stats.stdDev;
  const targetScore = stats.targetScore;
  const minScoreThreshold = stats.minScoreThreshold;
  const totalRoundsPlayed = stats.totalRoundsPlayed;

  const zScore = Math.round(((score - mean) / stdDev) * 100) / 100;
  const performanceRatio = Math.round((score / Math.max(1, targetScore)) * 100) / 100;

  // InGame$ Cash Payout
  let earnedCash = 0.0;
  if (score > 0) {
    const rawCash = stats.basePayoutCash * Math.min(3.0, Math.pow(Math.max(0.1, performanceRatio), 0.85));
    earnedCash = Math.min(0.2, Math.max(0.0001, Math.round(rawCash * 10000) / 10000));
  }

  const coinMapping = await getCoinInfoForGame(cleanGameId);
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
    let coin = await db('market_coins').where({ symbol: coinSymbol }).first();
    if (!coin) {
      await initCoinPool(coinSymbol, MARKET_CONFIG.BASE_PRICE, MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE, coinMapping.name, cleanGameId);
      coin = await db('market_coins').where({ symbol: coinSymbol }).first();
    }
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

    // Hourly boost
    const boostInfo = await calculateDynamicHourlyBoost(coinSymbol, targetScore, 1);
    const boostMultiplier = boostInfo.multiplier;

    // Check for Record Break
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
        impulseBonusPercent = 0.08; // +8% All-Time High Spike
      } else if (userMax > 0 && score > userMax && zScore >= 1.5) {
        isRecordBreak = true;
        impulseBonusPercent = 0.04; // +4% Personal Highscore Spike
      }
    }

    // ── EXACT 1:1 SCORE TOKEN BURN ──────────────────────────────────────────
    // Every point scored permanently burns exactly 1 coin from the circulating pool!
    const burnedTokens = tokensBurnedParam !== undefined ? Math.max(1, tokensBurnedParam) : Math.max(1, Math.round(score));

    const newSupply = Math.max(1000.0, circulatingSupply - burnedTokens);
    const newTotalBurned = Math.round((Number(coin.total_burned || 0) + burnedTokens) * 100) / 100;
    const newVolume24h = Math.round((Number(coin.volume_24h || 0) + score) * 100) / 100;

    // Normalized Score-to-Market Price Impact
    const isPositiveImpact = zScore >= 0;
    let deltaScore = 0.0;

    if (isPositiveImpact) {
      deltaScore = MARKET_CONFIG.SCORE_IMPACT_FACTOR * Math.log(1 + 2 * Math.max(0.1, zScore)) * boostMultiplier;
    } else {
      const penalty = 0.0002 * Math.min(1.5, Math.pow(Math.abs(zScore), 1.1));
      deltaScore = -penalty;
    }

    const totalPriceShift = deltaScore + impulseBonusPercent;
    const rawNewPrice = currentPrice * (1 + totalPriceShift);
    const newPrice = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(rawNewPrice * 1e12) / 1e12);
    const priceChangePercent = Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100;

    // Rebalance AMM virtual reserves: x = sqrt(k * P), y = sqrt(k / P)
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

    await db('market_price_history').insert({
      coin_symbol: coinSymbol,
      price: newPrice,
      volume: score,
      timestamp: new Date(),
    });

    if (isRecordBreak) {
      await db('market_events').insert({
        coin_symbol: coinSymbol,
        event_type: 'HIGHSCORE_RECORD_BREAK',
        title: '🚀 NEUER HIGHSCORE-REKORD!',
        description: `Ein Spieler erzielte ${score.toLocaleString()} Punkte! Exakt ${burnedTokens.toLocaleString()} $${coinSymbol} dauerhaft verbrannt! Kurs +${(impulseBonusPercent * 100).toFixed(1)}%!`,
        price_impact_percent: Math.round(impulseBonusPercent * 10000) / 100,
        created_at: new Date(),
      });
    } else if (isPositiveImpact && (burnedTokens >= 200 || Math.abs(priceChangePercent) >= 0.01)) {
      await db('market_events').insert({
        coin_symbol: coinSymbol,
        event_type: 'GAMEPLAY_TOKEN_BURN',
        title: '🔥 Token Burn Rallye',
        description: `Starke Runde mit ${score.toLocaleString()} Punkten! Exakt ${burnedTokens.toLocaleString()} $${coinSymbol} unwiderruflich verbrannt.`,
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
      totalRoundsPlayed,
      isPositiveImpact,
      isRecordBreak,
      priceChangePercent,
    };
  } catch (err) {
    console.error(`[Market Engine]: Error processing score AMM impact for ${cleanGameId}:`, err);
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

// ============================================================================
// 3. AMM TRADING ENGINE (BUY & SELL)
// ============================================================================

export function calculateAmmBuy(
  amountInCash: number,
  virtualGameReserve: number,
  virtualTokenReserve: number,
  constantK: number,
  gasFeeRate: number = MARKET_CONFIG.GAS_FEE_RATE,
  gasFeeMin: number = MARKET_CONFIG.GAS_FEE_MIN
): AmmTradeCalculation {
  const rawGasFee = amountInCash * gasFeeRate;
  const gasFee = Math.max(gasFeeMin, Math.round(rawGasFee * 10000) / 10000);
  const netCashIn = Math.max(0.0001, amountInCash - gasFee);

  const newGameReserve = virtualGameReserve + netCashIn;
  const newTokenReserve = constantK / newGameReserve;
  const tokensOut = Math.max(0, virtualTokenReserve - newTokenReserve);

  const initialSpotPrice = virtualGameReserve / virtualTokenReserve;
  const executionPrice = netCashIn / tokensOut;
  const priceImpactPercent = Math.round(((executionPrice - initialSpotPrice) / initialSpotPrice) * 10000) / 100;

  return {
    tradeType: 'BUY',
    inputAmount: amountInCash,
    outputAmount: tokensOut,
    executionPrice,
    priceImpactPercent,
    gasFee,
    newGameReserve,
    newTokenReserve,
  };
}

export function calculateAmmSell(
  amountInTokens: number,
  virtualGameReserve: number,
  virtualTokenReserve: number,
  constantK: number,
  gasFeeRate: number = MARKET_CONFIG.GAS_FEE_RATE,
  gasFeeMin: number = MARKET_CONFIG.GAS_FEE_MIN
): AmmTradeCalculation {
  const newTokensReserve = virtualTokenReserve + amountInTokens;
  const newGameReserve = constantK / newTokensReserve;
  const rawCashOut = Math.max(0, virtualGameReserve - newGameReserve);

  const rawGasFee = rawCashOut * gasFeeRate;
  const gasFee = Math.max(gasFeeMin, Math.round(rawGasFee * 10000) / 10000);
  const netCashOut = Math.max(0, rawCashOut - gasFee);

  const initialSpotPrice = virtualGameReserve / virtualTokenReserve;
  const executionPrice = rawCashOut / amountInTokens;
  const priceImpactPercent = Math.round(((initialSpotPrice - executionPrice) / initialSpotPrice) * 10000) / 100;

  return {
    tradeType: 'SELL',
    inputAmount: amountInTokens,
    outputAmount: netCashOut,
    executionPrice,
    priceImpactPercent: -Math.abs(priceImpactPercent),
    gasFee,
    newGameReserve,
    newTokenReserve: newTokensReserve,
  };
}

export interface TradeExecutionResult {
  success: boolean;
  message?: string;
  tokensAcquired: number;
  tokensSold: number;
  totalCashSpent: number;
  cashReceived: number;
  netCashReceived: number;
  newCashBalance: number;
  trade?: any;
}

export async function executeAmmTrade(
  userId: string,
  coinSymbol: string,
  tradeType: 'BUY' | 'SELL',
  amount: number,
  maxSlippagePercent: number = MARKET_CONFIG.DEFAULT_MAX_SLIPPAGE_PERCENT
): Promise<TradeExecutionResult> {
  const sym = coinSymbol.toUpperCase();
  const momentum = getCoinMomentum(sym);

  const cleanUserId = userId.startsWith('guest_') ? 'guest_session' : userId;

  return await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: cleanUserId }).first();
    if (!user) {
      throw new Error('Benutzerkonto nicht gefunden.');
    }

    const coin = await trx('market_coins').where({ symbol: sym }).first();
    if (!coin) {
      throw new Error(`Coin $${sym} existiert nicht.`);
    }

    const virtualGame = Number(coin.virtual_game_reserve);
    const virtualToken = Number(coin.virtual_token_reserve);
    const constantK = Number(coin.constant_product_k);

    let calc: AmmTradeCalculation;

    if (tradeType === 'BUY') {
      const userCash = Number(user.game_cash || 0);
      if (userCash < amount) {
        throw new Error(`Unzureichendes InGame-$ Guthaben. Verfügbar: $${userCash.toFixed(2)}`);
      }

      calc = calculateAmmBuy(amount, virtualGame, virtualToken, constantK);
      if (Math.abs(calc.priceImpactPercent) > maxSlippagePercent) {
        throw new Error(`Slippage (${calc.priceImpactPercent.toFixed(2)}%) übersteigt Limit (${maxSlippagePercent}%).`);
      }

      // Deduct cash, credit tokens
      await trx('users').where({ id: cleanUserId }).decrement('game_cash', amount);

      const holding = await trx('user_portfolios')
        .where({ user_id: cleanUserId, coin_symbol: sym })
        .first();

      if (holding) {
        const oldAmount = Number(holding.amount);
        const oldInvested = Number(holding.total_invested || 0);
        const newAmount = oldAmount + calc.outputAmount;
        const newInvested = oldInvested + amount;
        const newAvg = newAmount > 0 ? newInvested / newAmount : calc.executionPrice;

        await trx('user_portfolios')
          .where({ user_id: cleanUserId, coin_symbol: sym })
          .update({
            amount: newAmount,
            avg_buy_price: newAvg,
            total_invested: newInvested,
            updated_at: new Date(),
          });
      } else {
        await trx('user_portfolios').insert({
          user_id: cleanUserId,
          coin_symbol: sym,
          amount: calc.outputAmount,
          avg_buy_price: calc.executionPrice,
          total_invested: amount,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      momentum.consecutiveBuys += 1;
      momentum.consecutiveSells = 0;
    } else {
      const holding = await trx('user_portfolios')
        .where({ user_id: cleanUserId, coin_symbol: sym })
        .first();

      const userTokens = Number(holding?.amount || 0);
      if (userTokens < amount) {
        throw new Error(`Unzureichende $${sym} Token. Verfügbar: ${userTokens.toLocaleString()}`);
      }

      calc = calculateAmmSell(amount, virtualGame, virtualToken, constantK);
      if (Math.abs(calc.priceImpactPercent) > maxSlippagePercent) {
        throw new Error(`Slippage (${Math.abs(calc.priceImpactPercent).toFixed(2)}%) übersteigt Limit (${maxSlippagePercent}%).`);
      }

      // Credit cash, deduct tokens
      await trx('users').where({ id: cleanUserId }).increment('game_cash', calc.outputAmount);

      const remainingTokens = userTokens - amount;
      const oldInvested = Number(holding.total_invested || 0);
      const soldRatio = userTokens > 0 ? amount / userTokens : 1;
      const costBasisSold = oldInvested * soldRatio;
      const netProfit = calc.outputAmount - costBasisSold;

      if (remainingTokens <= 0.000001) {
        await trx('user_portfolios').where({ user_id: cleanUserId, coin_symbol: sym }).del();
      } else {
        await trx('user_portfolios')
          .where({ user_id: cleanUserId, coin_symbol: sym })
          .update({
            amount: remainingTokens,
            total_invested: Math.max(0, oldInvested - costBasisSold),
            updated_at: new Date(),
          });
      }

      if (netProfit > 0 && !cleanUserId.startsWith('guest_')) {
        await recordUserMarketProfit(cleanUserId, netProfit);
      }

      momentum.consecutiveSells += 1;
      momentum.consecutiveBuys = 0;
    }

    // Update Coin Spot Price
    const newSpotPrice = Math.max(MARKET_CONFIG.MIN_PRICE, calc.newGameReserve / calc.newTokenReserve);
    const roundedPrice = Math.round(newSpotPrice * 1e12) / 1e12;

    await trx('market_coins')
      .where({ symbol: sym })
      .update({
        current_price: roundedPrice,
        virtual_game_reserve: calc.newGameReserve,
        virtual_token_reserve: calc.newTokenReserve,
        volume_24h: Number(coin.volume_24h || 0) + (tradeType === 'BUY' ? amount : calc.outputAmount),
        updated_at: new Date(),
      });

    // Record trade in user_trades
    const [tradeId] = await trx('user_trades').insert({
      user_id: cleanUserId,
      coin_symbol: sym,
      trade_type: tradeType,
      amount_tokens: tradeType === 'BUY' ? calc.outputAmount : amount,
      price_per_token: calc.executionPrice,
      total_cash: tradeType === 'BUY' ? amount : calc.outputAmount,
      gas_fee: calc.gasFee,
      price_impact_percent: calc.priceImpactPercent,
      created_at: new Date(),
    });

    await trx('market_price_history').insert({
      coin_symbol: sym,
      price: roundedPrice,
      volume: tradeType === 'BUY' ? amount : calc.outputAmount,
      timestamp: new Date(),
    });

    markCoinActivity(sym);

    const userRow = await trx('users').where({ id: cleanUserId }).first();
    const newCashBalance = Number(userRow?.game_cash || 0);

    return {
      success: true,
      tokensAcquired: tradeType === 'BUY' ? Math.round(calc.outputAmount * 100) / 100 : 0,
      tokensSold: tradeType === 'SELL' ? Math.round(amount * 100) / 100 : 0,
      totalCashSpent: tradeType === 'BUY' ? amount : 0,
      cashReceived: tradeType === 'SELL' ? calc.outputAmount : 0,
      netCashReceived: tradeType === 'SELL' ? calc.outputAmount : 0,
      newCashBalance,
      trade: {
        id: tradeId,
        tradeType,
        coinSymbol: sym,
        amountIn: amount,
        amountOut: calc.outputAmount,
        executionPrice: calc.executionPrice,
        newPrice: roundedPrice,
        priceImpactPercent: calc.priceImpactPercent,
        gasFee: calc.gasFee,
      },
    };
  });
}

// ============================================================================
// 4. TICK-BASED PRICE AGGREGATOR & VALUATION-TIER VOLATILITY
// ============================================================================

/**
 * Composite Market Update Tick with valuation-tier-aware dynamics
 */
export async function processMarketTick() {
  try {
    const allGames = await getDynamicGamesList();
    const activeSymbols = allGames.filter((g) => g.status === 'active' && !g.hidden).map((g) => g.coinSymbol.toUpperCase());
    if (activeSymbols.length === 0) return;

    const coins = await db('market_coins').whereIn('symbol', activeSymbols);
    if (!coins || coins.length === 0) return;
    const now = Date.now();

    for (const coin of coins) {
      const symbol = coin.symbol;
      const currentPrice = Number(coin.current_price || MARKET_CONFIG.BASE_PRICE);
      const basePrice = Number(coin.base_price || MARKET_CONFIG.BASE_PRICE);
      const constantK = Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);
      const tier = getCoinMarketTier(currentPrice);

      const momentum = getCoinMomentum(symbol);
      const secondsSinceActivity = (now - momentum.lastActivityTime) / 1000;

      // 1. Orderbook Micro-Spread Noise (only active when volume exists)
      const noiseMagnitude = tier === 'ESTABLISHED_TRADER' ? MARKET_CONFIG.MICRO_SPREAD_NOISE : MARKET_CONFIG.MICRO_SPREAD_NOISE * 0.4;
      const microNoise = (Math.random() * 2 - 1) * noiseMagnitude;

      // 2. Momentum / Streak Booster
      let deltaMomentum = 0.0;
      if (momentum.consecutiveBuys > 0) {
        const streak = Math.min(MARKET_CONFIG.MAX_MOMENTUM_STREAK, momentum.consecutiveBuys);
        deltaMomentum = streak * MARKET_CONFIG.MOMENTUM_BOOST_PER_STREAK;
      }

      // 3. Passive Mean Reversion / Cooling Drift
      let drift = 0.0;
      if (secondsSinceActivity > 45) {
        const deviationRatio = (currentPrice - basePrice) / Math.max(1e-8, basePrice);
        drift = MARKET_CONFIG.PASSIVE_DRIFT_PER_TICK * Math.sign(deviationRatio) * Math.min(1.5, Math.abs(deviationRatio));
      }

      // 4. VALUATION-TIER-AWARE WHALE DYNAMICS (Realistic & Cooldown Protected)
      let whaleShift = 0.0;
      const timeSinceLastWhale = now - (momentum.lastWhaleEventTime || 0);

      if (timeSinceLastWhale >= MARKET_CONFIG.WHALE_COOLDOWN_MS) {
        const surgeFromBase = (currentPrice - basePrice) / basePrice;

        if (tier === 'ESTABLISHED_TRADER') {
          // Tier 3 (>= 0.01$): Established Asset - Whales do realistic rebalancing on surges >= +50%
          if (surgeFromBase >= 0.50 && Math.random() < 0.003) {
            const dumpPercent = 0.04 + Math.random() * 0.05; // -4% to -9% healthy pullback
            whaleShift = -dumpPercent;
            momentum.lastWhaleEventTime = now;

            await db('market_events').insert({
              coin_symbol: symbol,
              event_type: 'WHALE_REBALANCE',
              title: '🐋 Whale Portfolio-Umschichtung',
              description: `Ein Großinvestor realisiert Gewinne bei $${symbol}. Gesunde Konsolidierung um -${(dumpPercent * 100).toFixed(1)}%.`,
              price_impact_percent: Math.round(-dumpPercent * 10000) / 100,
              created_at: new Date(),
            });
            console.log(`[Market Tick]: Whale Rebalance on $${symbol} (-${(dumpPercent * 100).toFixed(1)}%)`);
          }
        } else if (tier === 'EMERGING') {
          // Tier 2 (0.0001$ - 0.01$): Emerging Coin - Whales are rare (0.1% chance) and only on large surges >= +100%
          if (surgeFromBase >= 1.00 && Math.random() < 0.001) {
            const dumpPercent = 0.03 + Math.random() * 0.04; // -3% to -7% moderate pullback
            whaleShift = -dumpPercent;
            momentum.lastWhaleEventTime = now;

            await db('market_events').insert({
              coin_symbol: symbol,
              event_type: 'WHALE_TAKE_PROFIT',
              title: '🐋 Whale Gewinnmitnahme',
              description: `Nach Verdopplung des Kurses nimmt ein früher Wal bei $${symbol} Teilgewinne mit (-${(dumpPercent * 100).toFixed(1)}%).`,
              price_impact_percent: Math.round(-dumpPercent * 10000) / 100,
              created_at: new Date(),
            });
            console.log(`[Market Tick]: Whale Take-Profit on $${symbol} (-${(dumpPercent * 100).toFixed(1)}%)`);
          }
        } else {
          // Tier 1 (< 0.0001$): Micro-Meme Coin - Extremely rare (0.03% chance) and only on massive +200% rally
          if (surgeFromBase >= 2.00 && Math.random() < 0.0003) {
            const dumpPercent = 0.02 + Math.random() * 0.03; // -2% to -5% gentle community take-profit
            whaleShift = -dumpPercent;
            momentum.lastWhaleEventTime = now;

            await db('market_events').insert({
              coin_symbol: symbol,
              event_type: 'COMMUNITY_PROFIT_TAKE',
              title: '🌾 Frühe Gamer Gewinnmitnahme',
              description: `Nach starkem Hype sichern sich einige frühe Spieler Ingame-$ (-${(dumpPercent * 100).toFixed(1)}%).`,
              price_impact_percent: Math.round(-dumpPercent * 10000) / 100,
              created_at: new Date(),
            });
            console.log(`[Market Tick]: Micro Take-Profit on $${symbol} (-${(dumpPercent * 100).toFixed(1)}%)`);
          }
        }
      }

      // Composite Price Formula
      const totalShift = deltaMomentum + drift + whaleShift + microNoise;
      const rawNewPrice = currentPrice * (1 + totalShift);
      const newPrice = Math.max(MARKET_CONFIG.MIN_PRICE, Math.round(rawNewPrice * 1e12) / 1e12);

      if (Math.abs(newPrice - currentPrice) >= 1e-12) {
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

    // Stochastic Random Market Events (1% chance per 5s tick)
    if (Math.random() < 0.01) {
      await triggerRandomMarketEvent(coins);
    }
  } catch (err) {
    // Silent catch
  }
}

export const tickMarketPrices = processMarketTick;

export function startMarketTicker() {
  if (marketTickerInterval) return;
  console.log('[Market Engine]: Starting continuous 5-second market ticker loop...');

  // Also auto-initialize coins for any registered games
  ensureAllGameCoinsInitialized();

  marketTickerInterval = setInterval(async () => {
    try {
      await processMarketTick();
    } catch (err) {
      console.error('[Market Ticker Error]:', err);
    }
  }, MARKET_CONFIG.TICK_INTERVAL_MS);
}

// ============================================================================
// 5. VALUATION-TIER-AWARE NARRATIVE & RANDOM EVENT ENGINE
// ============================================================================

/**
 * Generates realistic, tier-appropriate narrative market events
 */
async function triggerRandomMarketEvent(coins: any[]) {
  try {
    const hasEventsTable = await db.schema.hasTable('market_events');
    if (!hasEventsTable || coins.length === 0) return;

    const randomCoin = coins[Math.floor(Math.random() * coins.length)];
    const symbol = randomCoin.symbol;
    const currentPrice = Number(randomCoin.current_price || MARKET_CONFIG.BASE_PRICE);
    const constantK = Number(randomCoin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);
    const tier = getCoinMarketTier(currentPrice);

    interface EventTemplate {
      type: string;
      title: string;
      description: string;
      minImpact: number;
      maxImpact: number;
    }

    let eventTemplates: EventTemplate[] = [];

    if (tier === 'MICRO_NANO') {
      // Tier 1: Micro / Meme Coins (< 0.0001$) - Community, Gameplay & Viral Trends (NO "Händler")
      eventTemplates = [
        {
          type: 'COMMUNITY_RAID',
          title: '⚡ Community Kaufwelle',
          description: `Zahlreiche Spieler entdecken $${symbol} im Telegram Minigame-Hub!`,
          minImpact: 0.008,
          maxImpact: 0.025,
        },
        {
          type: 'GAMEPLAY_RUSH',
          title: '🎮 Highscore-Welle',
          description: `Intensive Spielrunden verbrennen $${symbol} Token und treiben den Kurs.`,
          minImpact: 0.006,
          maxImpact: 0.020,
        },
        {
          type: 'VIRAL_MEME',
          title: '🚀 Telegram Hype',
          description: `Ein viraler Screenshot der Rangliste sorgt für Begeisterung bei $${symbol}.`,
          minImpact: 0.010,
          maxImpact: 0.035,
        },
        {
          type: 'COMMUNITY_COOLING',
          title: '💤 Spielpause',
          description: `Kurze Verschnaufpause der Spieler nach ausgiebigen Highscore-Versuchen.`,
          minImpact: -0.012,
          maxImpact: -0.004,
        },
        {
          type: 'EARLY_FARMER_EXIT',
          title: '🌾 Früh-Farmer Auszahlung',
          description: `Einige frühe Spieler tauschen erwirtschaftete $${symbol} in Game$ ein.`,
          minImpact: -0.015,
          maxImpact: -0.005,
        },
        {
          type: 'MICRO_WHALE_ACCUMULATE',
          title: '💎 Diamant-Hände Akkumulation',
          description: `Ein engagierter Community-Member stockt seine $${symbol} Bestände auf.`,
          minImpact: 0.020,
          maxImpact: 0.045,
        },
      ];
    } else if (tier === 'EMERGING') {
      // Tier 2: Emerging Growth Coins (0.0001$ - 0.01$) - Volume, Tournaments & Deflation
      eventTemplates = [
        {
          type: 'VOLUME_BREAKOUT',
          title: '📈 Volumen-Ausbruch',
          description: `Das 24h-Handelsvolumen von $${symbol} erreicht ein neues Wochenhoch!`,
          minImpact: 0.015,
          maxImpact: 0.035,
        },
        {
          type: 'TOURNAMENT_FEVER',
          title: '🏆 Turnier-Fieber',
          description: `Der aktuelle Community-Wettkampf lässt die Verbrennungsrate von $${symbol} ansteigen.`,
          minImpact: 0.020,
          maxImpact: 0.045,
        },
        {
          type: 'DEFLATIONARY_BURN',
          title: '🔥 Massive Verbrennung',
          description: `Rekord-Highscores reduzieren das zirkulierende Angebot von $${symbol} merklich.`,
          minImpact: 0.012,
          maxImpact: 0.030,
        },
        {
          type: 'MOMENTUM_PULLBACK',
          title: '📉 Gesunde Konsolidierung',
          description: `Nach starkem Aufwärtstrend konsolidiert $${symbol} auf hohem Niveau.`,
          minImpact: -0.020,
          maxImpact: -0.008,
        },
        {
          type: 'COMMUNITY_FUD',
          title: '📰 Marktdiskussion',
          description: `Spekulationen über neue Spiel-Updates führen zu kurzzeitigen Gewinnmitnahmen.`,
          minImpact: -0.025,
          maxImpact: -0.010,
        },
        {
          type: 'WHALE_ACCUMULATION',
          title: '🐋 Wal-Akkumulation',
          description: `Ein Krypto-Wal kauft kontinuierlich Positionen im $${symbol} AMM Pool.`,
          minImpact: 0.030,
          maxImpact: 0.060,
        },
      ];
    } else {
      // Tier 3: Established Trader Assets (>= 0.01$) - Professional Händler, Algo-Bots & Orderbooks
      eventTemplates = [
        {
          type: 'ALGO_TRADER_BUY',
          title: '🤖 Händler-Algorithmus Kaufwelle',
          description: `Automatisierte Trading-Bots und professionelle Händler lösen Kaufsignale bei $${symbol} aus.`,
          minImpact: 0.012,
          maxImpact: 0.032,
        },
        {
          type: 'MARKET_MAKER_SPREAD',
          title: '📊 Market Maker Liquiditäts-Optimierung',
          description: `Professionelle Liquiditätsanbieter straffen die Spreads im $${symbol} Orderbuch.`,
          minImpact: 0.008,
          maxImpact: 0.022,
        },
        {
          type: 'INSTITUTIONAL_INFLOW',
          title: '💼 Institutioneller Kapitalzufluss',
          description: `Größere Investoren und Trading-Desks allokieren Kapital in $${symbol}.`,
          minImpact: 0.025,
          maxImpact: 0.055,
        },
        {
          type: 'TRADER_PROFIT_TAKING',
          title: '📉 Händler Gewinnmitnahmen',
          description: `Day-Trader und Swing-Händler schließen Long-Positionen an wichtigen Widerständen.`,
          minImpact: -0.028,
          maxImpact: -0.010,
        },
        {
          type: 'LIQUIDATION_SQUEEZE',
          title: '⚡ Short-Squeeze Rallye',
          description: `Ein plötzlicher Preissprung zwingt Short-Positionen zur Eindeckung bei $${symbol}!`,
          minImpact: 0.035,
          maxImpact: 0.070,
        },
        {
          type: 'WHALE_DISTRIBUTION',
          title: '🐋 Wal Limit-Verkauf',
          description: `Ein Großanleger platziert dosierte Verkaufsaufträge zur Portfolio-Diversifikation.`,
          minImpact: -0.030,
          maxImpact: -0.012,
        },
      ];
    }

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

    console.log(`[Market Trigger Event (${tier})]: ${template.title} on $${symbol} -> ${priceImpactPercent >= 0 ? '+' : ''}${priceImpactPercent}%`);

    try {
      const { checkAndSendPortfolioAlerts } = require('./notificationService');
      await checkAndSendPortfolioAlerts(symbol, priceImpactPercent, newPrice);
    } catch (notifErr) {}
  } catch (err) {
    console.error('[Market Event Trigger Error]:', err);
  }
}

// ============================================================================
// 6. QUERY & REPORTING METHODS
// ============================================================================

export async function getAllMarketCoins(): Promise<MarketCoinOverview[]> {
  try {
    const hasTable = await db.schema.hasTable('market_coins');
    if (!hasTable) return [];

    await ensureAllGameCoinsInitialized();

    const allGames = await getDynamicGamesList();
    const activeGames = allGames.filter((g) => g.status === 'active' && !g.hidden);
    const activeSymbols = activeGames.map((g) => g.coinSymbol.toUpperCase());
    if (activeSymbols.length === 0) return [];

    const coins = await db('market_coins').whereIn('symbol', activeSymbols);
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);

    const result: MarketCoinOverview[] = [];

    for (const coin of coins) {
      const symbol = coin.symbol;
      const currentPrice = Number(coin.current_price || MARKET_CONFIG.BASE_PRICE);
      const basePrice = Number(coin.base_price || MARKET_CONFIG.BASE_PRICE);
      const tier = getCoinMarketTier(currentPrice);

      const tierLabels: Record<MarketTier, string> = {
        MICRO_NANO: '🌱 Nano / Meme Coin',
        EMERGING: '🚀 Wachstums-Coin',
        ESTABLISHED_TRADER: '💎 Trader-Grade Asset',
      };

      let price24hAgo = basePrice;
      try {
        const history24h = await db('market_price_history')
          .where({ coin_symbol: symbol })
          .where('timestamp', '>=', oneDayAgo)
          .orderBy('timestamp', 'asc')
          .first();

        if (history24h && history24h.price) {
          price24hAgo = Number(history24h.price);
        }
      } catch {}

      const change24hPercent =
        price24hAgo > 0 ? Math.round(((currentPrice - price24hAgo) / price24hAgo) * 10000) / 100 : 0.0;

      let volume1h = 0;
      try {
        const hasUserTrades = await db.schema.hasTable('user_trades');
        if (hasUserTrades) {
          const volume1hRow = await db('user_trades')
            .where({ coin_symbol: symbol })
            .where('created_at', '>=', oneHourAgo)
            .sum('total_cash as total')
            .first();
          volume1h = Number(volume1hRow?.total || 0);
        }
      } catch {}

      const stats = await getRollingScoreStatistics(coin.game_id || symbol.toLowerCase());
      const hourlyBoost = await calculateDynamicHourlyBoost(symbol, stats.targetScore);

      result.push({
        symbol,
        name: coin.name || `${symbol} Coin`,
        gameId: coin.game_id || symbol.toLowerCase(),
        currentPrice,
        basePrice,
        marketTier: tier,
        marketTierLabel: tierLabels[tier],
        virtualGameReserve: Number(coin.virtual_game_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE),
        virtualTokenReserve: Number(coin.virtual_token_reserve || MARKET_CONFIG.INITIAL_VIRTUAL_TOKEN_RESERVE),
        constantProductK: Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K),
        circulatingSupply: Number(coin.circulating_supply || coin.virtual_token_reserve),
        totalBurned: Number(coin.total_burned || 0),
        volume24h: Number(coin.volume_24h || 0),
        volume1h,
        change24hPercent,
        targetScore: stats.targetScore,
        hourlyBoost,
        updatedAt: coin.updated_at ? new Date(coin.updated_at).toISOString() : new Date().toISOString(),
      });
    }

    return result;
  } catch (err) {
    console.error('[Market Engine]: Error fetching all market coins:', err);
    return [];
  }
}

export async function getUserPortfolio(userId: string): Promise<{
  portfolio: UserPortfolioItem[];
  totalPortfolioValue: number;
  totalInvested: number;
  totalPnlCash: number;
  totalPnlPercent: number;
}> {
  const cleanUserId = userId.startsWith('guest_') ? 'guest_session' : userId;

  try {
    const hasTable = await db.schema.hasTable('user_portfolios');
    if (!hasTable) {
      return { portfolio: [], totalPortfolioValue: 0, totalInvested: 0, totalPnlCash: 0, totalPnlPercent: 0 };
    }

    const holdings = await db('user_portfolios').where({ user_id: cleanUserId });
    const coins = await db('market_coins').select('symbol', 'name', 'current_price');
    const coinMap = new Map(coins.map((c: any) => [c.symbol, c]));

    const portfolio: UserPortfolioItem[] = [];
    let totalPortfolioValue = 0;
    let totalInvested = 0;

    for (const h of holdings) {
      const sym = h.coin_symbol;
      const coin = coinMap.get(sym);
      const amount = Number(h.amount || 0);
      const avgBuyPrice = Number(h.avg_buy_price || 0);
      const invested = Number(h.total_invested || 0);
      const currentPrice = Number(coin?.current_price || MARKET_CONFIG.BASE_PRICE);
      const currentValue = amount * currentPrice;

      const pnlCash = currentValue - invested;
      const pnlPercent = invested > 0 ? Math.round((pnlCash / invested) * 10000) / 100 : 0;

      totalPortfolioValue += currentValue;
      totalInvested += invested;

      portfolio.push({
        coinSymbol: sym,
        coinName: coin?.name || `${sym} Coin`,
        amount: Math.round(amount * 100) / 100,
        avgBuyPrice,
        currentPrice,
        currentValue: Math.round(currentValue * 100) / 100,
        totalInvested: Math.round(invested * 100) / 100,
        pnlCash: Math.round(pnlCash * 100) / 100,
        pnlPercent,
      });
    }

    const totalPnlCash = totalPortfolioValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? Math.round((totalPnlCash / totalInvested) * 10000) / 100 : 0;

    return {
      portfolio,
      totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalPnlCash: Math.round(totalPnlCash * 100) / 100,
      totalPnlPercent,
    };
  } catch (err) {
    console.error('[Market Engine]: Error fetching user portfolio:', err);
    return { portfolio: [], totalPortfolioValue: 0, totalInvested: 0, totalPnlCash: 0, totalPnlPercent: 0 };
  }
}

export async function getMarketEvents(limit: number = 30): Promise<MarketEvent[]> {
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
      priceImpactPercent: Number(r.price_impact_percent || 0),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  } catch (err) {
    console.error('[Market Engine]: Error fetching market events:', err);
    return [];
  }
}

export async function getCoinCandleData(
  symbol: string,
  timeframe: string = '24h'
): Promise<CandlePoint[]> {
  const sym = symbol.toUpperCase();
  const now = Date.now();
  let timeAgo: Date;
  let intervalMs: number;

  if (timeframe === '1h' || timeframe === '30m') {
    timeAgo = new Date(now - (timeframe === '30m' ? 30 * 60 * 1000 : 3600 * 1000));
    intervalMs = 60 * 1000; // 1-minute buckets
  } else if (timeframe === '7d') {
    timeAgo = new Date(now - 7 * 24 * 3600 * 1000);
    intervalMs = 4 * 3600 * 1000; // 4-hour buckets
  } else {
    timeAgo = new Date(now - 24 * 3600 * 1000);
    intervalMs = 15 * 60 * 1000; // 15-minute buckets
  }

  try {
    const hasHistoryTable = await db.schema.hasTable('market_price_history');
    if (!hasHistoryTable) return [];

    const history = await db('market_price_history')
      .where({ coin_symbol: sym })
      .where('timestamp', '>=', timeAgo)
      .orderBy('timestamp', 'asc');

    if (history.length === 0) {
      const coin = await db('market_coins').where({ symbol: sym }).first();
      const currentPrice = Number(coin?.current_price || MARKET_CONFIG.BASE_PRICE);
      return [
        {
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
          volume: 0,
          timestamp: new Date().toISOString(),
          isBullish: true,
        },
      ];
    }

    const buckets: Record<number, { prices: number[]; volume: number; timestamp: string }> = {};

    for (const h of history) {
      const t = new Date(h.timestamp).getTime();
      const bucketKey = Math.floor(t / intervalMs) * intervalMs;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          prices: [],
          volume: 0,
          timestamp: new Date(bucketKey).toISOString(),
        };
      }
      buckets[bucketKey].prices.push(Number(h.price));
      buckets[bucketKey].volume += Number(h.volume || 0);
    }

    const sortedBucketKeys = Object.keys(buckets)
      .map(Number)
      .sort((a, b) => a - b);

    const candleData: CandlePoint[] = [];

    for (const key of sortedBucketKeys) {
      const b = buckets[key];
      const p = b.prices;
      if (p.length === 0) continue;

      const open = p[0];
      const close = p[p.length - 1];
      const high = Math.max(...p);
      const low = Math.min(...p);

      candleData.push({
        open,
        high,
        low,
        close,
        volume: Math.round(b.volume * 100) / 100,
        timestamp: b.timestamp,
        isBullish: close >= open,
      });
    }

    return candleData;
  } catch (err) {
    console.error(`[Market Engine]: Error fetching candle data for ${sym}:`, err);
    return [];
  }
}

/**
 * GET /api/market/overview aggregator
 */
export async function getMarketOverview(userId: string) {
  const cleanUserId = (userId || '').startsWith('guest_') ? 'guest_session' : userId;
  const coins = await getAllMarketCoins();
  const portfolioData = await getUserPortfolio(cleanUserId);
  const events = await getMarketEvents(10);
  const user = cleanUserId ? await db('users').where({ id: cleanUserId }).first() : null;

  return {
    success: true,
    userCash: Number(user?.game_cash || 0.0),
    coins,
    portfolio: portfolioData.portfolio,
    totalPortfolioValue: portfolioData.totalPortfolioValue,
    totalInvested: portfolioData.totalInvested,
    totalPnlCash: portfolioData.totalPnlCash,
    totalPnlPercent: portfolioData.totalPnlPercent,
    events,
    recentEvents: events,
  };
}

export const getCoinChart = getCoinCandleData;
export const executeMarketTrade = executeAmmTrade;

