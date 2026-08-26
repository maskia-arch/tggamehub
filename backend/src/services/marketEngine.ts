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
  titleDe?: string;
  titleEn?: string;
  description: string;
  descriptionDe?: string;
  descriptionEn?: string;
  priceImpactPercent: number;
  multiplier?: number;
  durationMinutes?: number;
  isActive?: boolean;
  expiresAt?: string | null;
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
  crossyneonroad: { symbol: 'CROSSY', name: 'Crossy Neon Road Coin' },
};

// Internal momentum & activity state
// Internal momentum & activity state with Dynamic Score Battery
interface CoinMomentumState {
  consecutiveBuys: number;
  consecutiveSells: number;
  lastTickPrice: number;
  lastActivityTime: number;
  lastWhaleEventTime: number;
  peak24hPrice: number;
  // Community Score Energy
  accumulatedPoints: number;
  accumulatedRounds: number;
  positiveEventCharge: number; // 0 to 100% battery fueled by player scores
  lastEventTime: number;
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
      accumulatedPoints: 0,
      accumulatedRounds: 0,
      positiveEventCharge: 15, // healthy baseline charge
      lastEventTime: 0,
    };
  }
  return momentumTracker[sym];
}

export function markCoinActivity(coinSymbol: string, addedScore: number = 0) {
  const momentum = getCoinMomentum(coinSymbol);
  const now = Date.now();
  momentum.lastActivityTime = now;

  if (addedScore > 0) {
    momentum.accumulatedPoints += addedScore;
    momentum.accumulatedRounds += 1;
    // Each score charges the positive event probability battery (higher scores give more charge)
    const scoreCharge = Math.min(25, Math.max(2, Math.round(addedScore / 15)));
    momentum.positiveEventCharge = Math.min(100, momentum.positiveEventCharge + scoreCharge);
  }
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

  const defaultName = gameTitle ? (gameTitle.endsWith('Coin') ? gameTitle : `${gameTitle} Coin`) : (GAME_COIN_MAP[sym.toLowerCase()]?.name || `${sym} Coin`);
  const gameId = gameIdParam || Object.keys(GAME_COIN_MAP).find((k) => GAME_COIN_MAP[k].symbol === sym) || sym.toLowerCase();

  const existing = await db('market_coins').where({ symbol: sym }).first();
  if (existing) {
    await db('market_coins')
      .where({ symbol: sym })
      .update({
        name: defaultName,
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
        await initCoinPool(sym, MARKET_CONFIG.BASE_PRICE, MARKET_CONFIG.INITIAL_VIRTUAL_GAME_RESERVE, game.title, game.id);
      } else {
        // Sanity Check: If coin price is detached (> 1.0e-7) without massive reserves, realign to gameplay-backed AMM value
        const curPrice = Number(existing.current_price || MARKET_CONFIG.BASE_PRICE);
        if (curPrice > 1.0e-7) {
          const totalBurned = Number(existing.total_burned || 0);
          const truePrice = Math.max(MARKET_CONFIG.BASE_PRICE, Math.round(MARKET_CONFIG.BASE_PRICE * (1 + totalBurned / 10_000_000) * 1e12) / 1e12);
          const constantK = Number(existing.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);
          const safeGame = Math.sqrt(constantK * truePrice);
          const safeToken = Math.sqrt(constantK / truePrice);
          await db('market_coins').where({ symbol: sym }).update({
            current_price: truePrice,
            base_price: MARKET_CONFIG.BASE_PRICE,
            virtual_game_reserve: safeGame,
            virtual_token_reserve: safeToken,
            updated_at: new Date(),
          });
          console.log(`[Market Engine]: Auto-healed inflated $${sym} price from ${curPrice} to gameplay-backed ${truePrice} Game$`);
        }
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
  markCoinActivity(coinSymbol, score);

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

  const cleanUserId = String(userId || '').startsWith('guest_') ? 'guest_session' : String(userId || '');
  let recordedNetProfit = 0;

  const result = await db.transaction(async (trx) => {
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
    let cashToSpend = 0;
    let tokensToSell = 0;

    if (tradeType === 'BUY') {
      const userCash = Number(user.game_cash || 0);
      cashToSpend = amount;
      if (cashToSpend > userCash) {
        if (cashToSpend - userCash < 0.01) {
          cashToSpend = userCash;
        } else {
          throw new Error(`Unzureichendes InGame-$ Guthaben. Verfügbar: $${userCash.toFixed(2)}`);
        }
      }

      if (cashToSpend <= 0) {
        throw new Error('Ungültiger Kaufbetrag.');
      }

      calc = calculateAmmBuy(cashToSpend, virtualGame, virtualToken, constantK);
      if (Math.abs(calc.priceImpactPercent) > maxSlippagePercent) {
        throw new Error(`Slippage (${calc.priceImpactPercent.toFixed(2)}%) übersteigt Limit (${maxSlippagePercent}%).`);
      }

      // Deduct cash, credit tokens
      await trx('users').where({ id: cleanUserId }).decrement('game_cash', cashToSpend);

      const holding = await trx('user_portfolios')
        .where({ user_id: cleanUserId, coin_symbol: sym })
        .first();

      if (holding) {
        const oldAmount = Number(holding.amount);
        const oldInvested = Number(holding.total_invested || 0);
        const newAmount = oldAmount + calc.outputAmount;
        const newInvested = oldInvested + cashToSpend;
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
          total_invested: cashToSpend,
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
      if (userTokens <= 0) {
        throw new Error(`Keine $${sym} Token im Portfolio vorhanden.`);
      }

      tokensToSell = amount;
      if (tokensToSell > userTokens) {
        if (tokensToSell - userTokens < 0.05 || (tokensToSell - userTokens) / userTokens < 0.001) {
          tokensToSell = userTokens;
        } else {
          throw new Error(`Unzureichende $${sym} Token. Verfügbar: ${userTokens.toLocaleString()}`);
        }
      }

      if (tokensToSell <= 0) {
        throw new Error('Ungültige Verkaufsmenge.');
      }

      calc = calculateAmmSell(tokensToSell, virtualGame, virtualToken, constantK);
      if (Math.abs(calc.priceImpactPercent) > maxSlippagePercent) {
        throw new Error(`Slippage (${Math.abs(calc.priceImpactPercent).toFixed(2)}%) übersteigt Limit (${maxSlippagePercent}%).`);
      }

      // Credit cash, deduct tokens
      await trx('users').where({ id: cleanUserId }).increment('game_cash', calc.outputAmount);

      const remainingTokens = userTokens - tokensToSell;
      const oldInvested = Number(holding?.total_invested || 0);
      const soldRatio = userTokens > 0 ? tokensToSell / userTokens : 1;
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
        recordedNetProfit = netProfit;
      }

      momentum.consecutiveSells += 1;
      momentum.consecutiveBuys = 0;
    }

    // Update Coin Spot Price
    const newSpotPrice = Math.max(MARKET_CONFIG.MIN_PRICE, calc.newGameReserve / calc.newTokenReserve);
    const roundedPrice = Math.round(newSpotPrice * 1e12) / 1e12;
    const effectiveCashVolume = tradeType === 'BUY' ? cashToSpend : calc.outputAmount;
    await trx('market_coins')
      .where({ symbol: sym })
      .update({
        current_price: roundedPrice,
        virtual_game_reserve: calc.newGameReserve,
        virtual_token_reserve: calc.newTokenReserve,
        volume_24h: Number(coin.volume_24h || 0) + effectiveCashVolume,
        updated_at: new Date(),
      });

    // Record trade in user_trades (safe against PostgreSQL / SQLite driver differences)
    let tradeId: any = null;
    try {
      const insertRes = await trx('user_trades').insert({
        user_id: cleanUserId,
        coin_symbol: sym,
        trade_type: tradeType,
        amount_tokens: tradeType === 'BUY' ? calc.outputAmount : tokensToSell,
        price_per_token: calc.executionPrice,
        total_cash: effectiveCashVolume,
        gas_fee: calc.gasFee,
        price_impact_percent: calc.priceImpactPercent,
        created_at: new Date(),
      });
      if (Array.isArray(insertRes) && insertRes.length > 0) {
        tradeId = typeof insertRes[0] === 'object' && insertRes[0] !== null ? (insertRes[0] as any).id : insertRes[0];
      }
    } catch (insertErr) {
      console.warn('[AMM TRADE]: user_trades audit insert note:', insertErr);
    }

    await trx('market_price_history').insert({
      coin_symbol: sym,
      price: roundedPrice,
      volume: effectiveCashVolume,
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

  if (recordedNetProfit > 0 && !cleanUserId.startsWith('guest_')) {
    try {
      await recordUserMarketProfit(cleanUserId, recordedNetProfit);
    } catch (profitErr) {
      console.warn('[AMM TRADE]: Failed to record user season profit:', profitErr);
    }
  }

  return result;
}

// ============================================================================
// 4. TICK-BASED MARKET ENGINE & DYNAMIC GAMEPLAY EVENT ENGINE
// ============================================================================

/**
 * Composite Market Update Tick:
 * - Active trading/gameplay: maintains realistic micro-spread orderbook noise.
 * - Inactive periods: allows gentle cooling towards baseline.
 * - Points scored directly charge the positive event battery; inactivity triggers cooling events.
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

      const momentum = getCoinMomentum(symbol);
      const secondsSinceActivity = (now - momentum.lastActivityTime) / 1000;
      const minutesInactive = secondsSinceActivity / 60;

      let totalShift = 0.0;

      if (secondsSinceActivity < 60) {
        // Active Market: Orderbook Micro-Spread Noise (±0.005% max)
        const microNoise = (Math.random() * 2 - 1) * 0.00005;
        totalShift += microNoise;
      } else if (minutesInactive > 15 && currentPrice > basePrice) {
        // Inactive Market (> 15 min without games/trades): Very gentle cooling drift towards base price
        const elevationRatio = (currentPrice - basePrice) / basePrice;
        const gentleDrift = -0.000005 * Math.min(1.0, elevationRatio);
        totalShift += gentleDrift;
        // Slowly drain positive charge on extended inactivity
        momentum.positiveEventCharge = Math.max(0, momentum.positiveEventCharge - 0.2);
      }

      if (Math.abs(totalShift) > 1e-7) {
        const rawNewPrice = currentPrice * (1 + totalShift);
        const newPrice = Math.max(basePrice, Math.round(rawNewPrice * 1e12) / 1e12);

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

      // Evaluate Dynamic Random Events (Gameplay Score Fuel vs. Inactivity Drag)
      await evaluateDynamicMarketEvent(coin, momentum, now);
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
// 5. DYNAMIC GAMEPLAY-DRIVEN EVENT ENGINE
// ============================================================================

/**
 * Evaluates and triggers dynamic random events:
 * - High gameplay scores fuel positive / bullish community events.
 * - Inactivity increases the chance for cooling / bearish events.
 * - Cooldown protected (min 120s between events per coin) with balanced realistic price shifts.
 */
async function evaluateDynamicMarketEvent(coin: any, momentum: CoinMomentumState, now: number) {
  try {
    const symbol = coin.symbol;
    const currentPrice = Number(coin.current_price || MARKET_CONFIG.BASE_PRICE);
    const basePrice = Number(coin.base_price || MARKET_CONFIG.BASE_PRICE);
    const constantK = Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);
    const secondsSinceActivity = (now - momentum.lastActivityTime) / 1000;
    const minutesInactive = secondsSinceActivity / 60;

    // Minimum cooldown between random events for this coin (120 seconds = 2 minutes)
    if (now - (momentum.lastEventTime || 0) < 120_000) {
      return;
    }

    const hasEventsTable = await db.schema.hasTable('market_events');
    if (!hasEventsTable) return;

    // A. Positive Event Chance: Scaled directly by gameplay points / positiveEventCharge (up to ~6% per tick when highly charged!)
    const positiveChance = (momentum.positiveEventCharge / 100) * 0.05;
    
    // B. Negative Event Chance: Scaled by minutes of inactivity (starts after 10 min inactivity, grows to ~4% per tick)
    const negativeChance = minutesInactive > 10 ? Math.min(0.04, 0.005 + (minutesInactive - 10) * 0.001) : 0.0;

    // Roll for event
    const roll = Math.random();

    if (roll < positiveChance) {
      // 🟢 POSITIVE / BULLISH EVENT TRIGGERED BY REAL GAMEPLAY POINTS!
      const positiveEvents = [
        {
          type: 'COMMUNITY_RAID',
          title: '⚡ Community Kaufwelle',
          description: `Zahlreiche Spieler strömen nach starken Runden an den Markt und sichern sich $${symbol}!`,
          minImpact: 0.0025,
          maxImpact: 0.0075,
        },
        {
          type: 'HIGHSCORE_RUSH',
          title: '🎮 Highscore-Rallye',
          description: `Eine Serie herausragender Spielrunden verbrennt Rekordmengen an $${symbol} Token!`,
          minImpact: 0.0035,
          maxImpact: 0.0095,
        },
        {
          type: 'VIRAL_MEME',
          title: '🚀 Telegram Hype & Memes',
          description: `Virale Screenshots von Spitzenplatzierungen sorgen für Begeisterung bei $${symbol}!`,
          minImpact: 0.0040,
          maxImpact: 0.0110,
        },
        {
          type: 'HODLER_ACCUMULATION',
          title: '💎 Diamant-Hände Akkumulation',
          description: `Erfahrene Arcade-Gamer halten ihre $${symbol} eisern für den Season-Airdrop-Pot!`,
          minImpact: 0.0020,
          maxImpact: 0.0065,
        },
        {
          type: 'TOURNAMENT_FEVER',
          title: '🏆 Turnier-Fieber',
          description: `Ein packender Kampf um die Top 3 der Bestenliste entfacht die Verbrennung von $${symbol}!`,
          minImpact: 0.0045,
          maxImpact: 0.0120,
        },
        {
          type: 'DEFLATION_SURGE',
          title: '🔥 Massive Deflations-Welle',
          description: `Kontinuierliche Punktverbrennung verknappt das zirkulierende Angebot von $${symbol} spürbar!`,
          minImpact: 0.0030,
          maxImpact: 0.0085,
        },
        {
          type: 'BULLISH_SENTIMENT',
          title: '🌟 Bullische Arcade-Stimmung',
          description: `Hohe Spieleraktivität und starke Team-Scores treiben den Optimismus bei $${symbol}!`,
          minImpact: 0.0020,
          maxImpact: 0.0060,
        },
        {
          type: 'MOONSHOT_HYPE',
          title: '🛸 Moonshot-Fieber',
          description: `Spekulationen auf lukrative Season-Gewinne führen zu reger Nachfrage nach $${symbol}.`,
          minImpact: 0.0035,
          maxImpact: 0.0090,
        },
        {
          type: 'COMMUNITY_CHALLENGE',
          title: '🎯 Community Challenge erreicht',
          description: `Ein gemeinsamer Meilenstein bei den Gesamtpunkten verleiht $${symbol} frischen Rückenwind!`,
          minImpact: 0.0040,
          maxImpact: 0.0100,
        },
        {
          type: 'SPEEDRUN_FRENZY',
          title: '⚡ Speedrun-Rausch',
          description: `Schnelle und fehlerfreie Runden im Minigame-Hub lassen die Verbrennungsrate ansteigen!`,
          minImpact: 0.0030,
          maxImpact: 0.0075,
        },
        {
          type: 'TOKEN_HOLD_VIBES',
          title: '🔒 Starke Halte-Quote',
          description: `Immer mehr Gamer behalten erspielte $${symbol} im Portfolio – Verkaufsdruck sinkt spürbar!`,
          minImpact: 0.0025,
          maxImpact: 0.0070,
        },
        {
          type: 'COMMUNITY_TREASURY_BOOST',
          title: '💠 Arcade Jackpot Anreiz',
          description: `Ein wachsender Airdrop-Pot motiviert immer mehr Spieler zum Sammeln von $${symbol}.`,
          minImpact: 0.0030,
          maxImpact: 0.0080,
        },
      ];

      const template = positiveEvents[Math.floor(Math.random() * positiveEvents.length)];
      const impactFactor = template.minImpact + Math.random() * (template.maxImpact - template.minImpact);
      const priceImpactPercent = Math.round(impactFactor * 10000) / 100;

      const rawNewPrice = currentPrice * (1 + impactFactor);
      const newPrice = Math.max(basePrice, Math.round(rawNewPrice * 1e12) / 1e12);

      const newGameReserve = Math.sqrt(constantK * newPrice);
      const newTokenReserve = Math.sqrt(constantK / newPrice);

      await db('market_coins').where({ symbol }).update({
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

      // Partially discharge battery and update cooldown
      momentum.positiveEventCharge = Math.max(0, momentum.positiveEventCharge - 20);
      momentum.lastEventTime = now;
      console.log(`[Market Dynamic Event (+)]: ${template.title} on $${symbol} (+${priceImpactPercent}%) [Charge left: ${momentum.positiveEventCharge}%]`);

    } else if (roll < positiveChance + negativeChance) {
      // 🔴 NEGATIVE / COOLING EVENT TRIGGERED BY INACTIVITY!
      const negativeEvents = [
        {
          type: 'PLAYER_DOWNTIME',
          title: '💤 Nächtliche Spielpause',
          description: `Die Arcade-Lobby ruht vorübergehend. Ohne neue Burns verharrt $${symbol} in einer Ruhepause.`,
          minImpact: -0.0045,
          maxImpact: -0.0015,
        },
        {
          type: 'EARLY_FARMER_EXIT',
          title: '🌾 Früh-Farmer Gewinnmitnahme',
          description: `Einige frühe Spieler tauschen erwirtschaftete $${symbol} in Game$ Guthaben um.`,
          minImpact: -0.0055,
          maxImpact: -0.0020,
        },
        {
          type: 'MARKET_COOLING',
          title: '❄️ Gesunde Konsolidierung',
          description: `Nach intensiven Runden kühlt der Markt für $${symbol} auf natürlichem Niveau ab.`,
          minImpact: -0.0035,
          maxImpact: -0.0010,
        },
        {
          type: 'COFFEE_BREAK',
          title: '☕ Verschnaufpause der Gamer',
          description: `Spieler laden ihre Energie auf – kurzzeitiger Stillstand am $${symbol} Markt.`,
          minImpact: -0.0030,
          maxImpact: -0.0010,
        },
        {
          type: 'SUMMER_SLUMBER',
          title: '🍃 Ruhiger Handelstag',
          description: `Geringe Aktivität auf den Ranglisten lässt den Kurs von $${symbol} leicht nachgeben.`,
          minImpact: -0.0040,
          maxImpact: -0.0015,
        },
        {
          type: 'PROFIT_LOCK',
          title: '🔒 Gewinnsicherung',
          description: `Vorsichtige Händler realisieren kleine Gewinne nach dem letzten Spiel-Push.`,
          minImpact: -0.0048,
          maxImpact: -0.0018,
        },
        {
          type: 'MARKET_FATIGUE',
          title: '🍂 Warten auf den nächsten Raid',
          description: `Der Markt wartet gespannt auf die nächste große Highscore-Welle bei $${symbol}.`,
          minImpact: -0.0038,
          maxImpact: -0.0012,
        },
        {
          type: 'ENERGY_WAIT',
          title: '⚡ Warten auf Energie-Refill',
          description: `Viele Spieler warten auf neue Energie-Balken – Handelsvolumen verlangsamt sich temporär.`,
          minImpact: -0.0028,
          maxImpact: -0.0010,
        },
        {
          type: 'SLUMBER_CORRECTION',
          title: '📉 Inaktivitäts-Korrektur',
          description: `Längere Spielpause führt zu einer leichten Abkühlung bei $${symbol}.`,
          minImpact: -0.0050,
          maxImpact: -0.0020,
        },
      ];

      const template = negativeEvents[Math.floor(Math.random() * negativeEvents.length)];
      const impactFactor = template.minImpact + Math.random() * (template.maxImpact - template.minImpact);
      const priceImpactPercent = Math.round(impactFactor * 10000) / 100;

      const rawNewPrice = currentPrice * (1 + impactFactor);
      const newPrice = Math.max(basePrice, Math.round(rawNewPrice * 1e12) / 1e12);

      const newGameReserve = Math.sqrt(constantK * newPrice);
      const newTokenReserve = Math.sqrt(constantK / newPrice);

      await db('market_coins').where({ symbol }).update({
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

      momentum.lastEventTime = now;
      console.log(`[Market Dynamic Event (-)]: ${template.title} on $${symbol} (${priceImpactPercent}%) [Inactive: ${minutesInactive.toFixed(1)}m]`);

    } else if (roll < 0.003) {
      // ⚪ NEUTRAL / COMMUNITY INFORMATIVE EVENT
      const neutralEvents = [
        {
          type: 'COMMUNITY_REPORT',
          title: '📊 Community Markt-Bericht',
          description: `Stabiles Handelsumfeld bei $${symbol}. Spieler nutzen Kursbewegungen für Taktiken.`,
        },
        {
          type: 'NETWORK_UPDATE',
          title: '⚡ Minigame-Netzwerk Live',
          description: `Kontinuierliche Punktverbrennung bei $${symbol} hält den Umlaufbestand stabil.`,
        },
        {
          type: 'AMM_STABILITY',
          title: '🛡️ Liquiditäts-Check',
          description: `Der AMM-Pool von $${symbol} weist eine ausgewogene Reservenverteilung auf.`,
        },
      ];

      const item = neutralEvents[Math.floor(Math.random() * neutralEvents.length)];

      await db('market_events').insert({
        coin_symbol: symbol,
        event_type: item.type,
        title: item.title,
        description: item.description,
        price_impact_percent: 0.0,
        created_at: new Date(),
      });

      momentum.lastEventTime = now;
      console.log(`[Market Neutral Event]: ${item.title} on $${symbol}`);
    }
  } catch (err) {
    console.error('[Dynamic Market Event Error]:', err);
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
  const cleanUserId = String(userId || '').startsWith('guest_') ? 'guest_session' : String(userId || '');

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
        amount: amount,
        avgBuyPrice,
        currentPrice,
        currentValue: Math.round(currentValue * 10000) / 10000,
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

export async function applyAiNewsImpact(
  coinSymbol: string,
  priceImpactPercent: number,
  title: string,
  description: string,
  titleDe?: string,
  titleEn?: string,
  descriptionDe?: string,
  descriptionEn?: string
): Promise<void> {
  try {
    const symbol = coinSymbol.toUpperCase();
    const coin = await db('market_coins').where({ symbol }).first();
    if (!coin) return;

    const currentPrice = Number(coin.current_price || MARKET_CONFIG.BASE_PRICE);
    const basePrice = Number(coin.base_price || MARKET_CONFIG.BASE_PRICE);
    const constantK = Number(coin.constant_product_k || MARKET_CONFIG.CONSTANT_PRODUCT_K);

    // Convert e.g. +3.5% -> 0.035
    const delta = priceImpactPercent / 100;
    const rawNewPrice = currentPrice * (1 + delta);
    const newPrice = Math.max(basePrice, Math.round(rawNewPrice * 1e12) / 1e12);

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

    const eventType = delta > 0 ? 'AI_BREAKING_BULL' : delta < 0 ? 'AI_BREAKING_BEAR' : 'AI_MARKET_UPDATE';

    await db('market_events').insert({
      coin_symbol: symbol,
      event_type: eventType,
      title: `📰 ${titleDe || title}`,
      title_de: titleDe || title,
      title_en: titleEn || title,
      description: descriptionDe || description,
      description_de: descriptionDe || description,
      description_en: descriptionEn || description,
      price_impact_percent: priceImpactPercent,
      created_at: new Date(),
    });

    console.log(`[Market Engine]: Applied AI News Impact on $${symbol}: ${priceImpactPercent > 0 ? '+' : ''}${priceImpactPercent}% -> New Price: ${newPrice}`);
  } catch (err: any) {
    console.error('[Market Engine Error in applyAiNewsImpact]:', err.message);
  }
}

export async function applyLiveCryptoEvent(
  coinSymbol: string,
  eventType: string,
  priceImpactPercent: number,
  multiplier: number,
  durationMinutes: number,
  titleDe: string,
  titleEn: string,
  descriptionDe: string,
  descriptionEn: string
): Promise<void> {
  try {
    const symbol = coinSymbol.toUpperCase();

    // 1. Move price if impact != 0
    if (priceImpactPercent !== 0) {
      await applyAiNewsImpact(
        symbol,
        priceImpactPercent,
        titleDe,
        descriptionDe,
        titleDe,
        titleEn,
        descriptionDe,
        descriptionEn
      );
    }

    // 2. Insert active live event in market_events with expiration
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    await db('market_events').insert({
      coin_symbol: symbol,
      event_type: eventType,
      title: `⚡ ${titleDe}`,
      title_de: titleDe,
      title_en: titleEn,
      description: descriptionDe,
      description_de: descriptionDe,
      description_en: descriptionEn,
      price_impact_percent: priceImpactPercent,
      multiplier: multiplier,
      duration_minutes: durationMinutes,
      is_active: true,
      expires_at: expiresAt,
      created_at: new Date(),
    });

    console.log(`[Market Engine]: Activated Live Crypto Event "${titleDe}" for $${symbol} (Multiplier: ${multiplier}x, Duration: ${durationMinutes}m).`);
  } catch (err: any) {
    console.error('[Market Engine Error in applyLiveCryptoEvent]:', err.message);
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
      titleDe: r.title_de || r.title,
      titleEn: r.title_en || r.title,
      description: r.description,
      descriptionDe: r.description_de || r.description,
      descriptionEn: r.description_en || r.description,
      priceImpactPercent: Number(r.price_impact_percent || 0),
      multiplier: Number(r.multiplier || 1.0),
      durationMinutes: Number(r.duration_minutes || 60),
      isActive: Boolean(r.is_active),
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
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

  const tf = (timeframe || '24h').toLowerCase();
  let durationMs = 24 * 3600 * 1000;
  if (tf === '30m') {
    durationMs = 30 * 60 * 1000;
  } else if (tf === '60m' || tf === '1h') {
    durationMs = 60 * 60 * 1000;
  } else if (tf === '4h') {
    durationMs = 4 * 3600 * 1000;
  } else if (tf === '12h') {
    durationMs = 12 * 3600 * 1000;
  } else if (tf === '7d') {
    durationMs = 7 * 24 * 3600 * 1000;
  } else {
    durationMs = 24 * 3600 * 1000;
  }

  const numBuckets = 30;
  const intervalMs = durationMs / numBuckets;
  const startTime = now - durationMs;

  try {
    const coin = await db('market_coins').where({ symbol: sym }).first();
    const currentPrice = Number(coin?.current_price || MARKET_CONFIG.BASE_PRICE);
    const basePrice = Number(coin?.base_price || MARKET_CONFIG.BASE_PRICE);

    const hasHistoryTable = await db.schema.hasTable('market_price_history');
    if (!hasHistoryTable) {
      return Array.from({ length: numBuckets }, (_, i) => ({
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        volume: 0,
        timestamp: new Date(startTime + i * intervalMs).toISOString(),
        isBullish: true,
      }));
    }

    // Get last price before the window to anchor first candle
    const priorHistory = await db('market_price_history')
      .where({ coin_symbol: sym })
      .where('timestamp', '<', new Date(startTime))
      .orderBy('timestamp', 'desc')
      .first();

    let lastKnownPrice = priorHistory ? Number(priorHistory.price) : (currentPrice || basePrice);

    // Get all records in the window
    const history = await db('market_price_history')
      .where({ coin_symbol: sym })
      .where('timestamp', '>=', new Date(startTime))
      .orderBy('timestamp', 'asc');

    const bucketEvents: { prices: number[]; volume: number }[] = Array.from(
      { length: numBuckets },
      () => ({ prices: [], volume: 0 })
    );

    for (const h of history) {
      const t = new Date(h.timestamp).getTime();
      const idx = Math.min(numBuckets - 1, Math.max(0, Math.floor((t - startTime) / intervalMs)));
      const p = Number(h.price);
      if (!isNaN(p) && p > 0) {
        bucketEvents[idx].prices.push(p);
        bucketEvents[idx].volume += Number(h.volume || 0);
      }
    }

    const candleData: CandlePoint[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const bucketTime = new Date(startTime + i * intervalMs).toISOString();
      const ev = bucketEvents[i];

      if (ev.prices.length > 0) {
        const open = ev.prices[0];
        const close = ev.prices[ev.prices.length - 1];
        const high = Math.max(...ev.prices);
        const low = Math.min(...ev.prices);

        candleData.push({
          open,
          high,
          low,
          close,
          volume: Math.round(ev.volume * 100) / 100,
          timestamp: bucketTime,
          isBullish: close >= open,
        });
        lastKnownPrice = close;
      } else {
        candleData.push({
          open: lastKnownPrice,
          high: lastKnownPrice,
          low: lastKnownPrice,
          close: lastKnownPrice,
          volume: 0,
          timestamp: bucketTime,
          isBullish: true,
        });
      }
    }

    // Always anchor the very last candle to the live current_price
    if (candleData.length > 0) {
      const lastCandle = candleData[candleData.length - 1];
      lastCandle.close = currentPrice;
      lastCandle.high = Math.max(lastCandle.high, currentPrice);
      lastCandle.low = Math.min(lastCandle.low, currentPrice);
      lastCandle.isBullish = currentPrice >= lastCandle.open;
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
  const cleanUserId = String(userId || '').startsWith('guest_') ? 'guest_session' : String(userId || '');
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
export const recordGameScore = processGameScoreAmmImpact;

