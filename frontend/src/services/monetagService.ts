/**
 * Official Monetag TMA (Telegram Mini App) Rewarded Ad Integration Service
 * Powered by official 'monetag-tg-sdk' (Zone 11624183)
 */
import createAdHandler from 'monetag-tg-sdk';

const ZONE_ID = (import.meta.env.VITE_MONETAG_ZONE_ID as string) || '11624183';

let adHandlerInstance: ((options?: any) => Promise<any>) | null = null;

/**
 * Initializes, preloads and keeps the Monetag SDK ad handler warm.
 */
export function initAndPreloadMonetagSdk(zoneId: string = ZONE_ID) {
  if (typeof window === 'undefined') return null;
  
  if (!adHandlerInstance) {
    try {
      adHandlerInstance = createAdHandler(Number(zoneId) || 11624183);
      console.log(`[MONETAG TMA SDK]: Official createAdHandler preloaded & ready for Zone ${zoneId}.`);
    } catch (e) {
      console.error('[MONETAG TMA SDK]: Error initializing createAdHandler:', e);
    }
  }
  return adHandlerInstance;
}

// Background warmup runner (runs every 30s to keep SDK primed)
if (typeof window !== 'undefined') {
  initAndPreloadMonetagSdk(ZONE_ID);
  setInterval(() => {
    initAndPreloadMonetagSdk(ZONE_ID);
  }, 30000);
}

/**
 * Triggers the official Monetag Rewarded Interstitial for Zone 11624183.
 * Returns a Promise that resolves ONLY when the user has fully watched the paid ad.
 */
export async function showMonetagRewardedAd(ymid?: string, zoneId: string = ZONE_ID): Promise<boolean> {
  console.log(`[MONETAG TMA]: Requesting paid Rewarded Interstitial for Zone ${zoneId}...`);

  const handler = initAndPreloadMonetagSdk(zoneId);
  const options = ymid ? { ymid, type: 'rewarded' } : { type: 'rewarded' };

  if (handler) {
    try {
      // Execute official Monetag ad handler
      const adPromise = handler(options);

      if (adPromise && typeof adPromise.then === 'function') {
        await adPromise;
      }
      
      console.log('[MONETAG TMA]: Paid Rewarded Ad finished successfully! Monetag publisher revenue registered.');
      return true;
    } catch (error: any) {
      console.error('[MONETAG TMA]: Monetag ad note:', error);
      throw error;
    }
  }

  // Fallback direct window call if available
  const targetFnName = `show_${zoneId}`;
  const showFn = (window as any)[targetFnName];
  if (typeof showFn === 'function') {
    try {
      const res = showFn(options);
      if (res && typeof res.then === 'function') {
        await res;
      }
      return true;
    } catch (fallbackErr) {
      console.error('[MONETAG TMA]: Direct window show error:', fallbackErr);
      throw fallbackErr;
    }
  }

  throw new Error('MONETAG_NOT_READY');
}
