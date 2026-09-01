import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import db from '../database/client';
import { getAndUpdateUserEnergy } from '../services/energy';

/**
 * Retrieves the current authenticated user's profile and dynamic energy status.
 */
export async function getProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }

    // Ephemeral Web Guest Profile
    if (req.telegramUser?.isGuest) {
      const guestId = req.telegramUser.id;
      return res.json({
        user: {
          id: guestId,
          username: req.telegramUser.username,
          first_name: req.telegramUser.first_name,
          last_name: req.telegramUser.last_name,
          display_name: 'Gast-Spieler',
          display_name_changed: false,
          created_at: new Date(),
          referral_link: 'https://t.me/coincadebot/webapp',
          referrals_count: 0,
          game_cash: 0.0,
          season_pass_type: 'NONE',
          daily_ad_count: 0,
          daily_ad_limit: 10,
          can_claim_free_refill: false,
          daily_refill_remaining: 0,
          max_daily_refills: 0,
          wallet_ltc: null,
          wallet_btc: null,
          wallet_sol: null,
          wallet_eth: null,
          is_guest: true,
          tutorial_status: 'SKIPPED',
          tutorial_step: 1,
          tutorial_reward_claimed: false,
        },
        energy: {
          current: 5,
          max: 5,
          nextRechargeInSeconds: 0,
          isTimeBoosterActive: false,
          timeBoosterSecondsLeft: 0,
          seasonPassType: 'NONE'
        }
      });
    }

    // Attempt to fetch user
    let user = await db('users').where({ id: userId }).first();

    // Auto-onboard if opening the web app directly without `/start` bot command first
    if (!user) {
      const referrerId = req.telegramUser?.startParam;
      let finalReferrerId: string | null = null;

      // Verify if referrer exists and is not the user themselves
      if (referrerId && referrerId !== userId) {
        const referrerExists = await db('users').where({ id: referrerId }).first();
        if (referrerExists) {
          finalReferrerId = referrerId;
          console.log(`[User Onboard]: Valid referral detected via start_param. Referrer: ${finalReferrerId}`);
        }
      }

      await db('users').insert({
        id: userId,
        username: req.telegramUser?.username || null,
        first_name: req.telegramUser?.first_name || null,
        last_name: req.telegramUser?.last_name || null,
        energy_value: 5,
        energy_updated_at: new Date(),
        referred_by: finalReferrerId,
      });

      user = await db('users').where({ id: userId }).first();

      // Award referral bonuses inside a transaction if referral is valid
      if (finalReferrerId) {
        try {
          const { addEnergy } = require('../services/energy');
          const { config } = require('../config');

          await db.transaction(async (trx) => {
            // Record in referrals logs
            await trx('referrals').insert({
              referrer_id: finalReferrerId!,
              referred_id: userId,
              bonus_processed: true,
            });

            // Award +5 energy to referrer
            await addEnergy(finalReferrerId!, config.referralEnergyBonus, true, trx);
            // Award +5 energy to new user
            await addEnergy(userId, config.referralEnergyBonus, true, trx);
          });

          // Record inbox notification for the referrer
          const { addInboxMessage } = require('../services/inboxService');
          await addInboxMessage(
            finalReferrerId!,
            '🎁 Neuer Referral-Bonus!',
            `Ein neuer Spieler (${req.telegramUser?.first_name || 'Spieler'}) hat sich über deinen Einladelink registriert. Du hast +${config.referralEnergyBonus} Bonus-Energie erhalten!`,
            'referral'
          );
        } catch (refErr) {
          console.error('[User Onboard ERROR]: Failed to award referral bonus:', refErr);
        }
      }
    }

    // Calculate energy on-the-fly
    const energyInfo = await getAndUpdateUserEnergy(userId);

    // Get referral count
    const referralCount = await db('users').where({ referred_by: userId }).count('id as count').first();
    const countVal = referralCount ? parseInt(referralCount.count as string, 10) : 0;

    // Generate unique referral link
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'coincadebot';
    const referralLink = `https://t.me/${botUsername}?start=${userId}`;

    // Compute daily ad count relative to Europe/Berlin timezone (resets at 00:00 Berlin time)
    const berlinDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Berlin' });
    const dailyAdCount = user.last_ad_date === berlinDateStr ? (user.daily_ad_count || 0) : 0;
    const passType = user.season_pass_type || 'NONE';
    const isPassHolder = passType === 'VIP' || passType === 'SEASON';
    const isVip = passType === 'VIP';
    const isAdFree = passType === 'VIP';

    const dailyAdLimit = passType === 'VIP' ? 999 : (passType === 'SEASON' ? 20 : 10);
    const maxDailyRefills = passType === 'VIP' ? 6 : (passType === 'SEASON' ? 3 : 0);
    const refillAmount = passType === 'VIP' ? 10 : (passType === 'SEASON' ? 5 : 0);
    const dailyRefillCount = user.last_daily_free_refill_date === berlinDateStr ? (user.daily_refill_count || 0) : 0;
    const canClaimFreeRefill = passType !== 'NONE' && dailyRefillCount < maxDailyRefills;
    const dailyRefillRemaining = Math.max(0, maxDailyRefills - dailyRefillCount);

    // Name change cooldown & permission calculation
    let canChangeName = false;
    let nameChangeCooldownDaysLeft = 0;

    if (isPassHolder) {
      if (!user.last_name_change_at) {
        canChangeName = true;
        nameChangeCooldownDaysLeft = 0;
      } else {
        const diffMs = Date.now() - new Date(user.last_name_change_at).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays >= 30) {
          canChangeName = true;
          nameChangeCooldownDaysLeft = 0;
        } else {
          canChangeName = false;
          nameChangeCooldownDaysLeft = Math.max(1, Math.ceil(30 - diffDays));
        }
      }
    } else {
      // Standard user: 1x free lifetime change. Afterwards permanently locked.
      const hasChangedName = Boolean(user.display_name_changed) || (Number(user.name_changes_count || 0) >= 1);
      if (hasChangedName) {
        canChangeName = false;
        nameChangeCooldownDaysLeft = 0;
      } else {
        canChangeName = true;
        nameChangeCooldownDaysLeft = 0;
      }
    }

    const { checkAndAwardAchievements, getUserAchievements, isEligibleForOgBadge, calculatePlayerRankRecords } = require('../services/achievementService');
    await checkAndAwardAchievements(userId);
    const achievements = await getUserAchievements(userId);
    const isOg = await isEligibleForOgBadge(user);
    const unlockedBadges = achievements.filter((a: any) => a.is_unlocked);
    const rankRecords = await calculatePlayerRankRecords(userId);

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name || null,
        display_name_changed: user.display_name_changed || false,
        avatar_id: user.avatar_id || 'avatar_1',
        can_change_name: canChangeName,
        name_change_cooldown_days_left: nameChangeCooldownDaysLeft,
        last_name_change_at: user.last_name_change_at || null,
        name_changes_count: Number(user.name_changes_count || 0),
        created_at: user.created_at,
        referral_link: referralLink,
        referrals_count: countVal,
        daily_ad_count: dailyAdCount,
        daily_ad_limit: dailyAdLimit,
        season_pass_type: passType,
        is_vip: isVip,
        is_ad_free: isAdFree,
        can_claim_free_refill: canClaimFreeRefill,
        daily_refill_remaining: dailyRefillRemaining,
        daily_refill_limit: maxDailyRefills,
        daily_refill_amount: refillAmount,
        wallet_ltc: user.wallet_ltc || null,
        wallet_btc: user.wallet_btc || null,
        deletion_scheduled_at: user.deletion_scheduled_at || null,
        game_cash: Number(user.game_cash || 0.0),
        is_frozen: Boolean(user.is_frozen),
        frozen_reason: user.frozen_reason || null,
        is_banned: Boolean(user.is_banned),
        ban_reason: user.ban_reason || null,
        is_og_player: isOg,
        rank_records: rankRecords,
        unlocked_badges_count: unlockedBadges.length,
        total_badges_count: achievements.length,
        badges: unlockedBadges,
        all_achievements: achievements,
        tutorial_status: user.tutorial_status || 'NOT_STARTED',
        tutorial_step: Number(user.tutorial_step || 1),
        tutorial_reward_claimed: Boolean(user.tutorial_reward_claimed),
      },
      energy: {
        current: energyInfo.currentEnergy,
        max: energyInfo.maxEnergy,
        nextRechargeInSeconds: energyInfo.nextRechargeInSeconds,
        isTimeBoosterActive: energyInfo.isTimeBoosterActive,
        timeBoosterSecondsLeft: energyInfo.timeBoosterSecondsLeft,
        seasonPassType: energyInfo.seasonPassType,
      }
    });
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Endpoint to reward energy via Ad Incentive simulation.
 * VIP Pass: Unlimited ads! (Season Pass: 20/day, Standard: 10/day)
 */
export async function addEnergyAd(req: AuthenticatedRequest, res: Response) {
  const userId = req.telegramUser?.id;
  const userName = req.telegramUser?.first_name || userId || 'Unknown';

  try {
    if (!userId) {
      console.warn('[ENERGY AD WARNING]: 🛑 Unauthorized attempt - User context not found.');
      return res.status(400).json({ error: 'User context not found' });
    }

    console.log(`[ENERGY AD REQUEST]: ⚡ Claim initiated by User ID=${userId} (${userName}, Guest: ${!!req.telegramUser?.isGuest})`);

    // Ephemeral Web Guest Support
    if (req.telegramUser?.isGuest) {
      console.log(`[ENERGY AD SUCCESS]: 🎉 Guest Energy charged for ID=${userId}`);
      return res.json({
        success: true,
        message: 'Gast-Energie erfolgreich aufgeladen (+1 Energie).',
        energy: {
          currentEnergy: 5,
          maxEnergy: 5,
          nextRechargeInSeconds: 0,
          lastEnergyValue: 5,
          lastEnergyUpdatedAt: new Date(),
          isTimeBoosterActive: false,
          timeBoosterSecondsLeft: 0,
          seasonPassType: 'NONE'
        }
      });
    }

    const { addEnergy } = require('../services/energy');

    const result = await db.transaction(async (trx) => {
      let user = await trx('users').where({ id: userId }).forUpdate().first();
      if (!user) {
        // Auto-provision user if missing
        console.log(`[ENERGY AD AUTO-PROVISION]: Provisioning new user row for ID=${userId} (${userName})`);
        await trx('users').insert({
          id: userId,
          username: req.telegramUser?.username || null,
          first_name: req.telegramUser?.first_name || null,
          last_name: req.telegramUser?.last_name || null,
          display_name: req.telegramUser?.first_name || 'Spieler',
          energy_value: 5,
          energy_updated_at: new Date(),
        });
        user = await trx('users').where({ id: userId }).forUpdate().first();
      }

      const passType = user.season_pass_type || 'NONE';
      const dailyAdLimit = passType === 'VIP' ? 999 : (passType === 'SEASON' ? 20 : 10);
      const berlinDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Berlin' });
      let newAdCount = 1;

      if (user.last_ad_date === berlinDateStr) {
        if (passType !== 'VIP' && (user.daily_ad_count || 0) >= dailyAdLimit) {
          return { limitReached: true, count: user.daily_ad_count, dailyAdLimit };
        }
        newAdCount = (user.daily_ad_count || 0) + 1;
      }

      // Update user ad count and date in database
      await trx('users')
        .where({ id: userId })
        .update({
          daily_ad_count: newAdCount,
          last_ad_date: berlinDateStr
        });

      // Award +1 energy
      const energyInfo = await addEnergy(userId, 1, true, trx);
      return { limitReached: false, energy: energyInfo, count: newAdCount, dailyAdLimit, isVip: passType === 'VIP' };
    });

    if (result.limitReached) {
      console.warn(`[ENERGY AD LIMIT REACHED]: 🛑 User ID=${userId} (${userName}) reached daily ad limit (${result.count}/${result.dailyAdLimit}).`);
      return res.status(400).json({
        error: 'LIMIT_REACHED',
        message: `Du hast das tägliche Limit von ${result.dailyAdLimit} Videos erreicht. Bitte versuche es morgen wieder.`
      });
    }

    console.log(`[ENERGY AD SUCCESS]: 🎉 +1 Energy granted to User ID=${userId} (${userName}). New Energy: ${result.energy?.currentEnergy}. Videos today: ${result.count}/${result.dailyAdLimit}`);

    return res.json({
      success: true,
      message: result.isVip
        ? '⚡ Instant Energie verbucht (+1 Energie AdFree VIP).'
        : `Werbe-Belohnung verbucht. +1 Energie. (${result.dailyAdLimit - result.count!} verbleibend heute)`,
      energy: result.energy,
      count: result.count
    });
  } catch (error: any) {
    console.error(`[ENERGY AD ERROR]: ❌ Failed to add energy for User ID=${userId} (${userName}):`, error?.stack || error);
    return res.status(500).json({ error: 'Internal server error', details: error?.message });
  }
}

/**
 * POST /api/user/claim-daily-free-refill
 * Claims daily free refill:
 * Season Pass VIP: 6x/day à +10 ⚡
 * Season Pass: 3x/day à +5 ⚡
 */
export async function claimDailyFreeRefill(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }

    const { addEnergy } = require('../services/energy');
    const berlinDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Berlin' });

    const result = await db.transaction(async (trx) => {
      const user = await trx('users').where({ id: userId }).forUpdate().first();
      if (!user) throw new Error('User not found');

      const passType = user.season_pass_type || 'NONE';
      if (passType === 'NONE') {
        return { allowed: false, reason: 'Du benötigst einen Season-Pass für den täglichen Free-Refill.' };
      }

      const maxDailyRefills = passType === 'VIP' ? 6 : (passType === 'SEASON' ? 3 : 0);
      const refillAmount = passType === 'VIP' ? 10 : (passType === 'SEASON' ? 5 : 0);
      const currentRefillCount = user.last_daily_free_refill_date === berlinDateStr ? (user.daily_refill_count || 0) : 0;

      if (currentRefillCount >= maxDailyRefills) {
        return {
          allowed: false,
          reason: passType === 'VIP'
            ? 'Du hast alle 6 täglichen VIP Free-Refills für heute bereits abgeholt.'
            : 'Du hast alle 3 täglichen Free-Refills für heute bereits abgeholt.'
        };
      }

      const newRefillCount = currentRefillCount + 1;
      await trx('users')
        .where({ id: userId })
        .update({
          daily_refill_count: newRefillCount,
          last_daily_free_refill_date: berlinDateStr
        });

      const energyInfo = await addEnergy(userId, refillAmount, true, trx);
      const remaining = Math.max(0, maxDailyRefills - newRefillCount);
      return { allowed: true, energyInfo, remaining, maxDailyRefills, refillAmount };
    });

    if (!result.allowed) {
      return res.status(400).json({ error: 'NOT_ALLOWED', message: result.reason });
    }

    return res.json({
      success: true,
      message: `Täglicher Free-Refill erfolgreich abgeholt (+${result.refillAmount} ⚡ Energie)! (${result.remaining} von ${result.maxDailyRefills} Refills verbleibend heute)`,
      energy: result.energyInfo,
      remaining: result.remaining,
      limit: result.maxDailyRefills,
    });
  } catch (error) {
    console.error('Error claiming daily free refill:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

import { addInboxMessage } from '../services/inboxService';

/**
 * Update display name:
 * - 1x Free lifetime for standard players (afterwards permanently disabled)
 * - 1x Free every 30 days for Season Pass & VIP Pass holders
 */
export async function updateDisplayName(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) return res.status(400).json({ error: 'User context not found' });

    const { displayName } = req.body;
    if (!displayName || typeof displayName !== 'string') {
      return res.status(400).json({ error: 'Anzeigename ist erforderlich.' });
    }

    const cleanName = displayName
      .replace(/[^\w\s-]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanName.length < 3 || cleanName.length > 15) {
      return res.status(400).json({ error: 'Anzeigename muss zwischen 3 und 15 Zeichen lang sein (keine Sonderzeichen).' });
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if user is trying to set the identical name they already have
    if (user.display_name && user.display_name.toLowerCase() === cleanName.toLowerCase()) {
      return res.status(400).json({ error: 'SAME_NAME', message: 'Du trägst diesen Anzeigenamen bereits.' });
    }

    // Check uniqueness across all users in DB
    const existingUserWithName = await db('users')
      .whereRaw('LOWER(display_name) = ?', [cleanName.toLowerCase()])
      .andWhereNot('id', userId)
      .first();

    if (existingUserWithName) {
      return res.status(400).json({
        error: 'NAME_TAKEN',
        message: `Der Anzeigename "${cleanName}" ist bereits von einem anderen Spieler vergeben.`
      });
    }

    const passType = user.season_pass_type || 'NONE';
    const isPassHolder = passType === 'VIP' || passType === 'SEASON';

    if (isPassHolder) {
      if (user.last_name_change_at) {
        const diffMs = Date.now() - new Date(user.last_name_change_at).getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays < 30) {
          const daysLeft = Math.max(1, Math.ceil(30 - diffDays));
          return res.status(400).json({
            error: 'COOLDOWN_ACTIVE',
            message: `Als Season-Pass-Inhaber kannst du deinen Namen alle 30 Tage kostenlos ändern. Nächste Änderung in ${daysLeft} Tagen möglich.`
          });
        }
      }
    } else {
      const hasChangedName = Boolean(user.display_name_changed) || (Number(user.name_changes_count || 0) >= 1);
      if (hasChangedName) {
        return res.status(400).json({
          error: 'NAME_CHANGE_LIMIT_REACHED',
          message: 'Du hast deinen kostenlosen Namenswechsel bereits verbraucht. Mit einem Season Pass kannst du deinen Namen alle 30 Tage ändern.'
        });
      }
    }

    const now = new Date();
    const newCount = (Number(user.name_changes_count) || 0) + 1;

    await db('users').where({ id: userId }).update({
      display_name: cleanName,
      display_name_changed: true,
      last_name_change_at: now,
      name_changes_count: newCount,
    });

    // Send inbox confirmation
    await addInboxMessage(
      userId,
      '🏷️ Namensänderung erfolgreich',
      `Dein Anzeigename wurde erfolgreich auf "${cleanName}" geändert.${isPassHolder ? ' Nächste Änderung in 30 Tagen möglich.' : ''}`,
      'system'
    );

    return res.json({
      success: true,
      display_name: cleanName,
      message: `Anzeigename erfolgreich auf "${cleanName}" geändert.`
    });
  } catch (error: any) {
    console.error('Error updating display name:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Save LTC (Litecoin) wallet address exclusively for Airdrop payouts.
 */
export async function updateWalletAddresses(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) return res.status(400).json({ error: 'User context not found' });

    const { wallet_ltc } = req.body;

    // Validate LTC format (starts with L, M, or ltc1)
    if (wallet_ltc !== undefined && wallet_ltc !== null && wallet_ltc !== '') {
      if (typeof wallet_ltc !== 'string') {
        return res.status(400).json({ error: 'Ungültiges Adress-Format.' });
      }
      const trimmed = wallet_ltc.trim();
      const isLtc = /^(L|M|ltc1)[a-km-zA-HJ-NP-Z1-9]{25,64}$/.test(trimmed);
      if (!isLtc) {
        return res.status(400).json({ error: 'Ungültige Litecoin (LTC) Adresse. Adressen beginnen mit L, M oder ltc1.' });
      }
    }

    const finalAddress = wallet_ltc ? wallet_ltc.trim() : null;

    await db('users').where({ id: userId }).update({
      wallet_ltc: finalAddress,
    });

    return res.json({ success: true, wallet_ltc: finalAddress });
  } catch (error: any) {
    console.error('Error updating wallet addresses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Schedule account deletion 48 hours from now.
 * If the user logs in again before 48h, it is automatically cancelled in getProfile.
 */
export async function scheduleAccountDeletion(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) return res.status(400).json({ error: 'User context not found' });

    const deletionAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

    await db('users').where({ id: userId }).update({
      deletion_scheduled_at: deletionAt,
    });

    return res.json({
      success: true,
      deletion_scheduled_at: deletionAt.toISOString(),
      message: 'Dein Konto wird in 48 Stunden gelöscht. Wenn du dich vorher erneut einloggst, wird die Löschung automatisch abgebrochen.'
    });
  } catch (error: any) {
    console.error('Error scheduling account deletion:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Cancel a pending account deletion (called automatically on login / profile fetch).
 */
export async function cancelAccountDeletion(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) return res.status(400).json({ error: 'User context not found' });

    await db('users').where({ id: userId }).update({ deletion_scheduled_at: null });

    return res.json({ success: true, message: 'Kontolöschung wurde erfolgreich abgebrochen.' });
  } catch (error: any) {
    console.error('Error cancelling account deletion:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Fetch public profile card for any player
 */
export async function getPublicProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const { targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    const { getPublicProfileData } = require('../services/achievementService');
    const profileData = await getPublicProfileData(targetUserId);

    if (!profileData) {
      return res.status(404).json({ error: 'Spieler-Profil wurde nicht gefunden.' });
    }

    return res.json({
      success: true,
      profile: profileData,
      ...profileData,
    });
  } catch (error: any) {
    console.error('Error fetching public profile:', error);
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}

/**
 * Update user avatar from available 10 neon presets
 */
export async function updateAvatar(req: AuthenticatedRequest, res: Response) {
  const userId = req.telegramUser?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { avatarId } = req.body;
  const validAvatars = [
    'avatar_1', 'avatar_2', 'avatar_3', 'avatar_4', 'avatar_5',
    'avatar_6', 'avatar_7', 'avatar_8', 'avatar_9', 'avatar_10'
  ];

  if (!avatarId || !validAvatars.includes(avatarId)) {
    return res.status(400).json({ error: 'Ungültige Avatar-ID. Wähle eine Vorlage von avatar_1 bis avatar_10.' });
  }

  try {
    await db('users').where({ id: userId }).update({
      avatar_id: avatarId,
    });

    return res.json({
      success: true,
      message: 'Profilbild erfolgreich aktualisiert!',
      avatar_id: avatarId,
    });
  } catch (error) {
    console.error('Error updating avatar:', error);
    return res.status(500).json({ error: 'Fehler beim Speichern des Profilbilds' });
  }
}

/**
 * Updates the user's tutorial status and step progress
 */
export async function updateTutorialStatus(req: AuthenticatedRequest, res: Response) {
  const userId = req.telegramUser?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // If guest, return ok without failing
  if (req.telegramUser?.isGuest || userId.startsWith('guest_')) {
    return res.json({ success: true, is_guest: true });
  }

  const { status, step } = req.body;
  const validStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED'];

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid tutorial status' });
  }

  try {
    const updateData: any = {};
    if (status) updateData.tutorial_status = status;
    if (typeof step === 'number') updateData.tutorial_step = Math.max(1, Math.min(7, step));

    if (Object.keys(updateData).length > 0) {
      await db('users').where({ id: userId }).update(updateData);
    }

    return res.json({ success: true, ...updateData });
  } catch (error: any) {
    console.error('Error updating tutorial status:', error);
    return res.status(500).json({ error: 'Fehler beim Aktualisieren des Tutorial-Status' });
  }
}

/**
 * Claims the final tutorial reward (+5 Free Energy and 0.10$ worth of every crypto token)
 */
export async function claimTutorialReward(req: AuthenticatedRequest, res: Response) {
  const userId = req.telegramUser?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Prevent guest claiming
  if (req.telegramUser?.isGuest || userId.startsWith('guest_')) {
    return res.status(400).json({ error: 'Gast-Spieler können keine Belohnungen beanspruchen.' });
  }

  try {
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.tutorial_reward_claimed) {
      return res.status(400).json({ error: 'Tutorial-Belohnung wurde bereits abgeholt.' });
    }

    const { addEnergy } = require('../services/energy');
    const { addInboxMessage } = require('../services/inboxService');

    // Get all registered active coins
    const coins = await db('coins').select('*');
    const awardedPortfolio: { symbol: string; tokens: number; cashValue: number }[] = [];

    await db.transaction(async (trx) => {
      // 1. Award +5 energy (can exceed max cap)
      await addEnergy(userId, 5, true, trx);

      // 2. Award 0.10$ worth of tokens for each coin in the market
      for (const coin of coins) {
        const coinPrice = Math.max(0.00000001, Number(coin.current_price || coin.base_price || 0.00000001));
        const tokensToCredit = 0.10 / coinPrice;

        const existing = await trx('user_portfolios')
          .where({ user_id: userId, coin_symbol: coin.symbol })
          .first();

        if (existing) {
          const oldAmount = Number(existing.amount || 0);
          const oldInvested = Number(existing.total_invested || 0);
          const newAmount = oldAmount + tokensToCredit;
          const newInvested = oldInvested + 0.10;
          const newAvg = newAmount > 0 ? newInvested / newAmount : coinPrice;

          await trx('user_portfolios')
            .where({ user_id: userId, coin_symbol: coin.symbol })
            .update({
              amount: newAmount,
              avg_buy_price: newAvg,
              total_invested: newInvested,
              updated_at: new Date(),
            });
        } else {
          await trx('user_portfolios').insert({
            user_id: userId,
            coin_symbol: coin.symbol,
            amount: tokensToCredit,
            avg_buy_price: coinPrice,
            total_invested: 0.10,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }

        awardedPortfolio.push({
          symbol: coin.symbol,
          tokens: tokensToCredit,
          cashValue: 0.10,
        });
      }

      // 3. Mark tutorial completed and claimed
      await trx('users').where({ id: userId }).update({
        tutorial_status: 'COMPLETED',
        tutorial_step: 7,
        tutorial_reward_claimed: true,
      });

      // 4. Send inbox notification
      try {
        await addInboxMessage(
          userId,
          '🎉 Onboarding-Bonus freigeschaltet!',
          `Glückwunsch zum Abschluss des Tutorials! Du hast +5 Bonus-Energie und ein Start-Krypto-Portfolio im Gegenwert von je 0,10 InGame$ für jeden Coin (${coins.map((c: any) => '$' + c.symbol).join(', ')}) erhalten.`,
          'reward'
        );
      } catch (inboxErr) {
        console.warn('Could not add tutorial inbox message:', inboxErr);
      }
    });

    return res.json({
      success: true,
      message: 'Tutorial-Belohnung erfolgreich gutgeschrieben!',
      awardedEnergy: 5,
      awardedPortfolio,
    });
  } catch (error: any) {
    console.error('Error claiming tutorial reward:', error);
    return res.status(500).json({ error: error.message || 'Fehler beim Gutschreiben der Tutorial-Belohnung' });
  }
}


