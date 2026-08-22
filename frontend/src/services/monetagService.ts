/**
 * Official Monetag TMA (Telegram Mini App) Rewarded Ad Service
 * Zone ID: 11624183 (Mini App)
 * Tag: <script src="//libtl.com/sdk.js" data-zone="11624183" data-sdk="show_11624183"></script>
 */

declare global {
  interface Window {
    show_11624183?: (options?: any) => Promise<void>;
  }
}

export async function showMonetagRewardedAd(): Promise<boolean> {
  console.log('[MONETAG TMA]: Requesting official show_11624183()...');

  let showFn = (window as any).show_11624183;
  if (typeof showFn !== 'function') {
    // Poll up to 3000ms if script is still downloading
    const startTime = Date.now();
    while (Date.now() - startTime < 3000) {
      if (typeof (window as any).show_11624183 === 'function') {
        showFn = (window as any).show_11624183;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  if (typeof showFn !== 'function') {
    throw new Error('MONETAG_SDK_NOT_LOADED');
  }

  // Official execution: show_11624183().then(...)
  try {
    const res = showFn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    console.log('[MONETAG TMA]: show_11624183() completed successfully!');
    return true;
  } catch (err: any) {
    console.error('[MONETAG TMA]: show_11624183() error or dismissed:', err);
    throw err;
  }
}
