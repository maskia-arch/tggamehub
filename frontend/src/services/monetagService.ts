/**
 * Official Monetag TMA (Telegram Mini App) Rewarded Ad Integration Service
 * Tag: <script src="https://libtl.com/sdk.js" data-zone="11624183" data-sdk="show_11624183"></script>
 */

const ZONE_ID = (import.meta.env.VITE_MONETAG_ZONE_ID as string) || '11624183';
const SDK_FN_NAME = `show_${ZONE_ID}`;

let isScriptInjected = false;

/**
 * Ensures the official Monetag libtl.com SDK is injected into the DOM.
 */
export function ensureMonetagSdkInjected(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (typeof (window as any)[SDK_FN_NAME] === 'function') {
    return Promise.resolve(true);
  }

  if (isScriptInjected) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    // Check if script already exists in document
    const existingScript = document.querySelector(`script[data-zone="${ZONE_ID}"]`);
    if (existingScript) {
      isScriptInjected = true;
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://libtl.com/sdk.js';
    script.dataset.zone = ZONE_ID;
    script.dataset.sdk = SDK_FN_NAME;
    script.async = true;

    script.onload = () => {
      console.log(`[MONETAG TMA SDK]: Official libtl.com SDK loaded for Zone ${ZONE_ID}.`);
      isScriptInjected = true;
      resolve(true);
    };

    script.onerror = (err) => {
      console.error('[MONETAG TMA SDK]: Error loading libtl.com script:', err);
      resolve(false);
    };

    document.head.appendChild(script);
  });
}

// Auto-inject on app start
if (typeof window !== 'undefined') {
  ensureMonetagSdkInjected();
}

/**
 * Executes Monetag Rewarded Interstitial Ad (Zone 11624183) with ONE single tap.
 * Returns Promise<boolean> that resolves when ad is completed.
 */
export async function showMonetagRewardedAd(ymid?: string): Promise<boolean> {
  console.log(`[MONETAG TMA]: Triggering 1-Tap Rewarded Ad (Zone ${ZONE_ID})...`);

  // Ensure script is ready
  await ensureMonetagSdkInjected();

  // Find show function
  let showFn = (window as any)[SDK_FN_NAME];

  if (typeof showFn !== 'function') {
    // Wait briefly (up to 1500ms) for script parse if user tapped immediately on page load
    const startTime = Date.now();
    while (Date.now() - startTime < 1500) {
      if (typeof (window as any)[SDK_FN_NAME] === 'function') {
        showFn = (window as any)[SDK_FN_NAME];
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (typeof showFn !== 'function') {
    // Look for any global show_XXXX function
    const anyShowKey = Object.keys(window).find(
      (k) => k.startsWith('show_') && typeof (window as any)[k] === 'function'
    );
    if (anyShowKey) {
      showFn = (window as any)[anyShowKey];
    }
  }

  if (typeof showFn !== 'function') {
    throw new Error('MONETAG_NOT_READY');
  }

  // Call official Monetag function
  try {
    const options = ymid ? { ymid, type: 'rewarded' } : { type: 'rewarded' };
    const res = showFn(options) || showFn();

    if (res && typeof res.then === 'function') {
      await res;
    }

    console.log('[MONETAG TMA]: Paid Ad finished! Publisher revenue registered.');
    return true;
  } catch (err: any) {
    console.error('[MONETAG TMA]: Ad display error or closed early:', err);
    throw err;
  }
}
