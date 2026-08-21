import { Markup } from 'telegraf';
import db from '../database/client';
import { config } from '../config';
import { getAndUpdateUserEnergy } from '../services/energy';
import { getMarketOverview } from '../services/marketEngine';
import { getCurrentSeason, getSeasonProfitLeaderboard } from '../services/seasonService';
import { getUserInbox, getUnreadInboxCount, markInboxAsRead } from '../services/inboxService';

export interface MenuRenderResult {
  text: string;
  keyboard: any;
}

/**
 * Builds the CoinCade Main Menu
 */
export async function buildMainMenu(userId: string): Promise<MenuRenderResult> {
  const user = await db('users').where({ id: userId }).first();
  const energyInfo = await getAndUpdateUserEnergy(userId);
  const unreadInbox = await getUnreadInboxCount(userId);

  const displayName = user?.display_name || user?.first_name || 'Spieler';
  const gameCash = (user?.game_cash || 0.0).toFixed(2);
  const passType = user?.season_pass_type === 'VIP' ? '👑 VIP PASS' : (user?.season_pass_type === 'SEASON' ? '🌟 SEASON PASS' : 'STANDARD');

  const text = `🎮 *━━━━━━━━━━━━━━━━━━━━*\n` +
    `🪙 *COINCADE ARCADE HUB*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
    `👤 *Spieler:* \`${displayName}\`\n` +
    `⚡ *Energie:* \`${energyInfo.currentEnergy}/${energyInfo.maxEnergy}\`${energyInfo.currentEnergy < energyInfo.maxEnergy && energyInfo.nextRechargeInSeconds > 0 ? ` *(+1 in ${Math.floor(energyInfo.nextRechargeInSeconds / 60)}m)*` : ' *(Voll)*'}\n` +
    `💵 *Game Cash:* \`${gameCash} $\`\n` +
    `🏆 *Status:* \`${passType}\`\n` +
    (unreadInbox > 0 ? `📬 *Inbox:* \`${unreadInbox} ungelesene Nachricht(en)\`\n\n` : `\n`) +
    `Wähle eine Aktion aus dem Menü:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('🕹️ CoinCade Mini App starten 🚀', config.frontendUrl)],
    [
      Markup.button.callback('👤 Mein Profil', 'menu_profile'),
      Markup.button.callback('💳 Auszahlungs-Wallets', 'menu_wallets'),
    ],
    [
      Markup.button.callback('🏆 Leaderboard', 'menu_leaderboard'),
      Markup.button.callback('📈 Krypto-Börse', 'menu_market'),
    ],
    [
      Markup.button.callback(`📬 Postfach ${unreadInbox > 0 ? `(${unreadInbox} neu)` : ''}`, 'menu_inbox'),
      Markup.button.callback('🔄 Aktualisieren', 'menu_main'),
    ]
  ]);

  return { text, keyboard };
}

/**
 * Builds the Profile Overview Screen
 */
export async function buildProfileMenu(userId: string): Promise<MenuRenderResult> {
  const user = await db('users').where({ id: userId }).first();
  const energyInfo = await getAndUpdateUserEnergy(userId);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'coincadebot';

  // Referral count
  const refCountRow = await db('users').where({ referred_by: userId }).count('id as count').first();
  const refCount = refCountRow ? parseInt(refCountRow.count as string, 10) : 0;
  const referralLink = `https://t.me/${botUsername}?start=${userId}`;

  const displayName = user?.display_name || user?.first_name || 'Spieler';
  const gameCash = (user?.game_cash || 0.0).toFixed(2);
  const passType = user?.season_pass_type || 'NONE';

  const ltcAddr = user?.wallet_ltc ? `\`${user.wallet_ltc.substring(0, 10)}...${user.wallet_ltc.slice(-8)}\`` : '❌ _Nicht hinterlegt_';

  const text = `👤 *MEIN COINCADE PROFIL*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
    `🏷️ *Anzeigename:* \`${displayName}\`\n` +
    `🆔 *Telegram ID:* \`${userId}\`\n` +
    `⚡ *Energie:* \`${energyInfo.currentEnergy}/${energyInfo.maxEnergy}\`\n` +
    `💵 *Game Cash Guthaben:* \`${gameCash} $\`\n` +
    `🎟️ *Season Pass:* \`${passType}\`\n\n` +
    `👥 *Geworbene Freunde:* \`${refCount}\`\n` +
    `🔗 *Dein Referral-Link:*\n\`${referralLink}\`\n\n` +
    `🟣 *LTC-Auszahlungsadresse (Airdrops):*\n${ltcAddr}\n`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('✏️ Name ändern (10 $)', 'menu_change_name'),
      Markup.button.callback('💳 LTC-Wallet', 'menu_wallets'),
    ],
    [Markup.button.callback('« Zurück zum Hauptmenü', 'menu_main')]
  ]);

  return { text, keyboard };
}

/**
 * Builds the Payout Wallets Menu (Litecoin only)
 */
export async function buildWalletsMenu(userId: string): Promise<MenuRenderResult> {
  const user = await db('users').where({ id: userId }).first();

  const ltcAddr = user?.wallet_ltc ? `\`${user.wallet_ltc}\`` : '❌ _Keine Litecoin-Adresse hinterlegt_';

  const text = `💳 *LTC AUSZAHLUNGS-WALLET*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
    `Alle Airdrop-Ausschüttungen und Krypto-Gewinne werden bei CoinCade ausschließlich in *Litecoin (LTC)* ausgezahlt.\n\n` +
    `🟣 *Deine hinterlegte LTC-Adresse:*\n${ltcAddr}\n\n` +
    `_Hinweis: Änderungen im Bot sind sofort live mit der Web-App synchronisiert._`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🟣 LTC-Adresse hinterlegen / ändern', 'wallet_edit_ltc')],
    [Markup.button.callback('« Zurück zum Hauptmenü', 'menu_main')]
  ]);

  return { text, keyboard };
}

/**
 * Builds the Leaderboard Menu
 */
export async function buildLeaderboardMenu(userId: string): Promise<MenuRenderResult> {
  const season = await getCurrentSeason();
  const topPlayers = await getSeasonProfitLeaderboard(season.id, 10);

  let listText = '';
  if (topPlayers.length === 0) {
    listText = '_Noch keine Teilnehmer in dieser Season. Starte ein Spiel und sei der Erste!_';
  } else {
    topPlayers.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `*${i + 1}.*`));
      const name = p.displayName || p.firstName || `User_${p.userId.slice(-4)}`;
      const isMe = p.userId === userId ? ' 👈 (Du)' : '';
      listText += `${medal} \`${name}\` — *${p.netProfit.toFixed(2)} $* (${p.totalRounds} Runden)${isMe}\n`;
    });
  }

  const text = `🏆 *COINCADE SEASON RANGSLISTE*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
    `🏆 *Season:* \`${season.name}\`\n` +
    `💰 *Aktueller Airdrop-Pot:* \`${season.currentPot.toFixed(2)} €\`\n` +
    `🎯 *Ziel:* \`${season.targetAmount.toFixed(2)} €\` (${season.progressPercent}%)\n` +
    `⏳ *Status:* \`${season.status.toUpperCase()}\` | *Restzeit:* \`${season.daysLeft} Tage\`\n\n` +
    `*Top 10 Season-Leaderboard:*\n` +
    `${listText}\n` +
    `_Spiele Runden und trade an der Börse, um deinen Season-Rang zu verbessern!_`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Rangliste aktualisieren', 'menu_leaderboard'),
      Markup.button.webApp('🕹️ Jetzt spielen', config.frontendUrl),
    ],
    [Markup.button.callback('« Zurück zum Hauptmenü', 'menu_main')]
  ]);

  return { text, keyboard };
}

/**
 * Builds the Portfolio / Market Overview Menu (Live Holdings, Profit/Loss, Prices)
 */
export async function buildMarketMenu(userId: string): Promise<MenuRenderResult> {
  const marketData = await getMarketOverview(userId);
  const user = await db('users').where({ id: userId }).first();
  const gameCash = Number(user?.game_cash || 0.0);

  function formatBotPrice(price: number): string {
    if (price < 0.001) {
      return price.toFixed(10);
    } else if (price < 1) {
      return price.toFixed(6);
    }
    return price.toFixed(4);
  }

  let totalPortfolioValue = 0;
  let totalInvestedCost = 0;
  let coinsText = '';

  marketData.coins.forEach((c) => {
    const changeSign = c.change24hPercent >= 0 ? '📈 +' : '📉 ';
    const changeStr = `${changeSign}${c.change24hPercent.toFixed(2)}%`;
    const userHolding = marketData.portfolio.find((p) => p.coinSymbol === c.symbol);
    const holdingAmount = userHolding ? userHolding.amount : 0;
    const avgBuyPrice = userHolding ? userHolding.avgBuyPrice : 0;
    const priceFormatted = formatBotPrice(c.currentPrice);

    const holdingValue = Math.round(holdingAmount * c.currentPrice * 10000) / 10000;
    const investedCost = Math.round(holdingAmount * avgBuyPrice * 10000) / 10000;
    const pnlCash = Math.round((holdingValue - investedCost) * 10000) / 10000;
    const pnlPct = investedCost > 0 ? ((pnlCash / investedCost) * 100) : 0;
    const pnlSign = pnlCash >= 0 ? '+' : '';
    const pnlEmoji = pnlCash > 0 ? '🟢' : (pnlCash < 0 ? '🔴' : '⚪');

    totalPortfolioValue += holdingValue;
    totalInvestedCost += investedCost;

    const holdingDisplay = holdingAmount > 0
      ? `  • Dein Bestand: \`${holdingAmount.toLocaleString('de-DE')} ${c.symbol}\`\n` +
        `  • Aktueller Wert: \`${holdingValue.toFixed(2)} $\` (Kauf: \`${investedCost.toFixed(2)} $\`)\n` +
        `  • Gewinn/Verlust: ${pnlEmoji} \`${pnlSign}${pnlCash.toFixed(2)} $ (${pnlSign}${pnlPct.toFixed(2)}%)\`\n\n`
      : `  • Dein Bestand: \`0 ${c.symbol}\` _(Noch keine Coins gekauft)_\n\n`;

    coinsText += `🔹 *${c.name} ($${c.symbol})*\n` +
      `  • Kurs: \`${priceFormatted} $\` (${changeStr})\n` +
      `  • 24h Volumen: \`${c.volume24h.toFixed(2)} $\`\n` +
      holdingDisplay;
  });

  const totalPnl = Math.round((totalPortfolioValue - totalInvestedCost) * 10000) / 10000;
  const totalPnlPct = totalInvestedCost > 0 ? ((totalPnl / totalInvestedCost) * 100) : 0;
  const totalPnlSign = totalPnl >= 0 ? '+' : '';
  const totalPnlEmoji = totalPnl > 0 ? '🟢' : (totalPnl < 0 ? '🔴' : '⚪');

  const text = `📊 *MEIN KRYPTO-PORTFOLIO & LIVE MARKT*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
    `💵 *Verfügbares Game Cash:* \`${gameCash.toFixed(2)} $\`\n` +
    `💎 *Portfolio-Gesamtwert:* \`${totalPortfolioValue.toFixed(2)} $\`\n` +
    `📈 *Gesamt-Gewinn/Verlust:* ${totalPnlEmoji} \`${totalPnlSign}${totalPnl.toFixed(2)} $ (${totalPnlSign}${totalPnlPct.toFixed(2)}%)\`\n\n` +
    `*Live Markt- & Bestandsübersicht:*\n\n` +
    `${coinsText}` +
    `_Öffne die Krypto-Börse in der CoinCade Mini App für interaktive Candlestick-Charts, Live-Orderbuch und Sofort-Trading!_`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.webApp('📈 Krypto-Börse in Mini App öffnen (Trading & Charts) 🚀', config.frontendUrl)],
    [
      Markup.button.callback('🔄 Portfolio aktualisieren', 'menu_market'),
      Markup.button.callback('« Zurück zum Hauptmenü', 'menu_main')
    ]
  ]);

  return { text, keyboard };
}

/**
 * Builds the User Inbox / Postfach Menu
 */
export async function buildInboxMenu(userId: string): Promise<MenuRenderResult> {
  const messages = await getUserInbox(userId, 8);
  const unreadCount = await getUnreadInboxCount(userId);

  let text = `📬 *COINCADE POSTFACH & INBOX*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n`;

  const buttons: any[] = [];

  if (messages.length === 0) {
    text += `_Dein Postfach ist derzeit leer._\n\nHier erhältst du Benachrichtigungen über Airdrops, Referral-Boni und wichtige Spiel-Updates.`;
  } else {
    text += `📬 *${unreadCount} ungelesene Nachricht(en)* (${messages.length} Gesamt):\n\n`;
    messages.forEach((m, idx) => {
      const icon = m.is_read ? '✉️' : '✨ 🆕';
      const dateStr = new Date(m.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      text += `${icon} *${m.title}* (${dateStr})\n`;

      buttons.push([
        Markup.button.callback(
          `${m.is_read ? '📖' : '📬 NEU:'} ${idx + 1}. ${m.title.substring(0, 22)}`,
          `inbox_view_${m.id}`
        )
      ]);
    });

    const actionRow: any[] = [];
    if (unreadCount > 0) {
      actionRow.push(Markup.button.callback('✨ Alle gelesen', 'inbox_read_all'));
    }
    const hasRead = messages.some((m) => m.is_read);
    if (hasRead) {
      actionRow.push(Markup.button.callback('🗑️ Gelesene löschen', 'inbox_clean_read'));
    }
    if (actionRow.length > 0) {
      buttons.push(actionRow);
    }
  }

  buttons.push([
    Markup.button.callback('🔄 Aktualisieren', 'menu_inbox'),
    Markup.button.callback('« Zurück zum Hauptmenü', 'menu_main')
  ]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

/**
 * Builds single inbox message detail view
 */
export async function buildInboxMessageDetail(userId: string, messageId: number): Promise<MenuRenderResult> {
  const message = await db('user_inbox').where({ id: messageId, user_id: userId }).first();

  if (!message) {
    return {
      text: `❌ *Nachricht nicht gefunden.*\n\nDiese Nachricht existiert nicht mehr oder wurde gelöscht.`,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('« Zurück zum Postfach', 'menu_inbox')]
      ])
    };
  }

  // Mark as read
  await markInboxAsRead(userId, messageId);

  const dateStr = new Date(message.created_at).toLocaleString('de-DE');
  const catEmoji = message.category === 'airdrop' ? '🏆' : (message.category === 'referral' ? '👥' : (message.category === 'market' ? '📈' : '📢'));

  const text = `📬 *POSTFACH NACHRICHT*\n` +
    `*━━━━━━━━━━━━━━━━━━━━*\n\n` +
    `${catEmoji} *${message.title}*\n` +
    `📅 *Datum:* \`${dateStr}\` | *Kategorie:* \`${message.category}\`\n\n` +
    `${message.message}\n`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Nachricht löschen', `inbox_del_${messageId}`)],
    [Markup.button.callback('« Zurück zum Postfach', 'menu_inbox')]
  ]);

  return { text, keyboard };
}
