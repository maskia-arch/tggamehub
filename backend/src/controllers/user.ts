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
          const axios = require('axios');

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

          // Notify the referrer directly via Telegram Bot API
          if (config.telegramBotToken) {
            try {
              const text = `🎉 Ein neuer Spieler (${req.telegramUser?.first_name || 'Anonymous'}) hat sich über deinen Link registriert!\nDu hast +${config.referralEnergyBonus} Bonus-Energie erhalten!`;
              await axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
                chat_id: finalReferrerId,
                text: text
              });
            } catch (err) {
              console.log(`[User Onboard]: Could not notify referrer ${finalReferrerId} directly.`);
            }
          }
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
    const dailyAdLimit = (passType === 'SEASON' || passType === 'VIP') ? 15 : 10;
    const canClaimFreeRefill = passType !== 'NONE' && user.last_daily_free_refill_date !== berlinDateStr;

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
 * Enforces a daily limit of 10 ads (or 15 for Season/VIP Pass) resetting at 00:00 Europe/Berlin time.
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
      const dailyAdLimit = (passType === 'SEASON' || passType === 'VIP') ? 15 : 10;
      const berlinDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Berlin' });
      let newAdCount = 1;

      if (user.last_ad_date === berlinDateStr) {
        if ((user.daily_ad_count || 0) >= dailyAdLimit) {
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
      return { limitReached: false, energy: energyInfo, count: newAdCount, dailyAdLimit };
    });

    if (result.limitReached) {
      return res.status(400).json({
        error: 'LIMIT_REACHED',
        message: `Du hast das tägliche Limit von ${result.dailyAdLimit} Videos erreicht. Bitte versuche es morgen wieder.`
      });
    }

    return res.json({
      success: true,
      message: `Werbe-Belohnung verbucht. +1 Energie. (${result.dailyAdLimit - result.count!} verbleibend heute)`,
      energy: result.energy
    });
  } catch (error: any) {
    console.error('Error adding energy ad:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/user/claim-daily-free-refill
 * Claims 1x daily free refill (+5 ⚡) for Season & VIP Pass holders.
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

      if (user.last_daily_free_refill_date === berlinDateStr) {
        return { allowed: false, reason: 'Du hast deinen täglichen Free-Refill heute bereits abgeholt.' };
      }

      await trx('users')
        .where({ id: userId })
        .update({ last_daily_free_refill_date: berlinDateStr });

      const energyInfo = await addEnergy(userId, 5, true);
      return { allowed: true, energyInfo };
    });

    if (!result.allowed) {
      return res.status(400).json({ error: 'NOT_ALLOWED', message: result.reason });
    }

    return res.json({
      success: true,
      message: 'Täglicher Free-Refill erfolgreich abgeholt (+5 ⚡ Energie)!',
      energy: result.energyInfo,
    });
  } catch (error) {
    console.error('Error claiming daily free refill:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Update display name — free once, locked afterwards.
 */
export async function updateDisplayName(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) return res.status(400).json({ error: 'User context not found' });

    const { displayName } = req.body;
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 32) {
      return res.status(400).json({ error: 'Anzeigename muss zwischen 2 und 32 Zeichen lang sein.' });
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.display_name_changed) {
      return res.status(403).json({ error: 'ALREADY_CHANGED', message: 'Du hast deinen Anzeigenamen bereits geändert. Eine erneute Änderung ist derzeit gesperrt.' });
    }

    await db('users').where({ id: userId }).update({
      display_name: displayName.trim(),
      display_name_changed: true,
    });

    return res.json({ success: true, display_name: displayName.trim() });
  } catch (error: any) {
    console.error('Error updating display name:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Save LTC and/or BTC wallet addresses for payout.
 */
export async function updateWalletAddresses(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) return res.status(400).json({ error: 'User context not found' });

    const { wallet_ltc, wallet_btc } = req.body;

    // Basic format validation
    if (wallet_ltc !== undefined && wallet_ltc !== null && wallet_ltc !== '') {
      if (typeof wallet_ltc !== 'string' || wallet_ltc.length < 20 || wallet_ltc.length > 100) {
        return res.status(400).json({ error: 'Ungültige LTC-Adresse.' });
      }
    }
    if (wallet_btc !== undefined && wallet_btc !== null && wallet_btc !== '') {
      if (typeof wallet_btc !== 'string' || wallet_btc.length < 20 || wallet_btc.length > 100) {
        return res.status(400).json({ error: 'Ungültige BTC-Adresse.' });
      }
    }

    const updateData: Record<string, any> = {};
    if (wallet_ltc !== undefined) updateData.wallet_ltc = wallet_ltc || null;
    if (wallet_btc !== undefined) updateData.wallet_btc = wallet_btc || null;

    await db('users').where({ id: userId }).update(updateData);

    return res.json({ success: true, wallet_ltc: wallet_ltc || null, wallet_btc: wallet_btc || null });
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
