import * as fs from 'fs';
import * as path from 'path';
import { Telegraf } from 'telegraf';
import db from '../database/client';
import { CUSTOM_EMOJI_CATALOG, generateAllCustomEmojiAssets, getEmojisDirectory } from './customEmojiGenerator';

// In-memory cache for ultra-fast lookup: emoji_key -> custom_emoji_id
const emojiCache = new Map<string, string>();

let isInitializing = false;
export let isEmojiSetInitialized = false;

/**
 * Initializes the Telegram Custom Emoji Sticker Set on deploy / boot.
 */
export async function initCustomEmojiSet(bot: Telegraf<any>): Promise<{ success: boolean; totalEmojis: number; setName: string; error?: string }> {
  if (isInitializing) {
    return { success: false, totalEmojis: emojiCache.size, setName: '', error: 'Already initializing' };
  }
  isInitializing = true;

  try {
    // 1. Generate / verify all 100x100 PNG files locally
    await generateAllCustomEmojiAssets();
    const emojiDir = getEmojisDirectory();

    // 2. Load existing cached IDs from database first (immediate warm start)
    await loadEmojisFromDatabase();

    // 3. Connect to Telegram Bot API
    if (!bot || !bot.telegram) {
      console.warn('[Custom Emoji Service]: Telegram Bot instance not available. Operating in local fallback mode.');
      isEmojiSetInitialized = true;
      isInitializing = false;
      return { success: true, totalEmojis: emojiCache.size, setName: 'local_offline' };
    }

    let botUser;
    try {
      botUser = await bot.telegram.getMe();
    } catch (botErr: any) {
      console.warn('[Custom Emoji Service]: Could not get Bot info from Telegram (offline / invalid token):', botErr.message);
      isEmojiSetInitialized = true;
      isInitializing = false;
      return { success: true, totalEmojis: emojiCache.size, setName: 'offline_fallback' };
    }

    if (!botUser.username) {
      console.warn('[Custom Emoji Service]: Bot has no username configured. Cannot create custom emoji sticker set.');
      isEmojiSetInitialized = true;
      isInitializing = false;
      return { success: false, totalEmojis: emojiCache.size, setName: '', error: 'Bot username missing' };
    }

    // Telegram custom emoji sticker set name MUST end in _by_<bot_username>
    const setName = `coincade_v1_by_${botUser.username}`;
    const setTitle = 'CoinCade Official Arcade & Market Emojis';

    console.log(`[Custom Emoji Service]: Synchronizing Custom Emoji Set "${setName}" with Telegram...`);

    // Find an owner user ID (Telegram requires a user ID for sticker sets)
    const firstUser = await db('users').whereNotNull('id').first();
    const ownerUserId = firstUser ? parseInt(firstUser.id, 10) || botUser.id : botUser.id;

    let stickerSet: any = null;
    try {
      stickerSet = await bot.telegram.getStickerSet(setName);
      console.log(`[Custom Emoji Service]: Existing Custom Emoji Sticker Set found with ${stickerSet.stickers?.length || 0} stickers.`);
    } catch (e: any) {
      // Not found (400 STICKERSET_INVALID) - will create below
      console.log(`[Custom Emoji Service]: Sticker set "${setName}" does not exist yet. Creating new Custom Emoji set...`);
    }

    if (!stickerSet) {
      // Build initial stickers list
      const initialStickers = [];
      for (const def of CUSTOM_EMOJI_CATALOG) {
        const filePath = path.join(emojiDir, def.filename);
        if (fs.existsSync(filePath)) {
          initialStickers.push({
            sticker: { source: filePath },
            emoji_list: [def.emojiChar],
            format: 'static'
          });
        }
      }

      if (initialStickers.length > 0) {
        try {
          await (bot.telegram as any).createNewStickerSet(
            ownerUserId,
            setName,
            setTitle,
            initialStickers,
            {
              sticker_type: 'custom_emoji'
            }
          );
          console.log(`[Custom Emoji Service]: Successfully created Custom Emoji Sticker Set "${setName}" with ${initialStickers.length} emojis!`);
          stickerSet = await bot.telegram.getStickerSet(setName);
        } catch (createErr: any) {
          console.error('[Custom Emoji Service]: Error calling createNewStickerSet:', createErr.message);
          // If Telegram API returned error (e.g. user_id must be real Telegram user), log detailed info
        }
      }
    } else {
      // Set exists: check if any new stickers need to be added
      const existingStickers = stickerSet.stickers || [];
      console.log(`[Custom Emoji Service]: Verified ${existingStickers.length} active custom emojis in set.`);

      // Check if we need to add any missing stickers from catalog
      if (existingStickers.length < CUSTOM_EMOJI_CATALOG.length) {
        console.log(`[Custom Emoji Service]: Adding missing stickers (${CUSTOM_EMOJI_CATALOG.length - existingStickers.length} new items)...`);
        for (let i = existingStickers.length; i < CUSTOM_EMOJI_CATALOG.length; i++) {
          const def = CUSTOM_EMOJI_CATALOG[i];
          const filePath = path.join(emojiDir, def.filename);
          if (fs.existsSync(filePath)) {
            try {
              await (bot.telegram as any).addStickerToSet(
                ownerUserId,
                setName,
                {
                  sticker: { source: filePath },
                  emoji_list: [def.emojiChar],
                  format: 'static'
                }
              );
              console.log(`[Custom Emoji Service]: Added sticker "${def.key}" to set.`);
            } catch (addErr: any) {
              console.warn(`[Custom Emoji Service]: Note adding sticker "${def.key}":`, addErr.message);
            }
          }
        }
        stickerSet = await bot.telegram.getStickerSet(setName);
      }
    }

    // 4. Map stickers to catalog keys and persist in DB
    if (stickerSet && Array.isArray(stickerSet.stickers)) {
      for (let i = 0; i < stickerSet.stickers.length; i++) {
        const s = stickerSet.stickers[i];
        const def = CUSTOM_EMOJI_CATALOG[i];
        if (def && s.custom_emoji_id) {
          emojiCache.set(def.key, s.custom_emoji_id);

          // Update database
          await db('custom_emojis')
            .insert({
              emoji_key: def.key,
              custom_emoji_id: s.custom_emoji_id,
              file_id: s.file_id || null,
              emoji_char: def.emojiChar,
              category: def.category,
              updated_at: new Date()
            })
            .onConflict('emoji_key')
            .merge({
              custom_emoji_id: s.custom_emoji_id,
              file_id: s.file_id || null,
              emoji_char: def.emojiChar,
              category: def.category,
              updated_at: new Date()
            });
        }
      }
      console.log(`[Custom Emoji Service]: Synchronized ${emojiCache.size} custom emoji IDs to memory and database.`);
    }

    isEmojiSetInitialized = true;
    isInitializing = false;
    return { success: true, totalEmojis: emojiCache.size, setName };
  } catch (err: any) {
    console.error('[Custom Emoji Service]: Synchronization error:', err);
    isEmojiSetInitialized = true;
    isInitializing = false;
    return { success: false, totalEmojis: emojiCache.size, setName: '', error: err.message };
  }
}

/**
 * Loads cached emoji IDs from SQLite / PostgreSQL
 */
export async function loadEmojisFromDatabase(): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable('custom_emojis');
    if (!hasTable) return;

    const rows = await db('custom_emojis').select('emoji_key', 'custom_emoji_id');
    for (const row of rows) {
      if (row.emoji_key && row.custom_emoji_id) {
        emojiCache.set(row.emoji_key, row.custom_emoji_id);
      }
    }
  } catch (e: any) {
    console.warn('[Custom Emoji Service]: Note reading DB emoji cache:', e.message);
  }
}

/**
 * Returns the Telegram custom_emoji_id for a given catalog key
 */
export function getCustomEmojiId(key: string): string | null {
  return emojiCache.get(key) || null;
}

/**
 * Returns all active emoji mappings
 */
export function getAllCachedEmojis(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [k, v] of emojiCache.entries()) {
    map[k] = v;
  }
  return map;
}
