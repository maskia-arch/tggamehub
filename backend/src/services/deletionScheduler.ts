import db from '../database/client';

let schedulerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

/**
 * Permanently and atomically deletes a user and all linked records from the database
 */
export async function hardDeleteUser(userId: string): Promise<{ success: boolean; deletedUserId: string }> {
  console.log(`[Account Deletion Engine]: Executing permanent deletion for user ${userId}...`);

  await db.transaction(async (trx) => {
    // 1. Delete scores
    if (await trx.schema.hasTable('scores')) {
      await trx('scores').where({ user_id: userId }).del();
    }
    // 2. Delete user portfolios
    if (await trx.schema.hasTable('user_portfolios')) {
      await trx('user_portfolios').where({ user_id: userId }).del();
    }
    // 3. Delete user inbox
    if (await trx.schema.hasTable('user_inbox')) {
      await trx('user_inbox').where({ user_id: userId }).del();
    }
    // 4. Delete AI reward claims
    if (await trx.schema.hasTable('ai_reward_claims')) {
      await trx('ai_reward_claims').where({ user_id: userId }).del();
    }
    // 5. Delete user achievements
    if (await trx.schema.hasTable('user_achievements')) {
      await trx('user_achievements').where({ user_id: userId }).del();
    }
    // 6. Delete shop orders
    if (await trx.schema.hasTable('shop_orders')) {
      await trx('shop_orders').where({ user_id: userId }).del();
    }
    // 7. Delete referrals links
    if (await trx.schema.hasTable('referrals')) {
      await trx('referrals').where({ referrer_id: userId }).orWhere({ referred_id: userId }).del();
    }
    // 8. Delete market transactions
    if (await trx.schema.hasTable('market_transactions')) {
      await trx('market_transactions').where({ user_id: userId }).del();
    }
    // 9. Delete user record
    await trx('users').where({ id: userId }).del();
  });

  console.log(`[Account Deletion Engine]: User ${userId} and all associated data permanently purged.`);
  return { success: true, deletedUserId: userId };
}

/**
 * Processes all pending user account deletions where the scheduled timestamp has passed
 */
export async function processPendingAccountDeletions(): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  let purgedCount = 0;

  try {
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) {
      isProcessing = false;
      return 0;
    }

    const now = new Date();
    const pendingUsers = await db('users')
      .whereNotNull('deletion_scheduled_at')
      .andWhere('deletion_scheduled_at', '<=', now)
      .select('id', 'display_name', 'username', 'deletion_scheduled_at');

    if (pendingUsers.length > 0) {
      console.log(`[Account Deletion Scheduler]: Found ${pendingUsers.length} scheduled account deletions ready to execute.`);

      for (const u of pendingUsers) {
        try {
          await hardDeleteUser(u.id);
          purgedCount++;
        } catch (err: any) {
          console.error(`[Account Deletion Scheduler Error]: Failed to purge user ${u.id}:`, err.message);
        }
      }
    }
  } catch (err: any) {
    console.error('[Account Deletion Scheduler Error]:', err.message);
  } finally {
    isProcessing = false;
  }

  return purgedCount;
}

/**
 * Starts the continuous background account deletion scheduler (runs every 60 seconds)
 */
export function startAccountDeletionScheduler(): void {
  if (schedulerInterval) return;

  console.log('[Account Deletion Scheduler]: Starting background worker (every 60s)...');

  // Initial check on boot
  processPendingAccountDeletions().catch(() => {});

  schedulerInterval = setInterval(() => {
    processPendingAccountDeletions().catch(() => {});
  }, 60 * 1000);
}

/**
 * Stops the account deletion scheduler
 */
export function stopAccountDeletionScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
