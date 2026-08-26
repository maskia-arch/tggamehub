import { getCustomEmojiId } from './customEmojiService';

/**
 * Renders a single custom emoji in Telegram HTML parse mode:
 * <tg-emoji emoji-id="...">fallback</tg-emoji>
 */
export function ce(emojiKey: string, fallback: string): string {
  const customId = getCustomEmojiId(emojiKey);
  if (customId) {
    return `<tg-emoji emoji-id="${customId}">${fallback}</tg-emoji>`;
  }
  return fallback;
}

/**
 * Returns the seamless 8-emoji pixel-art "COINCADE" banner.
 * In Telegram, putting these 8 custom emojis side by side reconstructs the exact original logo!
 */
export function renderCoinCadeBanner(): string {
  const letters = ['C', 'O', 'I', 'N', 'C', 'A', 'D', 'E'];
  const emojis: string[] = [];

  for (let i = 0; i < 8; i++) {
    const key = `coincade_${i}`;
    const customId = getCustomEmojiId(key);
    if (customId) {
      emojis.push(`<tg-emoji emoji-id="${customId}">${letters[i]}</tg-emoji>`);
    }
  }

  // If all 8 custom emojis are registered, return the combined pixel banner
  if (emojis.length === 8) {
    return emojis.join('');
  }

  // Fallback if custom emoji set is not yet registered in Telegram
  return '<b>⚡ COINCADE ARCADE ⚡</b>';
}

/**
 * Convenience helper dictionary for common CoinCade custom emojis
 */
export const EMOJI = {
  BANNER: () => renderCoinCadeBanner(),
  DOODLE: () => ce('coin_doodle', '🟢'),
  FLAPPY: () => ce('coin_flappy', '🟡'),
  CROSSY: () => ce('coin_crossy', '🔵'),
  CASH: () => ce('coin_gamecash', '💵'),
  ENERGY: () => ce('energy_bolt', '⚡'),
  BATTERY: () => ce('energy_full', '🔋'),
  ROCKET: () => ce('rocket_boost', '🚀'),
  TROPHY_GOLD: () => ce('trophy_gold', '🏆'),
  TROPHY_SILVER: () => ce('trophy_silver', '🥈'),
  TROPHY_BRONZE: () => ce('trophy_bronze', '🥉'),
  CROWN: () => ce('crown_king', '👑'),
  GIFT: () => ce('gift_box', '🎁'),
  STAR: () => ce('star_gold', '⭐'),
  BULL: () => ce('chart_bull', '📈'),
  BEAR: () => ce('chart_bear', '📉'),
  FIRE: () => ce('fire_burn', '🔥'),
  NEWS: () => ce('news_radio', '📡'),
  GAMEPAD: () => ce('arcade_pad', '🎮'),
  SHIELD: () => ce('shield_vip', '🛡️'),
  CHECK: () => ce('check_green', '✅'),
};

/**
 * Replaces token placeholders and "COINCADE" text in any HTML message
 */
export function formatCoinCadeHtml(text: string): string {
  if (!text) return text;

  let formatted = text;

  // Replace banner token or standalone mentions of COINCADE in headers
  formatted = formatted.replace(/\[COINCADE\]/g, renderCoinCadeBanner());

  // Replace shorthand tokens
  formatted = formatted.replace(/\[COIN_DOODLE\]/g, EMOJI.DOODLE());
  formatted = formatted.replace(/\[COIN_FLAPPY\]/g, EMOJI.FLAPPY());
  formatted = formatted.replace(/\[COIN_CROSSY\]/g, EMOJI.CROSSY());
  formatted = formatted.replace(/\[COIN_CASH\]/g, EMOJI.CASH());
  formatted = formatted.replace(/\[ENERGY\]/g, EMOJI.ENERGY());
  formatted = formatted.replace(/\[BATTERY\]/g, EMOJI.BATTERY());
  formatted = formatted.replace(/\[ROCKET\]/g, EMOJI.ROCKET());
  formatted = formatted.replace(/\[TROPHY_GOLD\]/g, EMOJI.TROPHY_GOLD());
  formatted = formatted.replace(/\[TROPHY_SILVER\]/g, EMOJI.TROPHY_SILVER());
  formatted = formatted.replace(/\[TROPHY_BRONZE\]/g, EMOJI.TROPHY_BRONZE());
  formatted = formatted.replace(/\[CROWN\]/g, EMOJI.CROWN());
  formatted = formatted.replace(/\[GIFT\]/g, EMOJI.GIFT());
  formatted = formatted.replace(/\[STAR\]/g, EMOJI.STAR());
  formatted = formatted.replace(/\[BULL\]/g, EMOJI.BULL());
  formatted = formatted.replace(/\[BEAR\]/g, EMOJI.BEAR());
  formatted = formatted.replace(/\[FIRE\]/g, EMOJI.FIRE());
  formatted = formatted.replace(/\[NEWS\]/g, EMOJI.NEWS());
  formatted = formatted.replace(/\[GAMEPAD\]/g, EMOJI.GAMEPAD());
  formatted = formatted.replace(/\[SHIELD\]/g, EMOJI.SHIELD());
  formatted = formatted.replace(/\[CHECK\]/g, EMOJI.CHECK());

  return formatted;
}
