import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

export interface EmojiDefinition {
  key: string;
  filename: string;
  emojiChar: string;
  category: 'banner' | 'coin' | 'energy' | 'reward' | 'market' | 'system';
  title: string;
}

export const CUSTOM_EMOJI_CATALOG: EmojiDefinition[] = [
  // ── 1. CoinCade Pixel-Art Banner Slices (8 Slices) ─────────────────────────
  { key: 'coincade_0', filename: 'coincade_0.png', emojiChar: 'C', category: 'banner', title: 'CoinCade Banner Letter C' },
  { key: 'coincade_1', filename: 'coincade_1.png', emojiChar: 'O', category: 'banner', title: 'CoinCade Banner Coin O' },
  { key: 'coincade_2', filename: 'coincade_2.png', emojiChar: 'I', category: 'banner', title: 'CoinCade Banner Letter I' },
  { key: 'coincade_3', filename: 'coincade_3.png', emojiChar: 'N', category: 'banner', title: 'CoinCade Banner Letter N' },
  { key: 'coincade_4', filename: 'coincade_4.png', emojiChar: 'C', category: 'banner', title: 'CoinCade Banner Letter C' },
  { key: 'coincade_5', filename: 'coincade_5.png', emojiChar: 'A', category: 'banner', title: 'CoinCade Banner Letter A' },
  { key: 'coincade_6', filename: 'coincade_6.png', emojiChar: 'D', category: 'banner', title: 'CoinCade Banner Letter D' },
  { key: 'coincade_7', filename: 'coincade_7.png', emojiChar: 'E', category: 'banner', title: 'CoinCade Banner Letter E' },

  // ── 2. Crypto Game Tokens ──────────────────────────────────────────────────
  { key: 'coin_doodle', filename: 'coin_doodle.png', emojiChar: '🟢', category: 'coin', title: '$DOODLE Jump Coin' },
  { key: 'coin_flappy', filename: 'coin_flappy.png', emojiChar: '🟡', category: 'coin', title: '$FLAPPY Bird Coin' },
  { key: 'coin_crossy', filename: 'coin_crossy.png', emojiChar: '🔵', category: 'coin', title: '$CROSSY Neon Coin' },
  { key: 'coin_stack', filename: 'coin_stack.png', emojiChar: '🧱', category: 'coin', title: '$STACK Stacking Coin' },
  { key: 'coin_gamecash', filename: 'coin_gamecash.png', emojiChar: '💵', category: 'coin', title: 'Game Cash Dollar Token' },

  // ── 3. Energy & Boosters ───────────────────────────────────────────────────
  { key: 'energy_bolt', filename: 'energy_bolt.png', emojiChar: '⚡', category: 'energy', title: 'Cyber Lightning Power Cell' },
  { key: 'energy_full', filename: 'energy_full.png', emojiChar: '🔋', category: 'energy', title: 'Overcharged Neon Battery' },
  { key: 'rocket_boost', filename: 'rocket_boost.png', emojiChar: '🚀', category: 'energy', title: 'Time Booster Rocket' },

  // ── 4. Ranks & Rewards ─────────────────────────────────────────────────────
  { key: 'trophy_gold', filename: 'trophy_gold.png', emojiChar: '🏆', category: 'reward', title: '1st Rank Cyber Cup Gold' },
  { key: 'trophy_silver', filename: 'trophy_silver.png', emojiChar: '🥈', category: 'reward', title: '2nd Rank Cyber Cup Silver' },
  { key: 'trophy_bronze', filename: 'trophy_bronze.png', emojiChar: '🥉', category: 'reward', title: '3rd Rank Cyber Cup Bronze' },
  { key: 'crown_king', filename: 'crown_king.png', emojiChar: '👑', category: 'reward', title: 'Season Pot Grand Crown' },
  { key: 'gift_box', filename: 'gift_box.png', emojiChar: '🎁', category: 'reward', title: 'Airdrop Mystery Box' },
  { key: 'star_gold', filename: 'star_gold.png', emojiChar: '⭐', category: 'reward', title: 'Arcade Star Badge' },

  // ── 5. Market & System ─────────────────────────────────────────────────────
  { key: 'chart_bull', filename: 'chart_bull.png', emojiChar: '📈', category: 'market', title: 'Bullish Surge Candlestick' },
  { key: 'chart_bear', filename: 'chart_bear.png', emojiChar: '📉', category: 'market', title: 'Bearish Pullback Candlestick' },
  { key: 'fire_burn', filename: 'fire_burn.png', emojiChar: '🔥', category: 'market', title: 'Token Burn Flame' },
  { key: 'news_radio', filename: 'news_radio.png', emojiChar: '📡', category: 'system', title: 'DeepSeek AI Breaking News Beacon' },
  { key: 'arcade_pad', filename: 'arcade_pad.png', emojiChar: '🎮', category: 'system', title: 'Neon Gamepad Arcade Console' },
  { key: 'shield_vip', filename: 'shield_vip.png', emojiChar: '🛡️', category: 'system', title: 'VIP Season Pass Shield' },
  { key: 'check_green', filename: 'check_green.png', emojiChar: '✅', category: 'system', title: 'Verified Status Badge' },
];

const TARGET_SIZE = 100; // Telegram custom emoji standard dimension (100x100)

/**
 * Returns the directory where emoji PNG assets are stored
 */
export function getEmojisDirectory(): string {
  const dir = path.join(__dirname, '../assets/emojis');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generates all 100x100 PNG custom emoji assets
 */
export async function generateAllCustomEmojiAssets(): Promise<{ total: number; generated: number }> {
  const emojiDir = getEmojisDirectory();
  console.log(`[Custom Emoji Generator]: Checking assets in ${emojiDir}...`);

  let generatedCount = 0;

  // 1. Generate the 8 Banner Slices from source image
  const possibleBannerPaths = [
    path.join(__dirname, '../assets/coincade_banner_source.png'),
    path.join(__dirname, '../../src/assets/coincade_banner_source.png'),
    path.join(process.cwd(), 'backend/src/assets/coincade_banner_source.png'),
    path.join(process.cwd(), 'src/assets/coincade_banner_source.png'),
  ];
  const bannerSourcePath = possibleBannerPaths.find(p => fs.existsSync(p));

  if (bannerSourcePath) {
    console.log(`[Custom Emoji Generator]: Found banner source at ${bannerSourcePath}. Slicing into 8 squares...`);
    const bannerSlicesGenerated = generateBannerSlices(bannerSourcePath, emojiDir);
    generatedCount += bannerSlicesGenerated;
  } else {
    console.warn(`[Custom Emoji Generator]: Banner source not found in searched locations. Generating procedural banner letters.`);
    for (let i = 0; i < 8; i++) {
      const filePath = path.join(emojiDir, `coincade_${i}.png`);
      if (!fs.existsSync(filePath)) {
        createProceduralLetterPng(filePath, i);
        generatedCount++;
      }
    }
  }

  // 2. Generate all other custom pixel/vector icons
  for (const def of CUSTOM_EMOJI_CATALOG) {
    if (def.category === 'banner') continue; // Already processed

    const targetFile = path.join(emojiDir, def.filename);
    if (!fs.existsSync(targetFile)) {
      generateThemedIconPng(targetFile, def.key);
      generatedCount++;
    }
  }

  // 3. Mirror all PNG assets to frontend/public/assets/badges for WebApp usage
  try {
    const possibleFrontendPaths = [
      path.join(process.cwd(), 'frontend/public/assets/badges'),
      path.join(__dirname, '../../../frontend/public/assets/badges'),
      path.join(__dirname, '../../../../frontend/public/assets/badges'),
    ];
    const frontendBadgesDir = possibleFrontendPaths.find(p => fs.existsSync(path.dirname(p)));
    if (frontendBadgesDir) {
      if (!fs.existsSync(frontendBadgesDir)) {
        fs.mkdirSync(frontendBadgesDir, { recursive: true });
      }
      const files = fs.readdirSync(emojiDir);
      for (const f of files) {
        if (f.endsWith('.png')) {
          fs.copyFileSync(path.join(emojiDir, f), path.join(frontendBadgesDir, f));
        }
      }
      console.log(`[Custom Emoji Generator]: Synchronized ${files.length} PNG assets to frontend: ${frontendBadgesDir}`);
    }
  } catch (feErr: any) {
    console.warn('[Custom Emoji Generator]: Could not sync to frontend/public:', feErr.message);
  }

  console.log(`[Custom Emoji Generator]: Emoji catalog verified. Total items: ${CUSTOM_EMOJI_CATALOG.length}, Newly generated: ${generatedCount}`);
  return { total: CUSTOM_EMOJI_CATALOG.length, generated: generatedCount };
}

/**
 * Slices the high-res 1024x341 banner into 8 seamless 100x100 squares
 */
function generateBannerSlices(sourcePath: string, outputDir: string): number {
  const data = fs.readFileSync(sourcePath);
  const srcPng = PNG.sync.read(data);

  const numSlices = 8;
  const sliceW = srcPng.width / numSlices; // 128
  const cropY = 80;
  const cropH = 170; // 80..250 vertical window captures all letters with perfect centering

  let count = 0;

  for (let s = 0; s < numSlices; s++) {
    const targetPath = path.join(outputDir, `coincade_${s}.png`);
    if (fs.existsSync(targetPath)) continue;

    const outPng = new PNG({ width: TARGET_SIZE, height: TARGET_SIZE });

    // Initialize transparent
    for (let i = 0; i < TARGET_SIZE * TARGET_SIZE * 4; i++) {
      outPng.data[i] = 0;
    }

    // Map the slice box seamlessly into 100x100 so right-edge of slice N connects to left-edge of N+1
    for (let dy = 0; dy < TARGET_SIZE; dy++) {
      for (let dx = 0; dx < TARGET_SIZE; dx++) {
        const srcX = Math.floor(s * sliceW + (dx / TARGET_SIZE) * sliceW);
        const srcY = Math.floor(cropY + (dy / TARGET_SIZE) * cropH);

        if (srcX >= 0 && srcX < srcPng.width && srcY >= 0 && srcY < srcPng.height) {
          const srcIdx = (srcPng.width * srcY + srcX) << 2;
          const dstIdx = (TARGET_SIZE * dy + dx) << 2;

          outPng.data[dstIdx] = srcPng.data[srcIdx];         // R
          outPng.data[dstIdx + 1] = srcPng.data[srcIdx + 1]; // G
          outPng.data[dstIdx + 2] = srcPng.data[srcIdx + 2]; // B
          outPng.data[dstIdx + 3] = srcPng.data[srcIdx + 3]; // A
        }
      }
    }

    const buffer = PNG.sync.write(outPng);
    fs.writeFileSync(targetPath, buffer);
    count++;
  }

  return count;
}

/**
 * Creates procedural letter PNG in case source banner is not present
 */
function createProceduralLetterPng(filePath: string, index: number) {
  const png = new PNG({ width: TARGET_SIZE, height: TARGET_SIZE });
  const isGold = index < 4;
  const primaryColor = isGold ? [251, 191, 36] : [0, 242, 254];

  fillCanvas(png, (x, y) => {
    // Draw rounded pixel square with letter
    const dist = Math.max(Math.abs(x - 50), Math.abs(y - 50));
    if (dist < 44) {
      if (dist > 40) return [primaryColor[0], primaryColor[1], primaryColor[2], 255];
      if (dist > 36) return [10, 14, 26, 255];
      return [primaryColor[0], primaryColor[1], primaryColor[2], 230];
    }
    return [0, 0, 0, 0];
  });

  fs.writeFileSync(filePath, PNG.sync.write(png));
}

/**
 * Procedurally draws high-quality pixel/neon styled icons for CoinCade
 */
function generateThemedIconPng(filePath: string, key: string) {
  const png = new PNG({ width: TARGET_SIZE, height: TARGET_SIZE });

  switch (key) {
    case 'coin_doodle':
      // Emerald Green Neon Jump Coin with center spring
      renderGlowingCoin(png, [16, 185, 129], [5, 150, 105], 'spring');
      break;

    case 'coin_flappy':
      // Radiant Gold Flappy Bird Coin with wings
      renderGlowingCoin(png, [251, 191, 36], [217, 119, 6], 'wing');
      break;

    case 'coin_crossy':
      // Electric Cyan Crossy Road Coin with arrows
      renderGlowingCoin(png, [0, 242, 254], [2, 132, 199], 'cross');
      break;

    case 'coin_stack':
      // Vibrant Magenta / Purple Neon Stacking Coin with brick layers
      renderGlowingCoin(png, [255, 0, 127], [168, 85, 247], 'stack');
      break;

    case 'coin_gamecash':
      // Golden Dollar Cash Token
      renderGlowingCoin(png, [245, 158, 11], [180, 83, 9], 'dollar');
      break;

    case 'energy_bolt':
      // Electric Neon Lightning Power Bolt
      renderLightningBolt(png);
      break;

    case 'energy_full':
      // Overcharged Battery
      renderBattery(png);
      break;

    case 'rocket_boost':
      // Cyber Rocket
      renderRocket(png);
      break;

    case 'trophy_gold':
      renderTrophy(png, [251, 191, 36], [217, 119, 6], '1');
      break;

    case 'trophy_silver':
      renderTrophy(png, [226, 232, 240], [148, 163, 184], '2');
      break;

    case 'trophy_bronze':
      renderTrophy(png, [217, 119, 6], [146, 64, 14], '3');
      break;

    case 'crown_king':
      renderCrown(png);
      break;

    case 'gift_box':
      renderGiftBox(png);
      break;

    case 'chart_bull':
      renderCandleChart(png, true);
      break;

    case 'chart_bear':
      renderCandleChart(png, false);
      break;

    case 'fire_burn':
      renderFlame(png);
      break;

    case 'news_radio':
      renderSatelliteBeacon(png);
      break;

    case 'arcade_pad':
      renderGamepad(png);
      break;

    case 'shield_vip':
      renderShield(png);
      break;

    case 'check_green':
      renderCheckmark(png);
      break;

    case 'star_gold':
    default:
      renderStar(png);
      break;
  }

  fs.writeFileSync(filePath, PNG.sync.write(png));
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWING PRIMITIVES & PROCEDURAL RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

function fillCanvas(png: PNG, colorFn: (x: number, y: number) => [number, number, number, number]) {
  for (let y = 0; y < TARGET_SIZE; y++) {
    for (let x = 0; x < TARGET_SIZE; x++) {
      const [r, g, b, a] = colorFn(x, y);
      const idx = (TARGET_SIZE * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

function renderGlowingCoin(png: PNG, outerColor: number[], innerColor: number[], emblem: 'spring' | 'wing' | 'cross' | 'stack' | 'dollar') {
  fillCanvas(png, (x, y) => {
    const dx = x - 50;
    const dy = y - 50;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 46) return [0, 0, 0, 0];
    if (dist > 42) return [outerColor[0], outerColor[1], outerColor[2], 255]; // Outer glowing neon ring
    if (dist > 38) return [10, 14, 26, 255]; // Dark inner bevel
    if (dist > 34) return [outerColor[0], outerColor[1], outerColor[2], 220]; // Accent ring

    // Inside coin face
    if (emblem === 'dollar') {
      if (Math.abs(dx) <= 4 && dy >= -22 && dy <= 22) return [255, 255, 255, 255]; // Vertical bar
      if (Math.abs(dy) <= 3 && Math.abs(dx) <= 12) return [255, 255, 255, 255]; // Middle bar
      if (dy >= -16 && dy <= -12 && Math.abs(dx) <= 12) return [255, 255, 255, 255]; // Top bar
      if (dy >= 12 && dy <= 16 && Math.abs(dx) <= 12) return [255, 255, 255, 255]; // Bottom bar
    } else if (emblem === 'cross') {
      if ((Math.abs(dx) <= 5 && Math.abs(dy) <= 20) || (Math.abs(dy) <= 5 && Math.abs(dx) <= 20)) {
        return [255, 255, 255, 255];
      }
    } else if (emblem === 'stack') {
      if ((Math.abs(dx) <= 16 && dy >= -18 && dy <= -10) || 
          (Math.abs(dx) <= 16 && dy >= -6 && dy <= 2) || 
          (Math.abs(dx) <= 16 && dy >= 6 && dy <= 14)) {
        return [255, 255, 255, 255];
      }
    } else if (emblem === 'wing') {
      if (Math.abs(dx) - dy * 0.4 <= 16 && dy >= -10 && dy <= 18) {
        return [255, 255, 255, 255];
      }
    } else if (emblem === 'spring') {
      if (Math.abs(dx) <= 14 && Math.abs(Math.sin(dy * 0.3) * 12 - dx) <= 4 && dy >= -20 && dy <= 20) {
        return [255, 255, 255, 255];
      }
    }

    return [innerColor[0], innerColor[1], innerColor[2], 255];
  });
}

function renderLightningBolt(png: PNG) {
  fillCanvas(png, (x, y) => {
    // Sharp stylized zigzag lightning bolt
    const inUpper = (x >= 42 - y * 0.4 && x <= 68 - y * 0.4 && y >= 10 && y <= 48);
    const inLower = (x >= 24 - (y - 50) * 0.6 && x <= 52 - (y - 50) * 0.6 && y >= 45 && y <= 90);
    const inCross = (y >= 44 && y <= 52 && x >= 24 && x <= 72);

    if (inUpper || inLower || inCross) {
      if (x >= 40 && x <= 58 && y >= 25 && y <= 75) return [255, 255, 255, 255]; // White hot core
      return [0, 242, 254, 255]; // Electric cyan outer
    }

    // Outer glow aura
    const dx = x - 50;
    const dy = y - 50;
    if (dx * dx + dy * dy < 1600 && Math.random() > 0.85) {
      return [0, 242, 254, 100];
    }
    return [0, 0, 0, 0];
  });
}

function renderBattery(png: PNG) {
  fillCanvas(png, (x, y) => {
    // Battery tip
    if (x >= 42 && x <= 58 && y >= 10 && y <= 16) return [52, 211, 153, 255];
    // Outer body
    if (x >= 24 && x <= 76 && y >= 18 && y <= 88) {
      if (x <= 28 || x >= 72 || y <= 22 || y >= 84) return [52, 211, 153, 255];
      // Power cells inside
      if (y >= 30 && y <= 42 && x >= 32 && x <= 68) return [52, 211, 153, 255];
      if (y >= 48 && y <= 60 && x >= 32 && x <= 68) return [52, 211, 153, 255];
      if (y >= 66 && y <= 78 && x >= 32 && x <= 68) return [52, 211, 153, 255];
      return [10, 14, 26, 255];
    }
    return [0, 0, 0, 0];
  });
}

function renderTrophy(png: PNG, gold1: number[], gold2: number[], rank: string) {
  fillCanvas(png, (x, y) => {
    const dx = Math.abs(x - 50);
    // Cup
    if (y >= 14 && y <= 52 && dx <= (y - 14) * 0.4 + 20) {
      if (dx <= 4 && y >= 26 && y <= 40 && rank === '1') return [255, 255, 255, 255];
      return [gold1[0], gold1[1], gold1[2], 255];
    }
    // Handles
    if (y >= 20 && y <= 42 && dx >= 20 && dx <= 34 && Math.abs(y - 31) <= 10) {
      return [gold2[0], gold2[1], gold2[2], 255];
    }
    // Stem
    if (y >= 52 && y <= 68 && dx <= 8) return [gold2[0], gold2[1], gold2[2], 255];
    // Base
    if (y >= 68 && y <= 86 && dx <= 26) return [gold1[0], gold1[1], gold1[2], 255];
    return [0, 0, 0, 0];
  });
}

function renderCrown(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = Math.abs(x - 50);
    if (y >= 45 && y <= 75 && dx <= 38) {
      // 3 peaks
      const peak1 = dx <= 8 && y >= 20;
      const peak2 = dx >= 24 && dx <= 36 && y >= 25;
      if (y >= 55 || peak1 || peak2) {
        if (y >= 68) return [217, 119, 6, 255]; // Velvet band
        return [251, 191, 36, 255]; // Gold
      }
    }
    // Jewels
    if ((x === 50 && y === 18) || (Math.abs(x - 50) === 30 && y === 23)) {
      return [239, 68, 68, 255]; // Ruby
    }
    return [0, 0, 0, 0];
  });
}

function renderGiftBox(png: PNG) {
  fillCanvas(png, (x, y) => {
    // Box lid
    if (x >= 20 && x <= 80 && y >= 26 && y <= 40) {
      if (Math.abs(x - 50) <= 6) return [251, 191, 36, 255]; // Gold ribbon
      return [168, 85, 247, 255]; // Purple box
    }
    // Box body
    if (x >= 26 && x <= 74 && y >= 42 && y <= 84) {
      if (Math.abs(x - 50) <= 6 || (y >= 58 && y <= 66)) return [251, 191, 36, 255]; // Ribbon
      return [147, 51, 234, 255];
    }
    // Ribbon bow
    if (y >= 14 && y <= 26 && Math.abs(x - 50) <= 16) {
      return [251, 191, 36, 255];
    }
    return [0, 0, 0, 0];
  });
}

function renderCandleChart(png: PNG, isBull: boolean) {
  const color = isBull ? [52, 211, 153] : [248, 113, 113];
  fillCanvas(png, (x, y) => {
    // Wick
    if (Math.abs(x - 50) <= 2 && y >= 14 && y <= 86) return [color[0], color[1], color[2], 255];
    // Candle body
    const bodyTop = isBull ? 28 : 42;
    const bodyBottom = isBull ? 68 : 78;
    if (x >= 32 && x <= 68 && y >= bodyTop && y <= bodyBottom) {
      return [color[0], color[1], color[2], 255];
    }
    // Arrow
    if (isBull) {
      if (y <= 24 && Math.abs(x - 50) <= (24 - y)) return [color[0], color[1], color[2], 255];
    } else {
      if (y >= 76 && Math.abs(x - 50) <= (y - 76)) return [color[0], color[1], color[2], 255];
    }
    return [0, 0, 0, 0];
  });
}

function renderFlame(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = x - 50;
    const dy = y - 60;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r <= 32 && y <= 84) {
      if (r <= 14) return [255, 255, 255, 255]; // Core
      if (r <= 22) return [251, 191, 36, 255]; // Yellow
      return [239, 68, 68, 255]; // Red outer
    }
    return [0, 0, 0, 0];
  });
}

function renderSatelliteBeacon(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = x - 50;
    const dy = y - 50;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Dish / Antenna
    if (dist <= 36 && dist >= 30 && y <= 60) return [0, 242, 254, 255];
    if (dist <= 22 && dist >= 16 && y <= 55) return [0, 242, 254, 255];
    // Center beacon emitter
    if (dist <= 8) return [255, 255, 255, 255];
    // Stand
    if (Math.abs(dx) <= 4 && y >= 50 && y <= 82) return [148, 163, 184, 255];
    if (Math.abs(dx) <= 24 && y >= 80 && y <= 88) return [148, 163, 184, 255];
    return [0, 0, 0, 0];
  });
}

function renderGamepad(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = Math.abs(x - 50);
    // Main body
    if (dx <= 38 && y >= 32 && y <= 72) {
      // D-Pad
      if (x >= 22 && x <= 38 && y >= 44 && y <= 60) {
        if (Math.abs(x - 30) <= 3 || Math.abs(y - 52) <= 3) return [0, 242, 254, 255];
      }
      // ABXY Buttons
      if (x >= 62 && x <= 78 && y >= 44 && y <= 60) {
        return [251, 191, 36, 255];
      }
      return [30, 41, 59, 255];
    }
    return [0, 0, 0, 0];
  });
}

function renderShield(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = Math.abs(x - 50);
    if (y >= 16 && y <= 84 && dx <= 36 - (y > 45 ? (y - 45) * 0.8 : 0)) {
      if (dx <= 4 || y <= 24) return [0, 242, 254, 255]; // Neon cyan border
      return [16, 24, 39, 255];
    }
    return [0, 0, 0, 0];
  });
}

function renderRocket(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = Math.abs(x - 50);
    // Rocket cone & body
    if (y >= 14 && y <= 70 && dx <= (y <= 35 ? (y - 14) * 0.6 : 14)) {
      // Porthole
      if (dx * dx + (y - 40) * (y - 40) <= 36) return [0, 242, 254, 255];
      return [241, 245, 249, 255];
    }
    // Wings
    if (y >= 50 && y <= 76 && dx >= 14 && dx <= 32) return [239, 68, 68, 255];
    // Flame
    if (y >= 70 && y <= 90 && dx <= 8) return [251, 191, 36, 255];
    return [0, 0, 0, 0];
  });
}

function renderCheckmark(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = x - 50;
    const dy = y - 50;
    if (dx * dx + dy * dy <= 1600) {
      // Checkmark check
      if ((x >= 28 && x <= 46 && y >= 45 && y <= 65 && Math.abs((x - 28) - (y - 45)) <= 5) ||
          (x >= 44 && x <= 74 && y >= 30 && y <= 65 && Math.abs((x - 44) + (y - 65)) <= 6)) {
        return [255, 255, 255, 255];
      }
      return [52, 211, 153, 255];
    }
    return [0, 0, 0, 0];
  });
}

function renderStar(png: PNG) {
  fillCanvas(png, (x, y) => {
    const dx = x - 50;
    const dy = y - 50;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 36) return [251, 191, 36, 255];
    return [0, 0, 0, 0];
  });
}
