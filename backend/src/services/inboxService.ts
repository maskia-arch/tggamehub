import db from '../database/client';

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
 * Adds an inbox notification for a player silently (without spamming chat).
 * Unread messages are surfaced dynamically with count badges on the bot menu.
 */
export async function addInboxMessage(
  userId: string,
  title: string,
  message: string,
  category: 'system' | 'airdrop' | 'referral' | 'market' | 'reward' = 'system'
): Promise<number | null> {
  try {
    const result = await db('user_inbox').insert({
      user_id: userId,
      title,
      message,
      category,
      is_read: false,
    });

    const msgId = Array.isArray(result) && result.length > 0
      ? (typeof result[0] === 'object' && result[0] !== null ? (result[0] as any).id : result[0])
      : (typeof result === 'object' && result !== null && 'id' in result ? (result as any).id : 1);
    return msgId || 1;
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
 * Marks all inbox messages as read for a user.
 */
export async function markAllInboxAsRead(userId: string): Promise<void> {
  try {
    await db('user_inbox')
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });
  } catch (err) {
    console.error('[INBOX ERROR]: Failed to mark all messages as read:', err);
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

/**
 * Deletes all read inbox messages for a user to clean up their inbox.
 */
export async function deleteReadInboxMessages(userId: string): Promise<void> {
  try {
    await db('user_inbox')
      .where({ user_id: userId, is_read: true })
      .delete();
  } catch (err) {
    console.error('[INBOX ERROR]: Failed to delete read inbox messages:', err);
  }
}

export function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text.replace(/[*_`\[\]]/g, '');
}
