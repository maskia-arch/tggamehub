import { Context } from 'telegraf';

export interface UserSessionState {
  step: 'none' | 'awaiting_custom_name' | 'awaiting_name_change' | 'awaiting_wallet_address' | 'awaiting_market_buy' | 'awaiting_market_sell';
  data?: Record<string, any>;
  lastBotMessageId?: number;
  updatedAt: number;
}

const userSessions = new Map<string, UserSessionState>();

/**
 * Gets or initializes a user's session state.
 */
export function getUserSession(userId: string): UserSessionState {
  const existing = userSessions.get(userId);
  if (existing) return existing;

  const newSession: UserSessionState = {
    step: 'none',
    updatedAt: Date.now(),
  };
  userSessions.set(userId, newSession);
  return newSession;
}

/**
 * Updates a user's session state.
 */
export function setUserSession(userId: string, partial: Partial<UserSessionState>): void {
  const current = getUserSession(userId);
  userSessions.set(userId, {
    ...current,
    ...partial,
    updatedAt: Date.now(),
  });
}

/**
 * Clears active wizard step for user.
 */
export function clearUserWizard(userId: string): void {
  const current = getUserSession(userId);
  userSessions.set(userId, {
    ...current,
    step: 'none',
    data: undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Strips all special characters and emojis from a raw Telegram name.
 * Allows only alphanumeric characters (a-z, A-Z, 0-9), spaces, and underscores/hyphens.
 * Trims and limits to 15 characters.
 */
export function sanitizeTelegramName(rawName: string | null | undefined): string {
  if (!rawName) return '';
  const cleaned = rawName
    .replace(/[^\w\s-]/gi, '') // Remove emojis and special characters
    .replace(/\s+/g, ' ')      // Collapse multiple whitespace
    .trim();

  return cleaned.substring(0, 15);
}

/**
 * Safely deletes a user's incoming message to keep the Telegram chat clean and compact.
 */
export async function cleanUserMessage(ctx: Context): Promise<void> {
  try {
    if (ctx.message && ctx.message.message_id && ctx.chat) {
      await ctx.deleteMessage(ctx.message.message_id);
    }
  } catch (err) {
    // Ignore message deletion errors (e.g. if message is too old or lack permissions)
  }
}

import db from '../database/client';

/**
 * Intelligent message rendering helper:
 * - Edits current menu message in place for button callbacks.
 * - Cleans up previous notifications and prior menus on text commands.
 * - Always maintains exactly ONE active menu message in the chat.
 */
export async function renderBotScreen(
  ctx: Context,
  text: string,
  extra: any = {}
): Promise<void> {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const chatId = ctx.chat?.id || ctx.from?.id;
  const session = getUserSession(userId);

  const extraOptions: any = {
    parse_mode: 'Markdown',
    ...(extra && extra.reply_markup ? { reply_markup: extra.reply_markup } : (extra || {})),
  };

  // 1. Clean up any pending push notification message if one exists
  try {
    const userRow = await db('users').where({ id: userId }).select('last_bot_message_id', 'last_notification_message_id').first();
    if (userRow?.last_notification_message_id && chatId) {
      try {
        await ctx.telegram.deleteMessage(chatId, userRow.last_notification_message_id);
      } catch {}
      await db('users').where({ id: userId }).update({ last_notification_message_id: null });
    }
  } catch {}

  // 2. If triggered by an inline button callback, attempt to edit the message in-place
  if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(text, extraOptions);
      const msgId = ctx.callbackQuery.message.message_id;
      session.lastBotMessageId = msgId;
      db('users').where({ id: userId }).update({ last_bot_message_id: msgId }).catch(() => {});
      return;
    } catch (editErr: any) {
      if (editErr.message?.includes('message is not modified')) {
        return;
      }
      // If editing fails (e.g. message too old or deleted), fall through to delete & send fresh
    }
  }

  // 3. Delete prior menu message from database / session before sending a new one
  try {
    let priorMsgId = session.lastBotMessageId;
    if (!priorMsgId) {
      const userRow = await db('users').where({ id: userId }).select('last_bot_message_id').first();
      priorMsgId = userRow?.last_bot_message_id;
    }
    if (priorMsgId && chatId) {
      try {
        await ctx.telegram.deleteMessage(chatId, priorMsgId);
      } catch {}
    }
  } catch {}

  // 4. Send fresh menu message and track its ID
  try {
    const sent = await ctx.reply(text, extraOptions);
    if (sent?.message_id) {
      session.lastBotMessageId = sent.message_id;
      db('users').where({ id: userId }).update({ last_bot_message_id: sent.message_id }).catch(() => {});
    }
  } catch (replyErr: any) {
    console.error('[BOT RENDER ERROR]: Could not reply with menu screen:', replyErr.message || replyErr);
  }
}
