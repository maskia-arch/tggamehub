import db from '../database/client';
import { getBotInstance } from '../bot';

export interface InboxMessage {
  id: number;
  user_id: string;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at: string;
}

/**
 * Adds an inbox notification for a player and sends a Telegram push notification.
 */
export async function addInboxMessage(
  userId: string,
  title: string,
  message: string,
  category: 'system' | 'airdrop' | 'referral' | 'market' | 'reward' = 'system'
): Promise<number | null> {
  try {
    const [result] = await db('user_inbox').insert({
      user_id: userId,
      title,
      message,
      category,
      is_read: false,
    }).returning('id');

    const msgId = typeof result === 'object' && result?.id ? result.id : (typeof result === 'number' ? result : 1);

    // Send instant Telegram message notification to user
    const bot = getBotInstance();
    if (bot) {
      try {
        const text = `📬 *Neue Nachricht in deiner CoinCade Inbox!*\n\n` +
          `🔹 *${escapeMarkdown(title)}*\n\n` +
          `${escapeMarkdown(message)}`;

        await bot.telegram.sendMessage(userId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📥 Postfach öffnen', callback_data: `inbox_view_${msgId}` },
                { text: '🕹️ CoinCade Hauptmenü', callback_data: 'menu_main' }
              ]
            ]
          }
        });
      } catch (tgErr: any) {
        // User may have blocked the bot or not started yet
        console.log(`[INBOX NOTIFICATION]: Could not send direct Telegram notification to ${userId}:`, tgErr.message || tgErr);
      }
    }

    return msgId;
  } catch (err: any) {
    console.error('[INBOX ERROR]: Failed to insert inbox message:', err);
    return null;
  }
}

/**
 * Retrieves inbox messages for a user.
 */
export async function getUserInbox(userId: string, limit = 10, offset = 0): Promise<InboxMessage[]> {
  try {
    return await db('user_inbox')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  } catch (err) {
    console.error('[INBOX ERROR]: Failed to get user inbox:', err);
    return [];
  }
}

/**
 * Counts unread messages for a user.
 */
export async function getUnreadInboxCount(userId: string): Promise<number> {
  try {
    const res = await db('user_inbox')
      .where({ user_id: userId, is_read: false })
      .count('id as count')
      .first();
    return res ? parseInt(res.count as string, 10) : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Marks a specific message as read.
 */
export async function markInboxAsRead(userId: string, messageId: number): Promise<void> {
  try {
    await db('user_inbox')
      .where({ id: messageId, user_id: userId })
      .update({ is_read: true });
  } catch (err) {
    console.error('[INBOX ERROR]: Failed to mark message as read:', err);
  }
}

/**
 * Deletes an inbox message.
 */
export async function deleteInboxMessage(userId: string, messageId: number): Promise<void> {
  try {
    await db('user_inbox')
      .where({ id: messageId, user_id: userId })
      .delete();
  } catch (err) {
    console.error('[INBOX ERROR]: Failed to delete inbox message:', err);
  }
}

function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[*_`\[\]]/g, '');
}
