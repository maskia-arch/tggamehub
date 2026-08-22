/**
 * Official Monetag TMA (Telegram Mini App) Rewarded Ad Integration Service
 * Powered by official 'monetag-tg-sdk' (Zone 11624183)
 */
import createAdHandler from 'monetag-tg-sdk';

const ZONE_ID = (import.meta.env.VITE_MONETAG_ZONE_ID as string) || '11624183';

let adHandlerInstance: ((options?: any) => Promise<any>) | null = null;

/**
 * Initializes and caches the Monetag SDK ad handler instance.
 */
export function getMonetagAdHandler(zoneId: string = ZONE_ID) {
  if (typeof window === 'undefined') return null;
  if (!adHandlerInstance) {
    try {
      adHandlerInstance = createAdHandler(Number(zoneId) || 11624183);
      console.log(`[MONETAG TMA SDK]: Official createAdHandler initialized for Zone ${zoneId}.`);
    } catch (e) {
      console.error('[MONETAG TMA SDK]: Error initializing createAdHandler:', e);
    }
  }
  return adHandlerInstance;
}

// Auto-initialize SDK on module import
if (typeof window !== 'undefined') {
  getMonetagAdHandler(ZONE_ID);
}

/**
 * Triggers the official Monetag Rewarded Interstitial for Zone 11624183.
 * Returns a Promise that resolves ONLY when the user has fully watched the paid ad.
 */
export async function showMonetagRewardedAd(ymid?: string, zoneId: string = ZONE_ID): Promise<boolean> {
  console.log(`[MONETAG TMA]: Requesting paid Rewarded Interstitial for Zone ${zoneId}...`);

  const handler = getMonetagAdHandler(zoneId);
  const options = ymid ? { ymid, type: 'rewarded' } : { type: 'rewarded' };

  if (handler) {
    try {
      await handler(options);
      console.log('[MONETAG TMA]: Paid Rewarded Ad finished successfully! Monetag publisher revenue registered.');
      return true;
    } catch (error) {
      console.error('[MONETAG TMA]: Monetag ad closed early or failed to display:', error);
      throw error;
    }
  }

  // Fallback direct window call if handler wasn't instantiated
  const targetFnName = `show_${zoneId}`;
  const showFn = (window as any)[targetFnName];
  if (typeof showFn === 'function') {
    const res = showFn(options);
    if (res && typeof res.then === 'function') {
      await res;
    }
    return true;
  }

  throw new Error('MONETAG_NOT_READY');
}
