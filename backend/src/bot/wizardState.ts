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

/**
 * Intelligent message rendering helper:
 * Tries editing the current message via ctx.editMessageText or sending a new message
 * and tracking its ID to avoid spamming the chat.
 */
export async function renderBotScreen(
  ctx: Context,
  text: string,
  extra: any = {}
): Promise<void> {
  const userId = ctx.from?.id.toString();
  const session = userId ? getUserSession(userId) : null;

  const extraOptions: any = {
    parse_mode: 'Markdown',
    ...(extra && extra.reply_markup ? { reply_markup: extra.reply_markup } : (extra || {})),
  };

  try {
    if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(text, extraOptions);
      if (session) {
        session.lastBotMessageId = ctx.callbackQuery.message.message_id;
      }
      return;
    }
  } catch (editErr: any) {
    // If message is identical or cannot be edited, fallback to sending new message
    if (editErr.message?.includes('message is not modified')) {
      return;
    }
  }

  // If we couldn't edit (e.g. triggered by user text command), try deleting previous bot prompt
  if (session?.lastBotMessageId && ctx.chat) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, session.lastBotMessageId);
    } catch {
      // Ignore delete errors
    }
  }

  const sent = await ctx.reply(text, extraOptions);
  if (session && sent) {
    session.lastBotMessageId = sent.message_id;
  }
}
