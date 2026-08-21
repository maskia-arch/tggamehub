import { Telegraf, Markup } from 'telegraf';
import { config } from '../config';
import db from '../database/client';
import { addEnergy } from '../services/energy';
import { addInboxMessage, deleteInboxMessage } from '../services/inboxService';
import { executeMarketTrade } from '../services/marketEngine';
import {
  getUserSession,
  setUserSession,
  clearUserWizard,
  sanitizeTelegramName,
  cleanUserMessage,
  renderBotScreen,
} from './wizardState';
import {
  buildMainMenu,
  buildProfileMenu,
  buildWalletsMenu,
  buildLeaderboardMenu,
  buildMarketMenu,
  buildInboxMenu,
  buildInboxMessageDetail,
} from './menus';

let botInstance: Telegraf | null = null;

export function getBotInstance(): Telegraf | null {
  return botInstance;
}

export function initTelegramBot(): Telegraf | null {
  if (!config.telegramBotToken) {
    console.warn('[BOT]: No TELEGRAM_BOT_TOKEN provided. Skipping bot initialization.');
    return null;
  }

  const bot = new Telegraf(config.telegramBotToken);
  botInstance = bot;

  // ══════════════════════════════════════════════════════════════════════════
  // 1. /start Handler & Onboarding Wizard
  // ══════════════════════════════════════════════════════════════════════════
  bot.start(async (ctx) => {
    try {
      const telegramId = ctx.from.id.toString();
      const username = ctx.from.username || null;
      const firstName = ctx.from.first_name || '';
      const lastName = ctx.from.last_name || '';
      const referrerId = ctx.payload; // captures parameter in `/start <payload>`

      console.log(`[BOT]: /start from user ${telegramId}. Referrer payload: ${referrerId || 'none'}`);

      // Check if user exists in database
      const user = await db('users').where({ id: telegramId }).first();

      // If user exists and already has a display name, show the Main Menu
      if (user && user.display_name && user.display_name.trim().length >= 2) {
        clearUserWizard(telegramId);
        const { text, keyboard } = await buildMainMenu(telegramId);
        await renderBotScreen(ctx, text, keyboard);
        return;
      }

      // Prepare sanitized Telegram name candidate
      const rawFullName = `${firstName} ${lastName}`.trim() || username || 'Player';
      const sanitizedTgName = sanitizeTelegramName(rawFullName);

      // Initialize session for onboarding
      setUserSession(telegramId, {
        step: 'awaiting_custom_name',
        data: {
          referrerId: referrerId && referrerId !== telegramId ? referrerId : null,
          username,
          firstName,
          lastName,
          sanitizedTgName,
        },
      });

      const welcomeText = `👋 *Willkommen bei CoinCade! 🎮🪙*\n\n` +
        `Erstelle jetzt in wenigen Sekunden dein kostenloses Spielerprofil.\n\n` +
        `🏷️ *Wie soll dein Anzeigename im Spiel und auf der Rangliste lauten?*\n\n` +
        `_Regeln: 3 bis 15 Zeichen, keine Sonderzeichen. Der Name muss im Spiel einmalig sein._\n\n` +
        (sanitizedTgName.length >= 3
          ? `Du kannst deinen bereinigten Telegram-Namen *"${sanitizedTgName}"* mit einem Klick übernehmen oder unten deinen Wunschnamen in den Chat tippen.`
          : `Tippe deinen Wunschnamen bitte direkt hier in den Chat:`);

      const buttons = [];
      if (sanitizedTgName.length >= 3) {
        buttons.push([Markup.button.callback(`🏷️ "${sanitizedTgName}" verwenden`, 'wizard_use_tg_name')]);
      }

      await renderBotScreen(ctx, welcomeText, Markup.inlineKeyboard(buttons));
    } catch (error) {
      console.error('[BOT ERROR]: Error processing /start:', error);
      await ctx.reply('Etwas ist schiefgelaufen. Bitte versuche es später noch einmal.');
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. Wizard Action Handlers (Onboarding & Name Registration)
  // ══════════════════════════════════════════════════════════════════════════
  bot.action('wizard_use_tg_name', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const telegramId = ctx.from.id.toString();
      const session = getUserSession(telegramId);

      const chosenName = session.data?.sanitizedTgName || sanitizeTelegramName(ctx.from.first_name || 'Player');
      await finalizeUserRegistration(ctx, telegramId, chosenName, session.data?.referrerId);
    } catch (err: any) {
      console.error('[BOT ERROR]: Error in wizard_use_tg_name:', err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. Main Menu Navigation Actions
  // ══════════════════════════════════════════════════════════════════════════
  bot.action('menu_main', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      clearUserWizard(userId);
      const { text, keyboard } = await buildMainMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error rendering menu_main:', err);
    }
  });

  bot.action('menu_profile', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const { text, keyboard } = await buildProfileMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error rendering menu_profile:', err);
    }
  });

  bot.action('menu_wallets', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      clearUserWizard(userId);
      const { text, keyboard } = await buildWalletsMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error rendering menu_wallets:', err);
    }
  });

  bot.action('menu_leaderboard', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const { text, keyboard } = await buildLeaderboardMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error rendering menu_leaderboard:', err);
    }
  });

  bot.action(['menu_market', 'menu_portfolio'], async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      clearUserWizard(userId);
      const { text, keyboard } = await buildMarketMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error rendering menu_market/portfolio:', err);
    }
  });

  bot.action('menu_inbox', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const { text, keyboard } = await buildInboxMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error rendering menu_inbox:', err);
    }
  });

  bot.action('menu_change_name', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();
      const user = await db('users').where({ id: userId }).first();
      const currentCash = Number(user?.game_cash || 0.0);

      if (currentCash < 10.0) {
        const errText = `❌ *Zu wenig Game Cash!*\n\n` +
          `Eine Namensänderung kostet *10.00 InGame$* (Game Cash).\n\n` +
          `💵 *Dein aktuelles Guthaben:* \`${currentCash.toFixed(2)} $\`\n\n` +
          `_Zocke Arcade-Games oder trade an der Börse, um mehr Cash zu erspielen!_`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.webApp('🕹️ Jetzt spielen', config.frontendUrl)],
          [Markup.button.callback('« Zurück zum Profil', 'menu_profile')]
        ]);

        await renderBotScreen(ctx, errText, keyboard);
        return;
      }

      setUserSession(userId, {
        step: 'awaiting_name_change',
      });

      const promptText = `✏️ *Anzeigenamen ändern (Kosten: 10.00 $)*\n\n` +
        `💵 *Dein Guthaben:* \`${currentCash.toFixed(2)} $\` (nach Änderung: \`${(currentCash - 10).toFixed(2)} $\`)\n\n` +
        `Bitte tippe deinen neuen Wunschnamen jetzt direkt in den Chat:\n\n` +
        `_Regeln: 3 bis 15 Zeichen, keine Sonderzeichen, muss im Spiel einmalig sein._`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('« Abbrechen', 'menu_profile')]
      ]);

      await renderBotScreen(ctx, promptText, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error in menu_change_name:', err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. Wallet Editing Actions (Litecoin LTC Only)
  // ══════════════════════════════════════════════════════════════════════════
  bot.action(/^wallet_edit_([a-zA-Z]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id.toString();

      setUserSession(userId, {
        step: 'awaiting_wallet_address',
        data: { coin: 'LTC' },
      });

      const promptText = `💳 *Litecoin (LTC) Auszahlungs-Adresse hinterlegen*\n\n` +
        `Bitte sende deine gültige *Litecoin (LTC)* Wallet-Adresse als Textnachricht in diesen Chat.\n\n` +
        `_Regeln: Litecoin-Adressen beginnen mit L, M oder ltc1 (25-64 Zeichen)._\n` +
        `_Deine Adresse wird sofort synchronisiert und für alle Airdrop-Ausschüttungen verwendet._`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('« Abbrechen & Zurück', 'menu_wallets')]
      ]);

      await renderBotScreen(ctx, promptText, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error in wallet_edit:', err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. Market Quick Trading Actions
  // ══════════════════════════════════════════════════════════════════════════
  bot.action(/^market_buy_([a-zA-Z0-9]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const symbol = ctx.match[1].toUpperCase();
      const userId = ctx.from.id.toString();
      const user = await db('users').where({ id: userId }).first();
      const userCash = user?.game_cash || 0.0;

      const promptText = `🟢 *${symbol} KAUFEN*\n\n` +
        `💵 *Verfügbares Game Cash:* \`${userCash.toFixed(2)} $\`\n\n` +
        `Wähle einen Betrag oder tippe deinen Wunschbetrag in Dollar (z.B. \`10\`) in den Chat:`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('1.00 $', `trade_exec_buy_${symbol}_1`),
          Markup.button.callback('5.00 $', `trade_exec_buy_${symbol}_5`),
          Markup.button.callback('10.00 $', `trade_exec_buy_${symbol}_10`),
        ],
        [
          Markup.button.callback(`Max (${userCash.toFixed(2)} $)`, `trade_exec_buy_${symbol}_${Math.floor(userCash)}`),
        ],
        [Markup.button.callback('« Zurück zur Börse', 'menu_market')]
      ]);

      setUserSession(userId, {
        step: 'awaiting_market_buy',
        data: { symbol },
      });

      await renderBotScreen(ctx, promptText, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error in market_buy prompt:', err);
    }
  });

  bot.action(/^market_sell_([a-zA-Z0-9]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const symbol = ctx.match[1].toUpperCase();
      const userId = ctx.from.id.toString();

      const portfolio = await db('user_portfolios')
        .where({ user_id: userId, coin_symbol: symbol })
        .first();

      const holdings = portfolio?.amount || 0.0;

      const promptText = `🔴 *${symbol} VERKAUFEN*\n\n` +
        `📦 *Dein Bestand:* \`${holdings.toLocaleString('de-DE')} ${symbol}\`\n\n` +
        `Wähle wie viel Prozent deines Bestands du verkaufen möchtest:`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('25%', `trade_exec_sell_${symbol}_25`),
          Markup.button.callback('50%', `trade_exec_sell_${symbol}_50`),
          Markup.button.callback('100% (Alles)', `trade_exec_sell_${symbol}_100`),
        ],
        [Markup.button.callback('« Zurück zur Börse', 'menu_market')]
      ]);

      setUserSession(userId, {
        step: 'awaiting_market_sell',
        data: { symbol, holdings },
      });

      await renderBotScreen(ctx, promptText, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error in market_sell prompt:', err);
    }
  });

  // Execute buy trade via button
  bot.action(/^trade_exec_buy_([a-zA-Z0-9]+)_([0-9.]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const symbol = ctx.match[1].toUpperCase();
      const amountDollars = parseFloat(ctx.match[2]);
      const userId = ctx.from.id.toString();

      if (isNaN(amountDollars) || amountDollars <= 0) {
        await ctx.answerCbQuery('Ungültiger Betrag.');
        return;
      }

      const result = await executeMarketTrade(userId, symbol, 'BUY', amountDollars);
      clearUserWizard(userId);

      const tokensAcquired = result.tokensAcquired || 0;
      const totalCashSpent = result.totalCashSpent || 0;

      const confirmText = `✅ *Kauf erfolgreich!*\n\n` +
        `Du hast *${tokensAcquired.toLocaleString('de-DE')} ${symbol}* für *${totalCashSpent.toFixed(2)} $* gekauft.\n` +
        `💵 *Neues Cash-Guthaben:* \`${result.newCashBalance.toFixed(2)} $\``;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📈 Zurück zur Börse', 'menu_market')],
        [Markup.button.callback('« Hauptmenü', 'menu_main')]
      ]);

      await renderBotScreen(ctx, confirmText, keyboard);
    } catch (err: any) {
      console.error('[BOT ERROR]: Trade buy error:', err);
      await ctx.answerCbQuery(err.message || 'Fehler beim Kauf.');
    }
  });

  // Execute sell trade via button
  bot.action(/^trade_exec_sell_([a-zA-Z0-9]+)_([0-9]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const symbol = ctx.match[1].toUpperCase();
      const percent = parseInt(ctx.match[2], 10);
      const userId = ctx.from.id.toString();

      const portfolio = await db('user_portfolios')
        .where({ user_id: userId, coin_symbol: symbol })
        .first();

      const holdings = portfolio?.amount || 0.0;
      if (holdings <= 0) {
        await ctx.answerCbQuery('Du besitzt keine Coins dieses Typs.');
        return;
      }

      const tokensToSell = (holdings * percent) / 100;
      const result = await executeMarketTrade(userId, symbol, 'SELL', tokensToSell);
      clearUserWizard(userId);

      const tokensSold = result.tokensSold || 0;
      const netCashReceived = result.netCashReceived || 0;

      const confirmText = `✅ *Verkauf erfolgreich!*\n\n` +
        `Du hast *${tokensSold.toLocaleString('de-DE')} ${symbol}* verkauft und *+${netCashReceived.toFixed(2)} $* erhalten.\n` +
        `💵 *Neues Cash-Guthaben:* \`${result.newCashBalance.toFixed(2)} $\``;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📈 Zurück zur Börse', 'menu_market')],
        [Markup.button.callback('« Hauptmenü', 'menu_main')]
      ]);

      await renderBotScreen(ctx, confirmText, keyboard);
    } catch (err: any) {
      console.error('[BOT ERROR]: Trade sell error:', err);
      await ctx.answerCbQuery(err.message || 'Fehler beim Verkauf.');
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. Inbox Message Actions
  // ══════════════════════════════════════════════════════════════════════════
  bot.action(/^inbox_view_([0-9]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const messageId = parseInt(ctx.match[1], 10);
      const userId = ctx.from.id.toString();
      const { text, keyboard } = await buildInboxMessageDetail(userId, messageId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error viewing inbox message:', err);
    }
  });

  bot.action(/^inbox_del_([0-9]+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery('Nachricht gelöscht.');
      const messageId = parseInt(ctx.match[1], 10);
      const userId = ctx.from.id.toString();
      await deleteInboxMessage(userId, messageId);
      const { text, keyboard } = await buildInboxMenu(userId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (err) {
      console.error('[BOT ERROR]: Error deleting inbox message:', err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. Text Messages Handler (Name input, Wallet input, Trade input)
  // ══════════════════════════════════════════════════════════════════════════
  bot.on('text', async (ctx) => {
    try {
      const telegramId = ctx.from.id.toString();
      const rawText = ctx.message.text.trim();
      const session = getUserSession(telegramId);

      // Clean the user's message from the chat to keep it spotless
      await cleanUserMessage(ctx);

      // A. Awaiting custom display name (Initial registration)
      if (session.step === 'awaiting_custom_name') {
        const sanitizedName = sanitizeTelegramName(rawText);
        await finalizeUserRegistration(ctx, telegramId, sanitizedName, session.data?.referrerId);
        return;
      }

      // A2. Awaiting display name change (costs 10 InGame$)
      if (session.step === 'awaiting_name_change') {
        const cleanName = sanitizeTelegramName(rawText);

        if (cleanName.length < 3 || cleanName.length > 15) {
          await renderBotScreen(
            ctx,
            `❌ *Ungültiger Name!*\n\nDer Anzeigename muss zwischen *3 und 15 Zeichen* lang sein (keine Sonderzeichen).\n\nBitte tippe deinen Wunschnamen erneut:`,
            Markup.inlineKeyboard([[Markup.button.callback('« Abbrechen', 'menu_profile')]])
          );
          return;
        }

        const user = await db('users').where({ id: telegramId }).first();
        const currentCash = Number(user?.game_cash || 0.0);

        if (currentCash < 10.0) {
          clearUserWizard(telegramId);
          await renderBotScreen(
            ctx,
            `❌ *Zu wenig Game Cash!*\n\nEine Namensänderung kostet *10.00 InGame$*. Dein aktuelles Guthaben: \`${currentCash.toFixed(2)} $\`.`,
            Markup.inlineKeyboard([[Markup.button.callback('« Zurück zum Profil', 'menu_profile')]])
          );
          return;
        }

        // Check if same name
        if (user.display_name && user.display_name.toLowerCase() === cleanName.toLowerCase()) {
          await renderBotScreen(
            ctx,
            `❌ Du trägst den Namen *"${cleanName}"* bereits. Bitte wähle einen anderen Namen:`,
            Markup.inlineKeyboard([[Markup.button.callback('« Abbrechen', 'menu_profile')]])
          );
          return;
        }

        // Check uniqueness in database
        const existingUser = await db('users')
          .whereRaw('LOWER(display_name) = ?', [cleanName.toLowerCase()])
          .andWhereNot('id', telegramId)
          .first();

        if (existingUser) {
          await renderBotScreen(
            ctx,
            `❌ *Name bereits vergeben!*\n\nDer Name *"${cleanName}"* wird bereits von einem anderen Spieler verwendet.\n\nBitte tippe einen anderen Namen in den Chat:`,
            Markup.inlineKeyboard([[Markup.button.callback('« Abbrechen', 'menu_profile')]])
          );
          return;
        }

        // Deduct 10$ and update display name
        const newCash = Math.round((currentCash - 10.0) * 10000) / 10000;
        await db('users').where({ id: telegramId }).update({
          display_name: cleanName,
          game_cash: newCash,
          display_name_changed: true,
        });

        clearUserWizard(telegramId);

        await addInboxMessage(
          telegramId,
          '🏷️ Namensänderung erfolgreich',
          `Dein Anzeigename wurde im Bot auf "${cleanName}" geändert (-10.00 InGame$). Neues Cash-Guthaben: ${newCash.toFixed(2)} $.`,
          'system'
        );

        const successText = `✅ *Anzeigename erfolgreich geändert!*\n\n` +
          `🏷️ *Neuer Name:* \`${cleanName}\`\n` +
          `💵 *Abgezogen:* \`-10.00 InGame$\`\n` +
          `💵 *Neues Cash-Guthaben:* \`${newCash.toFixed(2)} $\`\n\n` +
          `_Dein neuer Name ist sofort in der Web-App und auf allen Ranglisten aktiv._`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('👤 Mein Profil anzeigen', 'menu_profile')],
          [Markup.button.callback('« Zum Hauptmenü', 'menu_main')]
        ]);

        await renderBotScreen(ctx, successText, keyboard);
        return;
      }


      // B. Awaiting wallet address
      if (session.step === 'awaiting_wallet_address') {
        const coin = session.data?.coin || 'LTC';
        const address = rawText;

        // Validate address syntax
        const isValid = validateCryptoAddress(coin, address);
        if (!isValid) {
          const errText = `❌ *Ungültige ${coin}-Adresse!*\n\n` +
            `Die eingegebene Adresse hat kein gültiges ${coin}-Format. Bitte prüfe deine Wallet-Adresse und sende sie erneut:`;

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('« Abbrechen & Zurück', 'menu_wallets')]
          ]);

          await renderBotScreen(ctx, errText, keyboard);
          return;
        }

        // Save wallet address in database
        const updateField = coin === 'BTC' ? 'wallet_btc' : (coin === 'SOL' ? 'wallet_sol' : (coin === 'ETH' ? 'wallet_eth' : 'wallet_ltc'));
        await db('users').where({ id: telegramId }).update({
          [updateField]: address,
        });

        clearUserWizard(telegramId);

        const successText = `✅ *${coin} Wallet erfolgreich hinterlegt!*\n\n` +
          `Adresse:\n\`${address}\``;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('💳 Wallets Übersicht', 'menu_wallets')],
          [Markup.button.callback('« Zum Hauptmenü', 'menu_main')]
        ]);

        await renderBotScreen(ctx, successText, keyboard);
        return;
      }

      // C. Awaiting market buy text input
      if (session.step === 'awaiting_market_buy') {
        const symbol = session.data?.symbol;
        const amountDollars = parseFloat(rawText.replace(',', '.'));

        if (isNaN(amountDollars) || amountDollars <= 0) {
          await renderBotScreen(ctx, `❌ Bitte gib einen gültigen Dollar-Betrag ein (z.B. \`10\`).`, Markup.inlineKeyboard([
            [Markup.button.callback('« Zurück', 'menu_market')]
          ]));
          return;
        }

        try {
          const result = await executeMarketTrade(telegramId, symbol, 'BUY', amountDollars);
          clearUserWizard(telegramId);

          const tokensAcquired = result.tokensAcquired || 0;
          const totalCashSpent = result.totalCashSpent || 0;

          const confirmText = `✅ *Kauf erfolgreich!*\n\n` +
            `Du hast *${tokensAcquired.toLocaleString('de-DE')} ${symbol}* für *${totalCashSpent.toFixed(2)} $* gekauft.\n` +
            `💵 *Neues Cash-Guthaben:* \`${result.newCashBalance.toFixed(2)} $\``;

          const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📈 Zurück zur Börse', 'menu_market')],
            [Markup.button.callback('« Hauptmenü', 'menu_main')]
          ]);

          await renderBotScreen(ctx, confirmText, keyboard);
        } catch (tradeErr: any) {
          await renderBotScreen(ctx, `❌ *Fehler:* ${tradeErr.message}`, Markup.inlineKeyboard([
            [Markup.button.callback('« Zurück zur Börse', 'menu_market')]
          ]));
        }
        return;
      }

      // Fallback: render main menu
      clearUserWizard(telegramId);
      const { text, keyboard } = await buildMainMenu(telegramId);
      await renderBotScreen(ctx, text, keyboard);
    } catch (textErr) {
      console.error('[BOT ERROR]: Error processing text message:', textErr);
    }
  });

  // Launch bot in background
  bot.launch()
    .then(() => {
      console.log(`[BOT]: Telegram Bot @${bot?.botInfo?.username || 'coincadebot'} successfully started.`);
    })
    .catch((err) => {
      console.warn('[BOT WARNING]: Could not launch Telegram bot listener (invalid or test token):', err.message || err);
    });

  // Graceful shutdown listeners
  process.once('SIGINT', () => bot?.stop('SIGINT'));
  process.once('SIGTERM', () => bot?.stop('SIGTERM'));

  return bot;
}

/**
 * Validates display name uniqueness and finalizes user onboarding.
 */
async function finalizeUserRegistration(ctx: any, telegramId: string, chosenName: string, referrerId?: string | null) {
  // 1. Length validation
  if (!chosenName || chosenName.length < 3 || chosenName.length > 15) {
    const errorText = `❌ *Ungültiger Name!*\n\n` +
      `Der Anzeigename muss zwischen *3 und 15 Zeichen* lang sein.\n\n` +
      `Bitte tippe deinen Wunschnamen direkt hier in den Chat:`;

    await renderBotScreen(ctx, errorText);
    return;
  }

  // 2. Uniqueness check in database (case-insensitive)
  const existingUserWithName = await db('users')
    .whereRaw('LOWER(display_name) = ?', [chosenName.toLowerCase()])
    .andWhereNot('id', telegramId)
    .first();

  if (existingUserWithName) {
    const takenText = `❌ *Name bereits vergeben!*\n\n` +
      `Der Name *"${chosenName}"* wird bereits von einem anderen Spieler verwendet.\n\n` +
      `Bitte wähle einen anderen Wunschnamen und tippe ihn in den Chat:`;

    await renderBotScreen(ctx, takenText);
    return;
  }

  // 3. Create or update user in database
  const existing = await db('users').where({ id: telegramId }).first();
  const firstName = ctx.from?.first_name || '';
  const lastName = ctx.from?.last_name || '';
  const username = ctx.from?.username || null;

  if (!existing) {
    let finalReferrerId: string | null = null;
    if (referrerId && referrerId !== telegramId) {
      const refUser = await db('users').where({ id: referrerId }).first();
      if (refUser) finalReferrerId = referrerId;
    }

    await db('users').insert({
      id: telegramId,
      username,
      first_name: firstName,
      last_name: lastName,
      display_name: chosenName,
      display_name_changed: false,
      energy_value: 5,
      energy_updated_at: new Date(),
      referred_by: finalReferrerId,
      game_cash: 0.0,
    });

    // Handle Referral Bonus
    if (finalReferrerId) {
      try {
        await db.transaction(async (trx) => {
          await trx('referrals').insert({
            referrer_id: finalReferrerId!,
            referred_id: telegramId,
          });
          await addEnergy(finalReferrerId!, config.referralEnergyBonus, true);
          await addEnergy(telegramId, config.referralEnergyBonus, true);
        });

        // Add inbox message and notification to referrer
        await addInboxMessage(
          finalReferrerId,
          '🎁 Neuer Referral-Bonus!',
          `Ein neuer Spieler (${chosenName}) hat sich über deinen Einladelink registriert. Du hast +${config.referralEnergyBonus} Bonus-Energie erhalten!`,
          'referral'
        );
      } catch (refErr) {
        console.error('[BOT ERROR]: Referral bonus error:', refErr);
      }
    }
  } else {
    await db('users').where({ id: telegramId }).update({
      display_name: chosenName,
    });
  }

  // 4. Send Welcome Inbox Message
  await addInboxMessage(
    telegramId,
    '🎮 Willkommen bei CoinCade!',
    `Herzlich willkommen, ${chosenName}! Dein Profil wurde erfolgreich erstellt.\n\nStarte die Mini App, zocke coole Arcade-Games, trade an der Börse und sichere dir echte Krypto-Airdrops!`,
    'system'
  );

  // Clear wizard step
  clearUserWizard(telegramId);

  // 5. Render Main Menu
  const { text, keyboard } = await buildMainMenu(telegramId);
  await renderBotScreen(ctx, text, keyboard);
}

/**
 * Basic crypto address format validation
 */
function validateCryptoAddress(coin: string, address: string): boolean {
  if (!address || address.length < 15 || address.length > 100) return false;

  const trimmed = address.trim();

  switch (coin) {
    case 'LTC':
      // Litecoin addresses start with L, M, or ltc1
      return /^(L|M|ltc1)[a-km-zA-HJ-NP-Z1-9]{25,64}$/.test(trimmed);
    case 'BTC':
      // Bitcoin addresses start with 1, 3, or bc1
      return /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
    case 'SOL':
      // Solana base58 address
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
    case 'ETH':
      // Ethereum hex address
      return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    default:
      return trimmed.length >= 20;
  }
}
