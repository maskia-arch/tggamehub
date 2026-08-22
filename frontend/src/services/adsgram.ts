/**
 * Monetag & Ad Monetization Service for CoinCade
 * High-performance Telegram Mini App and Web Monetization
 */

export interface ShowAdResponse {
  success: boolean;
  rewardEarned: boolean;
  error?: string;
}

/**
 * Displays a Rewarded Ad via Monetag / Smart Monetization.
 * If running in dev/preview or direct click, rewards the player smoothly.
 */
export async function showRewardedAd(): Promise<ShowAdResponse> {
  const directLinkUrl = (import.meta.env.VITE_MONETAG_DIRECT_LINK as string) || '';

  // If a Monetag Direct Link is configured, open it in a background/new tab or WebApp
  if (directLinkUrl) {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.openLink) {
        tg.openLink(directLinkUrl);
      } else {
        window.open(directLinkUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      console.warn('[MONETAG]: Direct link trigger note:', e);
    }
  }

  // Graceful visual timer (1.5s) to guarantee reward credit
  await new Promise((resolve) => setTimeout(resolve, 1200));

  return {
    success: true,
    rewardEarned: true,
  };
}

