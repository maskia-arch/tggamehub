/**
 * Official Monetag TMA (Telegram Mini App) Rewarded & In-App Ad Service
 * Zone ID: 11624183 (Mini App)
 * Tag: <script src="//libtl.com/sdk.js" data-zone="11624183" data-sdk="show_11624183"></script>
 */

declare global {
  interface Window {
    show_11624183?: (options?: any) => Promise<void>;
  }
}

export async function showMonetagRewardedAd(mode: 'rewarded' | 'pop' | 'inApp' = 'rewarded'): Promise<boolean> {
  console.log(`[MONETAG TMA]: Requesting official show_11624183(${mode})...`);

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

  try {
    let res: any;
    if (mode === 'pop') {
      res = showFn('pop');
    } else if (mode === 'inApp') {
      res = showFn({
        type: 'inApp',
        inAppSettings: {
          frequency: 2,
          capping: 0.1,
          interval: 30,
          timeout: 5,
          everyPage: false,
        },
      });
    } else {
      res = showFn();
    }

    if (res && typeof res.then === 'function') {
      await res;
    }
    console.log(`[MONETAG TMA]: show_11624183(${mode}) finished successfully!`);
    return true;
  } catch (err: any) {
    console.warn(`[MONETAG TMA]: show_11624183(${mode}) note:`, err);
    throw err;
  }
}
