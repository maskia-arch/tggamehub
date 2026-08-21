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
            await addEnergy(finalReferrerId!, config.referralEnergyBonus, true);
            // Award +5 energy to new user
            await addEnergy(userId, config.referralEnergyBonus, true);
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
    const dailyAdLimit = passType === 'VIP' ? 999 : (passType === 'SEASON' ? 15 : 10);
    const maxDailyRefills = passType === 'VIP' ? 6 : (passType === 'SEASON' ? 1 : 0);
    const dailyRefillCount = user.last_daily_free_refill_date === berlinDateStr ? (user.daily_refill_count || 0) : 0;
    const canClaimFreeRefill = passType !== 'NONE' && dailyRefillCount < maxDailyRefills;
    const dailyRefillRemaining = Math.max(0, maxDailyRefills - dailyRefillCount);

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name || null,
        display_name_changed: user.display_name_changed || false,
        created_at: user.created_at,
        referral_link: referralLink,
        referrals_count: countVal,
        daily_ad_count: dailyAdCount,
        daily_ad_limit: dailyAdLimit,
        season_pass_type: passType,
        can_claim_free_refill: canClaimFreeRefill,
        daily_refill_remaining: dailyRefillRemaining,
        daily_refill_limit: maxDailyRefills,
        wallet_ltc: user.wallet_ltc || null,
        wallet_btc: user.wallet_btc || null,
        deletion_scheduled_at: user.deletion_scheduled_at || null,
        game_cash: Number(user.game_cash || 0.0),
      },
      energy: {
        current: energyInfo.currentEnergy,
        max: energyInfo.maxEnergy,
        nextRechargeInSeconds: energyInfo.nextRechargeInSeconds,
        isTimeBoosterActive: energyInfo.isTimeBoosterActive,
        timeBoosterSecondsLeft: energyInfo.timeBoosterSecondsLeft,
      }
    });
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Endpoint to reward energy via Ad Incentive simulation.
 * VIP Pass: Unlimited ads! (Season Pass: 15/day, Standard: 10/day)
 */
export async function addEnergyAd(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }

    const { addEnergy } = require('../services/energy');

    const result = await db.transaction(async (trx) => {
      const user = await trx('users').where({ id: userId }).forUpdate().first();
      if (!user) {
        throw new Error('User not found');
      }

      const passType = user.season_pass_type || 'NONE';
      const dailyAdLimit = passType === 'VIP' ? 999 : (passType === 'SEASON' ? 15 : 10);
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
      const energyInfo = await addEnergy(userId, 1, true);
      return { limitReached: false, energy: energyInfo, count: newAdCount, dailyAdLimit, isVip: passType === 'VIP' };
    });

    if (result.limitReached) {
      return res.status(400).json({
        error: 'LIMIT_REACHED',
        message: `Du hast das tägliche Limit von ${result.dailyAdLimit} Videos erreicht. Bitte versuche es morgen wieder.`
      });
    }

    return res.json({
      success: true,
      message: result.isVip
        ? 'Werbe-Belohnung verbucht. +1 Energie (∞ Unbegrenzte VIP-Ads).'
        : `Werbe-Belohnung verbucht. +1 Energie. (${result.dailyAdLimit - result.count!} verbleibend heute)`,
      energy: result.energy
    });
  } catch (error: any) {
    console.error('Error adding energy ad:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/user/claim-daily-free-refill
 * Claims daily free refill (+5 ⚡): 6x/day for Season Pass VIP, 1x/day for Season Pass.
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

      const maxDailyRefills = passType === 'VIP' ? 6 : (passType === 'SEASON' ? 1 : 0);
      const currentRefillCount = user.last_daily_free_refill_date === berlinDateStr ? (user.daily_refill_count || 0) : 0;

      if (currentRefillCount >= maxDailyRefills) {
        return {
          allowed: false,
          reason: passType === 'VIP'
            ? 'Du hast alle 6 täglichen Free-Refills für heute bereits abgeholt.'
            : 'Du hast deinen täglichen Free-Refill heute bereits abgeholt.'
        };
      }

      const newRefillCount = currentRefillCount + 1;
      await trx('users')
        .where({ id: userId })
        .update({
          daily_refill_count: newRefillCount,
          last_daily_free_refill_date: berlinDateStr
        });

      const energyInfo = await addEnergy(userId, 5, true);
      const remaining = Math.max(0, maxDailyRefills - newRefillCount);
      return { allowed: true, energyInfo, remaining, maxDailyRefills };
    });

    if (!result.allowed) {
      return res.status(400).json({ error: 'NOT_ALLOWED', message: result.reason });
    }

    return res.json({
      success: true,
      message: `Täglicher Free-Refill erfolgreich abgeholt (+5 ⚡ Energie)! (${result.remaining} von ${result.maxDailyRefills} Refills verbleibend heute)`,
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
 * Update display name — costs 10 InGame$ (Game Cash) and requires unique name.
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

    // Check 10 InGame$ cost
    const NAME_CHANGE_COST = 10.0;
    const currentCash = Number(user.game_cash || 0.0);
    if (currentCash < NAME_CHANGE_COST) {
      return res.status(400).json({
        error: 'INSUFFICIENT_CASH',
        message: `Eine Namensänderung kostet 10.00 InGame$. Dein aktuelles Guthaben beträgt ${currentCash.toFixed(2)} $. Zocke Spiele oder trade an der Börse, um mehr Guthaben zu erspielen!`
      });
    }

    const newCash = Math.round((currentCash - NAME_CHANGE_COST) * 10000) / 10000;

    await db('users').where({ id: userId }).update({
      display_name: cleanName,
      game_cash: newCash,
      display_name_changed: true,
    });

    // Send inbox confirmation
    await addInboxMessage(
      userId,
      '🏷️ Namensänderung erfolgreich',
      `Dein Anzeigename wurde erfolgreich auf "${cleanName}" geändert (-10.00 InGame$). Dein neues Cash-Guthaben: ${newCash.toFixed(2)} $.`,
      'system'
    );

    return res.json({
      success: true,
      display_name: cleanName,
      game_cash: newCash,
      message: `Anzeigename erfolgreich auf "${cleanName}" geändert (-10.00 InGame$).`
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
