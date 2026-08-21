import db from '../database/client';
import { getBotInstance } from '../bot';
import { calculateEnergy } from './energy';
import { addInboxMessage } from './inboxService';
import { config } from '../config';

// In-memory cooldown cache to prevent spamming portfolio alerts (symbol_userId -> timestamp)
const portfolioAlertCooldowns = new Map<string, number>();

function formatBotPrice(price: number): string {
  if (price < 0.001) {
    return price.toFixed(10);
  } else if (price < 1) {
    return price.toFixed(6);
  }
  return price.toFixed(4);
}

/**
 * Checks all users and sends a Telegram notification when energy has fully recharged.
 */
export async function checkAndSendFullEnergyNotifications(): Promise<void> {
  const bot = getBotInstance();
  if (!bot) return;

  try {
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) return;

    const now = new Date();
    // Query users whose stored energy is below cap
    const users = await db('users')
      .where('id', 'not like', 'guest_%')
      .andWhere('id', 'not like', 'mock_%');

    for (const u of users) {
      const passType = u.season_pass_type || 'NONE';
      let maxCap = config.maxEnergy;
      if (passType === 'VIP') maxCap = 15;
      else if (passType === 'SEASON') maxCap = 8;

      // Skip users who already have full or surplus energy (> maxCap, e.g. from shop or admin)
      if (u.energy_value >= maxCap) {
        continue;
      }

      const lastUpdatedAt = new Date(u.energy_updated_at || now);
      const boosterUntil = u.time_booster_until ? new Date(u.time_booster_until) : null;
      
      const energyInfo = calculateEnergy(u.energy_value, lastUpdatedAt, passType, boosterUntil, now);

      // Check if user naturally recharged to reach full energy
      if (energyInfo.currentEnergy >= maxCap) {
        const lastNotified = u.full_energy_notified_at ? new Date(u.full_energy_notified_at).getTime() : 0;
        const lastSpent = lastUpdatedAt.getTime();

        // Only notify if energy was depleted earlier and hasn't been notified for this full recovery
        if (lastNotified < lastSpent) {
          const max = maxCap;
          const text = `⚡ *DEINE ENERGIE IST WIEDER VOLL!* (${max}/${max})\n` +
            `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
            `🎮 Deine Arcade-Energie wurde soeben vollständig regeneriert!\n\n` +
            `🏆 Starte jetzt ein Match in CoinCade, jage neue Highscores und sammle Game$ für den Season-Airdrop-Pot! 🚀`;

          let newNotifId: number | null = null;
          try {
            // Delete previous notification message to avoid spamming the chat
            if (u.last_notification_message_id) {
              try {
                await bot.telegram.deleteMessage(u.id, u.last_notification_message_id);
              } catch {}
            }

            const sent = await bot.telegram.sendMessage(u.id, text, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🕹️ Jetzt spielen (Mini App)', web_app: { url: config.frontendUrl } }],
                  [
                    { text: '📊 Mein Portfolio', callback_data: 'menu_market' },
                    { text: '👤 Profil', callback_data: 'menu_profile' }
                  ]
                ]
              }
            });
            newNotifId = sent.message_id;
            console.log(`[NOTIFICATION]: Sent full energy push notification to user ${u.id} (msg_id: ${newNotifId})`);
          } catch (tgErr: any) {
            // User may not have started the bot or blocked it
            console.log(`[NOTIFICATION]: Could not send full energy push to ${u.id}:`, tgErr.message || tgErr);
          }

          // Also record in internal player inbox (silently, without extra chat spam)
          await addInboxMessage(
            u.id,
            `⚡ Energie voll aufgeladen (${max}/${max})`,
            `Deine Energie wurde vollständig regeneriert. Du kannst jetzt wieder kostenlos Arcade-Runden spielen und Punkte sammeln!`,
            'system'
          );

          // Update database state
          await db('users')
            .where({ id: u.id })
            .update({
              energy_value: maxCap,
              energy_updated_at: now,
              full_energy_notified_at: now,
              ...(newNotifId ? { last_notification_message_id: newNotifId } : {}),
            });
        }
      }
    }
  } catch (err) {
    console.error('[NOTIFICATION ERROR]: Error in checkAndSendFullEnergyNotifications:', err);
  }
}

/**
 * Checks all holders of a specific coin and notifies them on significant price pumps or drops.
 */
export async function checkAndSendPortfolioAlerts(
  symbol: string,
  priceChangePercent: number,
  newPrice: number
): Promise<void> {
  const bot = getBotInstance();
  if (!bot) return;

  // Only trigger on noticeable movement (>= 2.0%)
  if (Math.abs(priceChangePercent) < 2.0) return;

  try {
    const hasPortfolios = await db.schema.hasTable('user_portfolios');
    if (!hasPortfolios) return;

    const holders = await db('user_portfolios')
      .where({ coin_symbol: symbol })
      .andWhere('amount', '>', 0)
      .andWhere('user_id', 'not like', 'guest_%')
      .andWhere('user_id', 'not like', 'mock_%');

    const now = Date.now();
    const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cooldown per user per coin

    for (const h of holders) {
      const cooldownKey = `${h.user_id}_${symbol}`;
      const lastAlertTime = portfolioAlertCooldowns.get(cooldownKey) || 0;

      if (now - lastAlertTime < COOLDOWN_MS) {
        continue;
      }

      const amount = Number(h.amount);
      const avgBuyPrice = Number(h.avg_buy_price || 0);
      const currentValue = amount * newPrice;
      const totalCost = amount * avgBuyPrice;
      const pnl = currentValue - totalCost;
      const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

      const isPump = priceChangePercent > 0;
      const headerEmoji = isPump ? '🚀 *KRYPTO-PUMP ALERT*' : '📉 *MARKT-BEWEGUNG*';
      const changeSign = isPump ? '+' : '';
      const pnlSign = pnl >= 0 ? '+' : '';
      const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';

      const text = `${headerEmoji}: *$${symbol}*\n` +
        `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
        `Der Kurs von *$${symbol}* hat sich um *${changeSign}${priceChangePercent.toFixed(2)}%* bewegt!\n\n` +
        `📊 *Aktueller Kurs:* \`${formatBotPrice(newPrice)} $\`\n` +
        `💎 *Dein Bestand:* \`${amount.toLocaleString('de-DE')} ${symbol}\`\n` +
        `💵 *Aktueller Wert:* \`${currentValue.toFixed(2)} $\`\n` +
        `${pnlEmoji} *Dein Gewinn/Verlust:* \`${pnlSign}${pnl.toFixed(2)} $ (${pnlSign}${pnlPct.toFixed(1)}%)\`\n\n` +
        `_Öffne die Mini App für Live-Charts und Trading!_`;

      try {
        await bot.telegram.sendMessage(h.user_id, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📈 Krypto-Börse in Mini App', web_app: { url: config.frontendUrl } }],
              [
                { text: '📊 Mein Portfolio', callback_data: 'menu_market' },
                { text: '🕹️ Arcade Lobby', callback_data: 'menu_main' }
              ]
            ]
          }
        });
        portfolioAlertCooldowns.set(cooldownKey, now);
        console.log(`[PORTFOLIO ALERT]: Sent market alert on $${symbol} to user ${h.user_id}`);
      } catch (tgErr: any) {
        console.log(`[PORTFOLIO ALERT]: Could not message user ${h.user_id}:`, tgErr.message || tgErr);
      }

      // Record in inbox
      await addInboxMessage(
        h.user_id,
        `${isPump ? '🚀 Pump' : '📉 Kurs-Update'}: $${symbol} (${changeSign}${priceChangePercent.toFixed(2)}%)`,
        `Der Kurs von $${symbol} liegt jetzt bei ${formatBotPrice(newPrice)} $. Dein Bestand von ${amount.toLocaleString('de-DE')} ${symbol} hat aktuell einen Wert von ${currentValue.toFixed(2)} $ (${pnlSign}${pnl.toFixed(2)} $).`,
        'market'
      );
    }
  } catch (err) {
    console.error('[PORTFOLIO ALERT ERROR]: Error in checkAndSendPortfolioAlerts:', err);
  }
}

/**
 * Starts background scheduler for energy and portfolio notifications.
 */
export function startNotificationScheduler(): void {
  console.log('[NOTIFICATION SCHEDULER]: Starting background energy notification checker (every 60s)...');
  
  // Initial check after 10 seconds
  setTimeout(() => {
    checkAndSendFullEnergyNotifications().catch((e) => console.error('[NOTIFICATION]: Initial check error', e));
  }, 10000);

  // Periodic check every 60 seconds
  setInterval(() => {
    checkAndSendFullEnergyNotifications().catch((e) => console.error('[NOTIFICATION]: Periodic check error', e));
  }, 60000);
}
