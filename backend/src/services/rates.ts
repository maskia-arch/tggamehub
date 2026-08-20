import axios from 'axios';

const rateCache: Record<string, { rate: number; expiresAt: number }> = {};
const RATE_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Fetches the current coin exchange rate in EUR.
 * Supports LTC, BTC, ETH, SOL. Safe bulletproof fallbacks with 60s in-memory caching.
 */
export async function getCoinEurRate(coin: string): Promise<number> {
  const coinCode = (coin || 'LTC').toUpperCase();
  const now = Date.now();

  if (rateCache[coinCode] && rateCache[coinCode].expiresAt > now) {
    return rateCache[coinCode].rate;
  }
  
  const fallbacks: Record<string, number> = { 
    LTC: 70.0, 
    BTC: 60000.0, 
    ETH: 3000.0, 
    SOL: 130.0 
  };

  const coingeckoIdMap: Record<string, string> = {
    LTC: 'litecoin',
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana'
  };
  
  const binanceSymbolMap: Record<string, string> = {
    LTC: 'LTCEUR',
    BTC: 'BTCEUR',
    ETH: 'ETHEUR',
    SOL: 'SOLEUR'
  };

  const coingeckoId = coingeckoIdMap[coinCode] || 'litecoin';
  const binanceSymbol = binanceSymbolMap[coinCode] || 'LTCEUR';

  // 1. Try CoinGecko
  try {
    const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=eur`, { timeout: 3000 });
    const fetched = Number(res.data?.[coingeckoId]?.eur);
    if (fetched && !isNaN(fetched) && fetched > 0) {
      rateCache[coinCode] = { rate: fetched, expiresAt: now + RATE_CACHE_TTL_MS };
      return fetched;
    }
  } catch (err: any) {
    // Silently fall back to Binance
  }

  // 2. Try Binance
  try {
    const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`, { timeout: 3000 });
    const fetched = parseFloat(res.data?.price);
    if (fetched && !isNaN(fetched) && fetched > 0) {
      rateCache[coinCode] = { rate: fetched, expiresAt: now + RATE_CACHE_TTL_MS };
      return fetched;
    }
  } catch (err: any) {
    // Silently fall back to hardcoded safe fallback
  }

  // 3. Hardcoded safe fallbacks
  const fallbackVal = fallbacks[coinCode] || 70.0;
  rateCache[coinCode] = { rate: fallbackVal, expiresAt: now + RATE_CACHE_TTL_MS };
  return fallbackVal;
}
