/**
 * Official Monetag TMA (Telegram Mini App) Rewarded Ad Service
 * Zone ID: 11624183
 * Script: <script src="https://libtl.com/sdk.js" data-zone="11624183" data-sdk="show_11624183"></script>
 */

declare global {
  interface Window {
    show_11624183?: () => Promise<void>;
  }
}

const ZONE_ID = (import.meta.env.VITE_MONETAG_ZONE_ID as string) || '11624183';
const FN_NAME = `show_${ZONE_ID}`;

/**
 * Finds and returns the global Monetag show function.
 * Polls up to timeoutMs (default: 3000ms) if the script is still loading.
 */
async function getMonetagShowFunction(timeoutMs = 3000): Promise<Function> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (typeof (window as any)[FN_NAME] === 'function') {
      return (window as any)[FN_NAME];
    }

    const anyShowKey = Object.keys(window).find(
      (k) => k.startsWith('show_') && typeof (window as any)[k] === 'function'
    );
    if (anyShowKey) {
      return (window as any)[anyShowKey];
    }

    await new Promise((r) => setTimeout(r, 50));
  }

  throw new Error('MONETAG_SDK_NOT_LOADED');
}

/**
 * Executes Monetag's official:
 * show_11624183().then(() => { ... })
 */
export async function showMonetagRewardedAd(): Promise<boolean> {
  console.log(`[MONETAG TMA]: Calling show_${ZONE_ID}()...`);

  let showFn: Function;
  if (typeof (window as any)[FN_NAME] === 'function') {
    showFn = (window as any)[FN_NAME];
  } else {
    showFn = await getMonetagShowFunction(3000);
  }

  try {
    // Official execution: show_11624183().then(...)
    const adPromise = showFn();
    if (adPromise && typeof adPromise.then === 'function') {
      await adPromise;
    }
    console.log(`[MONETAG TMA]: show_${ZONE_ID}() promise resolved successfully!`);
    return true;
  } catch (err: any) {
    console.error(`[MONETAG TMA]: show_${ZONE_ID}() error or cancelled:`, err);
    throw err;
  }
}
