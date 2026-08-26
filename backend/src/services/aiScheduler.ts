import crypto from 'crypto';
import db from '../database/client';
import { getAiSettings, updateAiSettings, generate12HourScript } from './deepseekService';
import { getDynamicGamesList } from '../config/games';
import { getBotInstance } from '../bot';
import { Markup } from 'telegraf';
import { config } from '../config';
import { applyAiNewsImpact, applyLiveCryptoEvent } from './marketEngine';

let schedulerInterval: NodeJS.Timeout | null = null;
let isGenerating = false;

function generateSecureClaimCode(): string {
  return 'claim_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Gathers a full live snapshot of the game and market ecosystem
 */
export async function getEcosystemSnapshot(): Promise<any> {
  const allGames = await getDynamicGamesList();
  const activeGames = allGames.filter(g => g.status === 'active' && !g.hidden);
  const activeSymbols = activeGames.map(g => g.coinSymbol.toUpperCase());

  // 1. Detailed Coin & AMM Metrics
  const coins = await db('market_coins')
    .whereIn('symbol', activeSymbols)
    .select('symbol', 'name', 'current_price', 'base_price', 'change_24h_percent', 'volume_24h', 'circulating_supply', 'total_burned')
    .catch(() => []);

  const coinsFormatted = coins.map((c: any) => {
    const price = Number(c.current_price || 1.0);
    const base = Number(c.base_price || 1.0);
    const allTimeChange = base > 0 ? ((price - base) / base) * 100 : 0;
    return {
      symbol: c.symbol,
      name: c.name,
      currentPrice: price,
      basePrice: base,
      change24hPercent: Number(c.change_24h_percent || 0),
      allTimeChangePercent: Number(allTimeChange.toFixed(2)),
      volume24h: Number(c.volume_24h || 0),
      circulatingSupply: Number(c.circulating_supply || 1000000),
      totalTokensBurned: Number(c.total_burned || 0)
    };
  });

  // Identify Top Gainer & Top Loser Token
  const sortedByChange = [...coinsFormatted].sort((a, b) => b.change24hPercent - a.change24hPercent);
  const topGainer = sortedByChange[0] || null;
  const topLoser = sortedByChange[sortedByChange.length - 1] || null;

  // 2. Highscores & Player Hall of Fame
  const topPlayerScores = await db('scores')
    .join('users', 'scores.user_id', 'users.id')
    .select('scores.game_id', 'scores.score', 'users.display_name', 'users.username', 'scores.created_at')
    .orderBy('scores.score', 'desc')
    .limit(5)
    .catch(() => []);

  // Aggregated score rounds per game
  const gameStats = await db('scores')
    .select('game_id', db.raw('MAX(score) as highscore'), db.raw('COUNT(*) as total_plays'))
    .groupBy('game_id')
    .catch(() => []);

  // 3. Current Season & Tournament State
  const currentSeason = await db('seasons')
    .where('is_active', true)
    .first()
    .catch(() => null);

  // 4. Past AI Storyline Continuity (Last 24-48 Hours)
  const previousNews = await db('ai_market_news')
    .where('is_published', true)
    .orderBy('scheduled_at', 'desc')
    .limit(4)
    .select('title_de', 'title_en', 'summary_de', 'coin_symbol', 'sentiment', 'story_arc')
    .catch(() => []);

  const previousPost = await db('ai_channel_posts')
    .where('status', 'PUBLISHED')
    .orderBy('scheduled_at', 'desc')
    .first()
    .select('post_text_de', 'community_goal_de', 'reward_type', 'reward_amount', 'claims_count')
    .catch(() => null);

  // 5. Total Community & Player Metrics
  const totalUsersCount = await db('users').count('* as count').first().catch(() => ({ count: 0 }));
  const totalClaimsCount = await db('ai_reward_claims').count('* as count').first().catch(() => ({ count: 0 }));

  // 6. Channel Context from AI Settings
  const settings = await db('ai_settings').where({ id: 'global' }).first().catch(() => null);

  return {
    timestamp: new Date().toISOString(),
    macroContext: {
      totalRegisteredPlayers: Number(totalUsersCount?.count || 0),
      totalBonusesClaimedAllTime: Number(totalClaimsCount?.count || 0),
      currentSeason: currentSeason ? {
        seasonNumber: currentSeason.season_number,
        title: currentSeason.title || `Season ${currentSeason.season_number}`,
        prizePool: currentSeason.reward_pool || '10,000 $USDT',
        status: currentSeason.status
      } : { seasonNumber: 0, title: 'Season 0 — Genesis Pre-Season', status: 'ACTIVE' },
      channel: {
        title: settings?.telegram_channel_title || 'CoinCade Official Community',
        username: settings?.telegram_channel_username || '@CoinCadeCommunity',
        isModeratorActive: settings?.bot_moderator_status === 'VERIFIED_ADMIN'
      }
    },
    ammMarket: {
      coins: coinsFormatted,
      topGainerToken: topGainer ? { symbol: topGainer.symbol, change24h: topGainer.change24hPercent } : null,
      topLoserToken: topLoser ? { symbol: topLoser.symbol, change24h: topLoser.change24hPercent } : null,
      totalMarketCoinsCount: coinsFormatted.length
    },
    arcadeArena: {
      activeGames: activeGames.map(g => ({
        id: g.id,
        title: g.title,
        genre: g.genre,
        targetScore: g.targetScore,
        coinSymbol: g.coinSymbol,
        gameStats: gameStats.find((s: any) => s.game_id === g.id) || { highscore: 0, total_plays: 0 }
      })),
      topChampions: topPlayerScores.map((s: any) => ({
        playerName: s.display_name || s.username || 'CyberRacer',
        gameId: s.game_id,
        score: s.score
      }))
    },
    narrativeContinuity: {
      lastStoryArc: previousNews[0]?.story_arc || settings?.storyline_theme || 'CoinCade Cyber Genesis',
      recentNewsHeadlines: previousNews.map((n: any) => `[${n.coin_symbol}] ${n.title_de} (${n.sentiment})`),
      lastCommunityGoal: previousPost?.community_goal_de || 'Aktive Teilnahme an der AMM-Börse',
      lastBonusClaimsCount: previousPost?.claims_count || 0
    }
  };
}

/**
 * Executes a 12-Hour Storyline & Script Generation Cycle
 */
export async function trigger12HourAiCycle(
  isManual: boolean = false,
  forceRegenerate: boolean = false
): Promise<{ success: boolean; script?: any; error?: string }> {
  if (isGenerating) {
    return { success: false, error: 'Ein 12-Stunden-Generierungszyklus läuft bereits.' };
  }

  const settings = await getAiSettings();
  if (!settings.is_enabled && !isManual) {
    return { success: false, error: 'Automatisierung ist derzeit in den Einstellungen pausiert.' };
  }

  if (!settings.deepseek_api_key || settings.deepseek_api_key.trim() === '') {
    console.log('[AI Scheduler]: Kein DeepSeek API-Key hinterlegt. Nutze prozeduralen Fallback-Modus.');
  }

  isGenerating = true;
  console.log(`[AI Scheduler]: Starting 12-Hour Storyline Generation (${isManual ? 'MANUAL / OVERRIDE TRIGGER' : 'AUTO CRON'})...`);

  try {
    const snapshot = await getEcosystemSnapshot();
    const script = await generate12HourScript(snapshot, settings.storyline_theme || undefined);

    const now = new Date();

    // ── 0. Purge Old Pending Schedules on Manual Trigger / Override ────────
    if (isManual || forceRegenerate) {
      console.log('[AI Scheduler]: Overriding previous cycle: purging old pending schedules...');
      await db('ai_market_news').where({ is_published: false }).delete();
      if (forceRegenerate) {
        await db('ai_market_news').delete();
      }
      await db('ai_channel_posts').where({ status: 'SCHEDULED' }).delete();
      await db('ai_live_events').where({ is_active: false, is_completed: false }).delete();
    }

    // ── 1. Insert Scheduled Market News (First Item Published Immediately!) ─
    for (let i = 0; i < script.market_news.length; i++) {
      const news = script.market_news[i];
      const isInitial = i === 0;
      const scheduledMins = isInitial ? 0 : (Number(news.scheduled_minutes_from_now) || (i * 45));
      const scheduledAt = isInitial ? now : new Date(now.getTime() + scheduledMins * 60 * 1000);

      await db('ai_market_news').insert({
        title: news.title_de || news.title_en || 'Markt Update',
        title_de: news.title_de || news.title_en || 'Markt Update',
        title_en: news.title_en || news.title_de || 'Market Update',
        summary: news.summary_de || news.summary_en || '',
        summary_de: news.summary_de || news.summary_en || '',
        summary_en: news.summary_en || news.summary_de || '',
        content: news.summary_de || news.summary_en || '',
        coin_symbol: news.coin_symbol?.toUpperCase() || 'DOODLE',
        sentiment: news.sentiment || 'bullish',
        price_impact_percent: Math.min(10.0, Math.max(-10.0, Number(news.price_impact_percent) || 0)),
        impact_duration_minutes: Number(news.impact_duration_minutes) || 60,
        story_arc: script.story_arc_de || script.story_arc_en,
        scheduled_at: scheduledAt,
        is_published: isInitial,
        published_at: isInitial ? now : null,
        created_at: now,
        updated_at: now
      });

      // If initial breaking news item, apply real AMM price impact immediately!
      if (isInitial) {
        await applyAiNewsImpact(
          news.coin_symbol?.toUpperCase() || 'DOODLE',
          Number(news.price_impact_percent) || 0,
          news.title_de || news.title_en || 'Markt Update',
          news.summary_de || news.summary_en || ''
        );
      }
    }

    // ── 2. Insert Scheduled Telegram Channel Posts ──────────────────────────
    for (const post of script.channel_posts) {
      const scheduledAt = new Date(now.getTime() + (Number(post.scheduled_minutes_from_now) || 30) * 60 * 1000);
      const validHours = Number(post.reward_valid_hours) || 6;
      const expiresAt = new Date(scheduledAt.getTime() + validHours * 60 * 60 * 1000);
      const hasReward = post.reward_type && post.reward_type !== 'NONE' && Number(post.reward_amount) > 0;
      const claimCode = hasReward ? generateSecureClaimCode() : null;

      await db('ai_channel_posts').insert({
        post_text: post.post_text_de || post.post_text_en,
        post_text_de: post.post_text_de || post.post_text_en,
        post_text_en: post.post_text_en || post.post_text_de,
        story_arc: script.story_arc_de || script.story_arc_en,
        reward_type: post.reward_type || 'NONE',
        reward_coin_symbol: post.reward_coin_symbol?.toUpperCase() || (post.reward_type === 'COIN' ? 'DOODLE' : null),
        reward_amount: Number(post.reward_amount) || 0,
        reward_claim_code: claimCode,
        reward_max_claims: Math.max(10, Math.min(500, Number(post.reward_max_claims) || 50)),
        reward_claimed_count: 0,
        reward_expires_at: expiresAt,
        community_goal: post.community_goal_de || post.community_goal_en || null,
        community_goal_de: post.community_goal_de || post.community_goal_en || null,
        community_goal_en: post.community_goal_en || post.community_goal_de || null,
        status: 'SCHEDULED',
        scheduled_at: scheduledAt,
        created_at: now,
        updated_at: now
      });
    }

    // ── 3. Insert Scheduled Live Crypto Events ──────────────────────────────
    if (Array.isArray(script.crypto_events)) {
      for (const event of script.crypto_events) {
        const scheduledAt = new Date(now.getTime() + (Number(event.scheduled_minutes_from_now) || 45) * 60 * 1000);
        await db('ai_live_events').insert({
          event_type: event.event_type || 'CYBER_RALLY',
          coin_symbol: event.coin_symbol?.toUpperCase() || 'DOODLE',
          title_de: event.title_de || event.title_en || 'Live Krypto Event',
          title_en: event.title_en || event.title_de || 'Live Crypto Event',
          description_de: event.description_de || event.description_en || '',
          description_en: event.description_en || event.description_de || '',
          price_impact_percent: Math.min(10.0, Math.max(-10.0, Number(event.price_impact_percent) || 0)),
          multiplier: Math.max(1.0, Math.min(3.0, Number(event.multiplier) || 1.5)),
          duration_minutes: Math.max(15, Math.min(240, Number(event.duration_minutes) || 60)),
          story_arc: script.story_arc_de || script.story_arc_en,
          is_active: false,
          is_completed: false,
          scheduled_at: scheduledAt,
          created_at: now,
          updated_at: now
        });
      }
    }

    // ── 4. Update Settings Last Run & Next Run Timestamps ────────────────────
    const nextRun = new Date(now.getTime() + (settings.interval_hours || 12) * 60 * 60 * 1000);
    await db('ai_settings').where({ id: 'global' }).update({
      last_run_at: now,
      next_run_at: nextRun,
      updated_at: now
    });

    console.log(`[AI Scheduler]: 12-Hour Storyline "${script.story_arc_de}" successfully created with ${script.market_news.length} news (1st news live immediately), ${script.channel_posts.length} posts, and ${script.crypto_events?.length || 0} live events.`);
    return { success: true, script };
  } catch (err: any) {
    console.error('[AI Scheduler Error]: Failed to generate 12-hour script:', err.message);
    return { success: false, error: err.message };
  } finally {
    isGenerating = false;
  }
}

/**
 * Dispatches due market news, due channel posts, and live crypto events (ticks every 60s)
 */
export async function dispatchDueAiActions(): Promise<void> {
  try {
    const now = new Date();
    const settings = await getAiSettings();

    // ── A. Check if next 12-Hour Cycle is Due ──────────────────────────────
    if (settings.is_enabled) {
      if (!settings.last_run_at || (settings.next_run_at && new Date(settings.next_run_at) <= now)) {
        await trigger12HourAiCycle(false);
      }
    }

    // ── B. Publish Due In-Game Market News ─────────────────────────────────
    const dueNews = await db('ai_market_news')
      .where('scheduled_at', '<=', now)
      .andWhere('is_published', false);

    for (const news of dueNews) {
      // 1. Mark as published
      await db('ai_market_news')
        .where({ id: news.id })
        .update({ is_published: true, published_at: now, updated_at: now });

      // 2. Apply real price impact directly to AMM pool and record in market_events
      await applyAiNewsImpact(
        news.coin_symbol,
        Number(news.price_impact_percent),
        news.title_de || news.title,
        news.summary_de || news.summary,
        news.title_de || news.title,
        news.title_en || news.title,
        news.summary_de || news.summary,
        news.summary_en || news.summary
      );

      console.log(`[AI Market News]: Published "${news.title_de || news.title}" for $${news.coin_symbol} (Impact: ${news.price_impact_percent > 0 ? '+' : ''}${news.price_impact_percent}%).`);
    }

    // ── C. Activate Due Live Crypto Events ─────────────────────────────────
    const dueEvents = await db('ai_live_events')
      .where('scheduled_at', '<=', now)
      .andWhere('is_active', false)
      .andWhere('is_completed', false);

    for (const ev of dueEvents) {
      await db('ai_live_events')
        .where({ id: ev.id })
        .update({
          is_active: true,
          started_at: now,
          updated_at: now
        });

      await applyLiveCryptoEvent(
        ev.coin_symbol,
        ev.event_type,
        Number(ev.price_impact_percent || 0),
        Number(ev.multiplier || 1.5),
        Number(ev.duration_minutes || 60),
        ev.title_de,
        ev.title_en,
        ev.description_de,
        ev.description_en
      );
    }

    // ── D. Expire Finished Live Events ─────────────────────────────────────
    const activeEvents = await db('ai_live_events')
      .where('is_active', true)
      .andWhere('is_completed', false);

    for (const ev of activeEvents) {
      const startTime = new Date(ev.started_at || ev.scheduled_at).getTime();
      const endTime = startTime + (Number(ev.duration_minutes) || 60) * 60 * 1000;
      if (now.getTime() >= endTime) {
        await db('ai_live_events')
          .where({ id: ev.id })
          .update({
            is_active: false,
            is_completed: true,
            ended_at: now,
            updated_at: now
          });
        console.log(`[AI Live Event Completed]: Event "${ev.title_de}" ended.`);
      }
    }

    // ── E. Broadcast Due Telegram Channel Posts ────────────────────────────
    if (settings.auto_post_channel && settings.telegram_channel_id) {
      const duePosts = await db('ai_channel_posts')
        .where('scheduled_at', '<=', now)
        .andWhere('status', 'SCHEDULED');

      const bot = getBotInstance();
      if (bot && duePosts.length > 0) {
        for (const post of duePosts) {
          try {
            const channelId = settings.telegram_channel_id;
            const { formatCoinCadeHtml } = require('./customEmojiFormatter');

            const postText = post.post_text_de || post.post_text;
            let body = postText
              .replace(/\*([^\*\n]+)\*/g, '<b>$1</b>')
              .replace(/_([^_\n]+)_/g, '<i>$1</i>');

            let messageText = `[COINCADE]\n\n` +
              `[NEWS] <b>CoinCade AI Live Broadcast</b>\n\n${body}`;

            const communityGoal = post.community_goal_de || post.community_goal;
            if (communityGoal) {
              messageText += `\n\n🎯 <b>Aktuelles Community-Ziel:</b>\n<i>${communityGoal}</i>`;
            }

            const buttons: any[] = [];

            // If post has a claimable reward, attach the Claim Button
            if (post.reward_claim_code && post.reward_type !== 'NONE') {
              const rewardLabel = post.reward_type === 'ENERGY'
                ? `⚡ +${post.reward_amount} Energie Bonus sichern`
                : `🪙 +${Number(post.reward_amount).toLocaleString()} $${post.reward_coin_symbol} Story-Bonus sichern`;

              // Deep link to Bot: https://t.me/<bot_username>?start=claim_<reward_claim_code>
              const botUsername = (bot.botInfo?.username) || 'CoinCadeGameBot';
              const claimUrl = `https://t.me/${botUsername}?start=${post.reward_claim_code}`;
              
              messageText += `\n\n[GIFT] <b>Community-Bonus:</b> Exklusiv für die ersten <b>${post.reward_max_claims}</b> Spieler verfügbar! Tippe auf den Button unten, um dir deinen Bonus direkt abzuholen:`;

              buttons.push([Markup.button.url(rewardLabel, claimUrl)]);
            }

            // Also add button to open Arcade Mini App
            if (config.frontendUrl) {
              buttons.push([Markup.button.url('🎮 CoinCade Arcade öffnen', config.frontendUrl)]);
            }

            const formattedHtml = formatCoinCadeHtml(messageText);

            const sentMsg = await bot.telegram.sendMessage(
              channelId,
              formattedHtml,
              {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard(buttons)
              }
            );

            await db('ai_channel_posts')
              .where({ id: post.id })
              .update({
                status: 'POSTED',
                telegram_message_id: sentMsg.message_id.toString(),
                posted_at: now,
                updated_at: now
              });

            console.log(`[AI Channel Moderator]: Successfully posted message #${sentMsg.message_id} to channel ${channelId}.`);
          } catch (postErr: any) {
            console.error(`[AI Channel Moderator Error]: Failed to broadcast post #${post.id}:`, postErr.message);
            await db('ai_channel_posts')
              .where({ id: post.id })
              .update({ status: 'FAILED', updated_at: now });
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[AI Scheduler Dispatch Error]:', err.message);
  }
}

/**
 * Starts continuous background AI scheduler loop (every 60s)
 */
export function startAiScheduler() {
  if (schedulerInterval) return;
  console.log('[AI Scheduler]: Starting background DeepSeek AI scheduler (ticks every 60s)...');

  // Initial trigger check after 5 seconds
  setTimeout(async () => {
    try {
      await dispatchDueAiActions();
    } catch (e: any) {
      console.warn('[AI Scheduler Init Note]:', e.message);
    }
  }, 5000);

  schedulerInterval = setInterval(async () => {
    try {
      await dispatchDueAiActions();
    } catch (err) {
      console.error('[AI Scheduler Interval Error]:', err);
    }
  }, 60_000);
}

/**
 * Live verification of Telegram Channel / Group Bot Moderator connection
 */
export async function verifyTelegramChannelConnection(channelIdOverride?: string): Promise<{
  success: boolean;
  error?: string;
  chat?: any;
  bot?: any;
}> {
  const { getBotInstance } = require('../bot');
  const bot = getBotInstance();
  if (!bot) {
    return {
      success: false,
      error: 'Telegram Bot ist auf dem Server nicht initialisiert. Bitte TELEGRAM_BOT_TOKEN prüfen.'
    };
  }

  const settings = await getAiSettings();
  const targetChannel = (channelIdOverride || settings.telegram_channel_id || '').trim();

  if (!targetChannel) {
    return {
      success: false,
      error: 'Keine Telegram Channel ID hinterlegt. Trage eine Channel-ID (z.B. @MeinKanal oder -100...) ein oder füge @CoinCadeBot als Admin zum Kanal hinzu.'
    };
  }

  try {
    const chat: any = await bot.telegram.getChat(targetChannel);
    const botInfo = await bot.telegram.getMe();
    
    let memberInfo: any = null;
    try {
      memberInfo = await bot.telegram.getChatMember(chat.id, botInfo.id);
    } catch (mErr: any) {
      console.warn('[AI Channel Verify]: Could not fetch chat member:', mErr.message);
    }

    const isAdmin = memberInfo && (memberInfo.status === 'administrator' || memberInfo.status === 'creator');
    const canPost = memberInfo ? (memberInfo.can_post_messages !== false) : true;
    const moderatorStatus = isAdmin ? (canPost ? 'VERIFIED_ADMIN' : 'ADMIN_RESTRICTED') : (memberInfo?.status || 'UNKNOWN');

    const updates = {
      telegram_channel_id: chat.id.toString(),
      telegram_channel_title: chat.title || chat.username || targetChannel,
      telegram_channel_username: chat.username ? '@' + chat.username.replace(/^@/, '') : null,
      telegram_channel_type: chat.type || 'channel',
      bot_moderator_status: moderatorStatus,
      bot_moderator_verified_at: new Date(),
      bot_moderator_permissions: memberInfo ? JSON.stringify(memberInfo) : null,
    };

    await updateAiSettings(updates);

    return {
      success: true,
      chat: {
        id: chat.id.toString(),
        title: chat.title || chat.username || targetChannel,
        username: chat.username ? '@' + chat.username.replace(/^@/, '') : null,
        type: chat.type,
        description: chat.description || '',
        memberCount: chat.members_count || null
      },
      bot: {
        id: botInfo.id,
        username: '@' + botInfo.username,
        status: memberInfo?.status || 'unknown',
        isAdmin,
        canPost,
        moderatorStatus
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Telegram API Fehler für "${targetChannel}": ${err.message}`
    };
  }
}

/**
 * Sends the official Initial Welcome & Activation Broadcast to the Telegram Channel
 */
export async function startChannelModerationWelcomeMessage(): Promise<{
  success: boolean;
  message: string;
  messageId?: string;
  channelTitle?: string;
  claimCode?: string;
}> {
  const settings = await getAiSettings();
  if (!settings.telegram_channel_id) {
    return {
      success: false,
      message: 'Kein Telegram Kanal in den KI-Einstellungen hinterlegt. Bitte hinterlege zuerst eine Channel ID oder Username (z.B. @CoinCadeCommunity).'
    };
  }

  const bot = getBotInstance();
  if (!bot || !bot.telegram) {
    return {
      success: false,
      message: 'Telegram Bot ist aktuell offline oder nicht initialisiert (TELEGRAM_BOT_TOKEN prüfen).'
    };
  }

  try {
    const channelId = settings.telegram_channel_id;
    const chat: any = await bot.telegram.getChat(channelId);
    const channelTitle = chat.title || chat.username || channelId;

    // Generate unique genesis welcome claim code
    const claimCode = `claim_welcome_${Date.now().toString(36)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const postRow = await db('ai_channel_posts').insert({
      post_text: `🚀 *CoinCade Community Hub — Offizieller Kanal-Start!*\n\nWillkommen zur Eröffnung unseres interaktiven Kanals! Ab sofort versorge ich euch rund um die Uhr mit heißen Börsen-News, unvorhersehbaren Krypto-Rallyes und exklusiven Schnelligkeits-Drops für aktive Leser!`,
      post_text_de: `🚀 *CoinCade Community Hub — Offizieller Kanal-Start!*\n\nWillkommen zur Eröffnung unseres interaktiven Kanals! Ab sofort versorge ich euch rund um die Uhr mit heißen Börsen-News, unvorhersehbaren Krypto-Rallyes und exklusiven Schnelligkeits-Drops für aktive Leser!`,
      post_text_en: `🚀 *CoinCade Community Hub — Official Launch!*\n\nWelcome to our official interactive community channel! From now on, I will keep you posted around the clock with breaking market news, unpredictable crypto rallies, and exclusive speed-drops for active readers!`,
      story_arc: settings.storyline_theme || 'CoinCade Cyber Genesis',
      reward_type: 'COIN',
      reward_coin_symbol: 'DOODLE',
      reward_amount: 500,
      reward_claim_code: claimCode,
      reward_max_claims: 25,
      reward_claimed_count: 0,
      reward_expires_at: expiresAt,
      community_goal: '🚀 Genesis Willkommens-Drop: 500 $DOODLE für die ersten 25 Leser',
      community_goal_de: '🚀 Genesis Willkommens-Drop: 500 $DOODLE für die ersten 25 Leser',
      community_goal_en: '🚀 Genesis Welcome Drop: 500 $DOODLE for the first 25 readers',
      status: 'SCHEDULED',
      scheduled_at: now,
      created_at: now,
      updated_at: now
    }).returning('*');

    const createdPost = Array.isArray(postRow) ? postRow[0] : postRow;

    // Dispatch broadcast immediately
    const { formatCoinCadeHtml } = require('./customEmojiFormatter');
    const botUsername = (bot.botInfo?.username) || 'CoinCadeGameBot';
    const claimUrl = `https://t.me/${botUsername}?start=${claimCode}`;

    let msg = `[COINCADE]\n\n` +
      `[NEWS] <b>CoinCade Community Hub — Live Eröffnung</b>\n\n` +
      `🚀 <b>Der offizielle CoinCade Kanal ist ab sofort live!</b>\n\n` +
      `Willkommen im pulsierenden Cyberpunk-Arcade Hub! Ab sofort berichten wir rund um die Uhr über Live-Börsenkurse der Token <b>$DOODLE</b>, <b>$FLAPPY</b> & <b>$CROSSY</b>, spontane Krypto-Rallyes und verteilen regelmäßige Belohnungen an schnelle Leser!\n\n` +
      `🎁 <b>Genesis Willkommens-Bonus:</b>\n` +
      `Die ersten <b>25 Leser</b> erhalten sofort <b>500 $DOODLE</b> auf ihr Spielerkonto gutgeschrieben!\n\n` +
      `⚡ <i>Tippe unten auf den Button, um dir deinen Bonus direkt abzuholen:</i>`;

    const formattedHtml = formatCoinCadeHtml(msg);
    const buttons = [
      [Markup.button.url('🎁 +500 $DOODLE Genesis-Bonus sichern (Noch 25/25)', claimUrl)],
      ...(config.frontendUrl ? [[Markup.button.url('🎮 CoinCade Arcade öffnen', config.frontendUrl)]] : [])
    ];

    const sent = await bot.telegram.sendMessage(channelId, formattedHtml, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });

    const postId = createdPost?.id || (typeof createdPost === 'number' ? createdPost : null);
    if (postId) {
      await db('ai_channel_posts').where({ id: postId }).update({
        status: 'POSTED',
        telegram_message_id: sent.message_id.toString(),
        posted_at: now,
        updated_at: now
      });
    }

    await db('ai_settings').where({ id: 'global' }).update({
      bot_moderator_status: 'ACTIVE',
      bot_moderator_verified_at: now,
      telegram_channel_title: channelTitle,
      updated_at: now
    });

    return {
      success: true,
      message: `Kanal-Moderation erfolgreich gestartet! Begrüßungspost #${sent.message_id} an "${channelTitle}" gesendet.`,
      messageId: sent.message_id.toString(),
      channelTitle,
      claimCode
    };
  } catch (err: any) {
    console.error('[AI Moderator Start Error]:', err.message);
    return {
      success: false,
      message: `Fehler beim Senden des Begrüßungsposts: ${err.message}`
    };
  }
}
