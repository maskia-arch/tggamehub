import { Telegraf, Markup } from 'telegraf';
import { config } from '../config';
import db from '../database/client';
import { addEnergy } from '../services/energy';

let bot: Telegraf | null = null;

export function initTelegramBot(): Telegraf | null {
  if (!config.telegramBotToken) {
    console.warn('[BOT]: No TELEGRAM_BOT_TOKEN provided. Skipping bot initialization.');
    return null;
  }

  bot = new Telegraf(config.telegramBotToken);

  // Handle bot startup commands and referrals
  bot.start(async (ctx) => {
    try {
      const telegramId = ctx.from.id.toString();
      const username = ctx.from.username || null;
      const firstName = ctx.from.first_name || null;
      const lastName = ctx.from.last_name || null;
      const referrerId = ctx.payload; // captures the parameter in `/start <payload>`

      console.log(`[BOT]: User ${telegramId} logged in. Payload: ${referrerId || 'none'}`);

      // Check if user already exists
      let user = await db('users').where({ id: telegramId }).first();
      const isNewUser = !user;

      if (isNewUser) {
        let finalReferrerId: string | null = null;

        // Verify if referrer exists and is not the user themselves
        if (referrerId && referrerId !== telegramId) {
          const referrerExists = await db('users').where({ id: referrerId }).first();
          if (referrerExists) {
            finalReferrerId = referrerId;
            console.log(`[BOT]: Valid referral detected. Referrer: ${finalReferrerId}`);
          }
        }

        // Insert new user
        await db('users').insert({
          id: telegramId,
          username,
          first_name: firstName,
          last_name: lastName,
          energy_value: 5, // Base energy
          energy_updated_at: new Date(),
          referred_by: finalReferrerId,
        });

        // Award referral bonuses
        if (finalReferrerId) {
          try {
            await db.transaction(async (trx) => {
              // Record in referrals logs
              await trx('referrals').insert({
                referrer_id: finalReferrerId!,
                referred_id: telegramId,
                bonus_processed: true,
              });

              // Award +5 energy to referrer
              await addEnergy(finalReferrerId!, config.referralEnergyBonus, true);
              // Award +5 energy to new user
              await addEnergy(telegramId, config.referralEnergyBonus, true);
            });

            // Notify the referrer if possible
            try {
              await ctx.telegram.sendMessage(
                finalReferrerId,
                `🎉 Ein neuer Spieler (${firstName || 'Anonymous'}) hat sich über deinen Link registriert!\nDu hast +${config.referralEnergyBonus} Bonus-Energie erhalten!`
              );
            } catch (err) {
              console.log(`[BOT]: Could not notify referrer ${finalReferrerId} directly (bot may not have been started by referrer).`);
            }

            await ctx.reply(
              `🎁 Willkommen! Du hast dich über einen Referral-Link registriert. Du und dein Einlader erhalten +${config.referralEnergyBonus} Bonus-Energie!`
            );
          } catch (refErr) {
            console.error('[BOT ERROR]: Failed to award referral bonus:', refErr);
          }
        } else {
          await ctx.reply('👋 Willkommen bei CoinCade! 🎮🪙');
        }
      } else {
        // Welcoming back existing user
        await ctx.reply(`👋 Willkommen zurück bei CoinCade, ${firstName || 'Spieler'}! 🎮`);
      }

      // Send Play button linking to the frontend Mini App WebApp
      await ctx.reply(
        'Bereit zu zocken? Klicke auf den Button unten, um deine Energie zu sehen, Highscores aufzustellen und am Airdrop teilzunehmen!',
        Markup.inlineKeyboard([
          [Markup.button.webApp('🕹️ CoinCade starten 🚀', config.frontendUrl)],
        ])
      );
    } catch (error) {
      console.error('[BOT ERROR]: Error processing /start:', error);
      await ctx.reply('Etwas ist schiefgelaufen. Bitte versuche es später noch einmal.');
    }
  });

  // Launch bot in background
  bot.launch()
    .then(() => {
      console.log(`[BOT]: Telegram Bot @${bot?.botInfo?.username || 'unknown'} successfully started.`);
    })
    .catch((err) => {
      console.warn('[BOT WARNING]: Could not launch Telegram bot listener (invalid or test token):', err.message || err);
    });

  // Graceful shutdown listeners
  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));

  return bot;
}
