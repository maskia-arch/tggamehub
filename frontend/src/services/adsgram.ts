/**
 * Adsgram Integration Service for CoinCade
 * Official Telegram Mini App Ad Monetization (Rewarded Video)
 */

interface AdsgramShowResult {
  done: boolean;
  description: string;
  state: 'load' | 'render' | 'playing' | 'destroy';
  error: boolean;
}

export interface ShowAdResponse {
  success: boolean;
  rewardEarned: boolean;
  error?: string;
}

/**
 * Displays a Rewarded Video Ad via Adsgram.
 * If the user completes the video, rewardEarned will be true.
 * If running in dev/preview or no block ID is configured, simulates a preview ad.
 */
export async function showRewardedAd(): Promise<ShowAdResponse> {
  const blockId = (import.meta.env.VITE_ADSGRAM_BLOCK_ID as string) || '';
  const adsgram = (window as any).Adsgram;

  // Development / Preview mode or unconfigured Block ID
  if (!adsgram || !blockId) {
    console.log('[ADSGRAM]: Live Block ID not configured or SDK unavailable. Running simulated rewarded ad.');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      success: true,
      rewardEarned: true,
    };
  }

  return new Promise((resolve) => {
    try {
      const AdController = adsgram.init({
        blockId,
        debug: Boolean(import.meta.env.DEV),
      });

      AdController.show()
        .then((result: AdsgramShowResult) => {
          console.log('[ADSGRAM]: Rewarded video completed successfully:', result);
          resolve({
            success: true,
            rewardEarned: Boolean(result.done),
          });
        })
        .catch((err: any) => {
          console.warn('[ADSGRAM]: Ad was closed or failed:', err);
          const errorMsg = err?.description || 'Werbung wurde vorzeitig geschlossen';
          resolve({
            success: false,
            rewardEarned: false,
            error: errorMsg,
          });
        });
    } catch (err: any) {
      console.error('[ADSGRAM ERROR]:', err);
      resolve({
        success: false,
        rewardEarned: false,
        error: err.message || 'Fehler beim Laden des Werbeanbieters',
      });
    }
  });
}
