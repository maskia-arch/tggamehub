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

// Minimum required watch time for Rewarded Interstitials (15 seconds)
const MIN_WATCH_TIME_MS = 14500;

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
 * Executes Monetag Rewarded Interstitial (Zone 11624183).
 * Anti-Exploit Enforcement:
 * - Requires the user to watch the full 15-second duration.
 * - Clicking the ad / opening a channel does NOT grant the reward prematurely.
 * - If the user returns early (< 15s), the reward is denied and they must complete the full spot.
 */
export async function showMonetagRewardedAd(): Promise<boolean> {
  console.log(`[MONETAG TMA]: Invoking verified Rewarded Ad for Zone ${ZONE_ID}...`);

  let showFn: Function;
  if (typeof (window as any)[FN_NAME] === 'function') {
    showFn = (window as any)[FN_NAME];
  } else {
    showFn = await getMonetagShowFunction(3000);
  }

  const startTime = Date.now();

  return new Promise<boolean>((resolve, reject) => {
    let isSettled = false;

    const cleanup = () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleVisibility);
    };

    const settleSuccess = () => {
      if (isSettled) return;
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_WATCH_TIME_MS) {
        console.warn(`[MONETAG TMA]: Attempted early claim at ${elapsed}ms. Denied.`);
        settleCancel('AD_CLOSED_TOO_EARLY');
        return;
      }
      isSettled = true;
      cleanup();
      console.log(`[MONETAG TMA]: Verified full 15s+ watch time (${Math.round(elapsed / 1000)}s). Reward authorized!`);
      resolve(true);
    };

    const settleCancel = (reason: string) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      console.warn(`[MONETAG TMA]: Ad reward denied (${reason}).`);
      reject(new Error(reason));
    };

    // Handler when user returns to Mini App (from external link or background)
    const handleReturn = () => {
      const elapsed = Date.now() - startTime;
      console.log(`[MONETAG TMA]: App resumed after ${elapsed}ms.`);
      if (elapsed >= MIN_WATCH_TIME_MS) {
        settleSuccess();
      } else {
        settleCancel('AD_CLOSED_TOO_EARLY');
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleReturn();
      }
    };

    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleVisibility);

    // Trigger Monetag's show function
    try {
      const p = showFn();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          const elapsed = Date.now() - startTime;
          if (elapsed >= MIN_WATCH_TIME_MS) {
            settleSuccess();
          } else {
            // If promise resolved before 15s, wait until full 15s completes
            const remaining = MIN_WATCH_TIME_MS - elapsed;
            setTimeout(settleSuccess, remaining);
          }
        }).catch((err: any) => {
          console.warn('[MONETAG TMA]: Monetag promise rejected:', err);
          const elapsed = Date.now() - startTime;
          if (elapsed >= MIN_WATCH_TIME_MS) {
            settleSuccess();
          } else {
            settleCancel('AD_CLOSED_TOO_EARLY');
          }
        });
      }
    } catch (callErr: any) {
      console.error('[MONETAG TMA]: Direct invocation error:', callErr);
      settleCancel('CALL_FAILED');
    }
  });
}
