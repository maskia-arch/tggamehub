import { Request, Response } from 'express';
import { Markup } from 'telegraf';
import db from '../database/client';
import { config } from '../config';
import { getBotInstance } from '../bot';
import {
  getAiSettings,
  updateAiSettings,
  fetchAvailableModels,
  validateSelectedModel,
  calculateEstimatedDailyCostEur,
  DEEPSEEK_MODELS_PRICING,
  testDeepSeekHello
} from '../services/deepseekService';
import {
  trigger12HourAiCycle,
  verifyTelegramChannelConnection,
  startChannelModerationWelcomeMessage
} from '../services/aiScheduler';
import { addEnergy } from '../services/energy';

/**
 * Asynchronously updates the Telegram channel message in real-time when a claim is processed
 */
export async function liveEditTelegramChannelPost(postId: number): Promise<void> {
  try {
    const post = await db('ai_channel_posts').where({ id: postId }).first();
    if (!post || !post.telegram_message_id) return;

    const settings = await getAiSettings();
    if (!settings.telegram_channel_id) return;

    const bot = getBotInstance();
    if (!bot || !bot.telegram) return;

    const maxClaims = Number(post.reward_max_claims || 20);
    const claimedCount = Number(post.reward_claimed_count || 0);
    const remaining = Math.max(0, maxClaims - claimedCount);
    const isSoldOut = remaining <= 0;

    const postText = post.post_text_de || post.post_text;
    let body = postText
      .replace(/\*([^\*\n]+)\*/g, '<b>$1</b>')
      .replace(/_([^_\n]+)_/g, '<i>$1</i>');

    let updatedMsgText = `[COINCADE]\n\n` +
      `[NEWS] <b>CoinCade AI Live Broadcast</b>\n\n${body}`;

    const goal = post.community_goal_de || post.community_goal;
    if (goal) {
      updatedMsgText += `\n\n⚡ <b>Live Drop-Info:</b>\n<i>${goal}</i>`;
    }

    if (isSoldOut) {
      updatedMsgText += `\n\n🔴 <b>AUSVERKAUFT!</b> Alle <b>${maxClaims}</b> Boni wurden von schnellen Lesern eingelöst! Bleibt aktiv für den nächsten Drop.`;
    } else {
      updatedMsgText += `\n\n🎁 <b>Live-Claim Status:</b> Noch <b>${remaining} / ${maxClaims}</b> Boni verfügbar!`;
    }

    const buttons: any[] = [];
    const botUsername = (bot.botInfo?.username) || config.telegramBotUsername || 'CoinCadeGameBot';
    const claimUrl = `https://t.me/${botUsername}?start=${post.reward_claim_code}`;
    const botUrl = `https://t.me/${botUsername}`;

    if (!isSoldOut) {
      const rewardLabel = post.reward_type === 'ENERGY'
        ? `⚡ +${post.reward_amount} Energie sichern (Noch ${remaining}/${maxClaims})`
        : `🪙 +${Number(post.reward_amount).toLocaleString()} $${post.reward_coin_symbol} sichern (Noch ${remaining}/${maxClaims})`;
      buttons.push([Markup.button.url(rewardLabel, claimUrl)]);
    } else {
      buttons.push([Markup.button.url('🔒 Ausverkauft (Alle Boni vergeben)', claimUrl)]);
    }

    buttons.push([Markup.button.url('🎮 CoinCade Arcade öffnen', botUrl)]);

    const { formatCoinCadeHtml } = require('../services/customEmojiFormatter');
    const formattedHtml = formatCoinCadeHtml(updatedMsgText);

    await bot.telegram.editMessageText(
      settings.telegram_channel_id,
      parseInt(post.telegram_message_id, 10),
      undefined,
      formattedHtml,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      }
    );
    console.log(`[AI Channel Live Edit]: Successfully edited post #${post.id} (Claimed: ${claimedCount}/${maxClaims}, Remaining: ${remaining}).`);
  } catch (err: any) {
    // Ignore benign errors like "message is not modified"
    if (!err.message?.includes('message is not modified')) {
      console.warn('[AI Channel Live Edit Warn]:', err.message);
    }
  }
}

/**
 * Claims a community reward code atomically & live-updates Telegram post
 */
export async function processAiRewardClaim(
  userId: string,
  telegramId: string | null,
  rawClaimCode: string
): Promise<{ success: boolean; rewardType?: string; amount?: number; coinSymbol?: string; message: string }> {
  const cleanCode = rawClaimCode.trim();
  if (!cleanCode) {
    return { success: false, message: 'Ungültiger Claim-Code.' };
  }

  // Atomic Claim Execution via SQL Transaction with Row-Locking
  const claimResult = await db.transaction(async (trx) => {
    // Lock row for update
    const post = await trx('ai_channel_posts')
      .where({ reward_claim_code: cleanCode })
      .forUpdate()
      .first();

    if (!post) {
      return { success: false, message: 'Dieser Bonus-Code existiert nicht oder ist ungültig.' };
    }

    if (post.reward_expires_at && new Date(post.reward_expires_at) < new Date()) {
      return { success: false, message: 'Dieser Community-Bonus ist leider bereits abgelaufen.' };
    }

    if (post.reward_max_claims > 0 && post.reward_claimed_count >= post.reward_max_claims) {
      return { success: false, message: 'Das Kontingent für diesen Bonus wurde bereits vollständig aufgebraucht!' };
    }

    // Check if user already claimed this specific reward code
    const existingClaim = await trx('ai_reward_claims')
      .where({ claim_code: cleanCode, user_id: userId })
      .first();

    if (existingClaim) {
      return { success: false, message: 'Du hast diesen Bonus bereits erfolgreich eingelöst!' };
    }

    // 1. Record claim
    await trx('ai_reward_claims').insert({
      claim_code: cleanCode,
      user_id: userId,
      telegram_id: telegramId,
      reward_type: post.reward_type,
      reward_coin_symbol: post.reward_coin_symbol,
      reward_amount: post.reward_amount,
      claimed_at: new Date()
    });

    // 2. Increment claim count
    await trx('ai_channel_posts')
      .where({ id: post.id })
      .increment('reward_claimed_count', 1);

    const amount = Number(post.reward_amount);

    // 3. Credit Reward
    if (post.reward_type === 'ENERGY') {
      await addEnergy(userId, amount, true, trx);
      return {
        success: true,
        postId: post.id,
        rewardType: 'ENERGY',
        amount: amount,
        message: `⚡ Glückwunsch! Dir wurden ${amount} Energie-Punkte sofort gutgeschrieben!`
      };
    } else if (post.reward_type === 'COIN') {
      const sym = (post.reward_coin_symbol || 'DOODLE').toUpperCase();
      const holding = await trx('user_portfolios')
        .where({ user_id: userId, coin_symbol: sym })
        .first();

      if (holding) {
        await trx('user_portfolios')
          .where({ user_id: userId, coin_symbol: sym })
          .update({
            amount: Number(holding.amount) + amount,
            updated_at: new Date()
          });
      } else {
        await trx('user_portfolios').insert({
          user_id: userId,
          coin_symbol: sym,
          amount: amount,
          avg_buy_price: 0,
          total_invested: 0,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      return {
        success: true,
        postId: post.id,
        rewardType: 'COIN',
        amount: amount,
        coinSymbol: sym,
        message: `🎁 Glückwunsch! Dir wurden ${amount.toLocaleString()} $${sym} Token sofort gutgeschrieben!`
      };
    }

    return { success: true, postId: post.id, message: 'Bonus erfolgreich eingelöst!' };
  });

  // If claim succeeded and postId is known, trigger asynchronous Telegram live edit
  if (claimResult.success && (claimResult as any).postId) {
    liveEditTelegramChannelPost((claimResult as any).postId).catch(e => {
      console.warn('[AI Live Edit Background Error]:', e.message);
    });
  }

  return {
    success: claimResult.success,
    rewardType: claimResult.rewardType,
    amount: claimResult.amount,
    coinSymbol: claimResult.coinSymbol,
    message: claimResult.message
  };
}

/**
 * Admin: Start Channel Moderation & send official Welcome message
 */
export async function startAdminAiModerationHandler(_req: Request, res: Response) {
  try {
    const result = await startChannelModerationWelcomeMessage();
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Public/User endpoint: Get active published market news
 */
export async function getMarketNewsHandler(req: Request, res: Response) {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    let rows = await db('ai_market_news')
      .where('is_published', true)
      .orderBy('published_at', 'desc')
      .limit(limit);

    // If no published news, try to auto-publish the earliest pending item (lightweight operation only)
    if (!rows || rows.length === 0) {
      const pending = await db('ai_market_news')
        .where('is_published', false)
        .orderBy('scheduled_at', 'asc')
        .first();

      if (pending) {
        const now = new Date();
        await db('ai_market_news').where({ id: pending.id }).update({
          is_published: true,
          published_at: now,
          updated_at: now
        });
        pending.is_published = true;
        pending.published_at = now;
        rows = [pending];
        // Apply price impact in background (non-blocking, never crash the request)
        setImmediate(async () => {
          try {
            const { applyAiNewsImpact } = await import('../services/marketEngine');
            await applyAiNewsImpact(
              pending.coin_symbol,
              Number(pending.price_impact_percent) || 0,
              pending.title_de || pending.title,
              pending.summary_de || pending.summary
            );
          } catch (e) {
            // Non-fatal: price impact failure never crashes the news endpoint
            console.warn('[AI News]: Auto-publish price impact skipped:', (e as Error).message);
          }
        });
      }
      // If table is completely empty: return empty array gracefully.
      // The scheduler cron will generate new content on its next tick.
      // NEVER trigger a heavy AI cycle inside an HTTP request handler.
    }

    return res.json({
      success: true,
      news: (rows || []).map(r => ({
        id: r.id,
        title: r.title_de || r.title,
        titleDe: r.title_de || r.title,
        titleEn: r.title_en || r.title,
        summary: r.summary_de || r.summary,
        summaryDe: r.summary_de || r.summary,
        summaryEn: r.summary_en || r.summary,
        content: r.content,
        coinSymbol: r.coin_symbol,
        sentiment: r.sentiment,
        priceImpactPercent: Number(r.price_impact_percent || 0),
        impactDurationMinutes: r.impact_duration_minutes,
        storyArc: r.story_arc,
        publishedAt: r.published_at,
        createdAt: r.created_at
      }))
    });
  } catch (err: any) {
    // Never crash – always return valid JSON
    console.error('[AI News Handler Error]:', err.message);
    return res.json({ success: true, news: [] });
  }
}

/**
 * Public/User endpoint: Get active and recent AI Live Crypto Events
 */
export async function getLiveAiEventsHandler(req: Request, res: Response) {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const rows = await db('ai_live_events')
      .where('is_active', true)
      .orWhere('is_completed', true)
      .orderBy('scheduled_at', 'desc')
      .limit(limit);

    return res.json({
      success: true,
      events: rows.map(r => ({
        id: r.id,
        eventType: r.event_type,
        coinSymbol: r.coin_symbol,
        titleDe: r.title_de,
        titleEn: r.title_en,
        descriptionDe: r.description_de,
        descriptionEn: r.description_en,
        priceImpactPercent: Number(r.price_impact_percent || 0),
        multiplier: Number(r.multiplier || 1.0),
        durationMinutes: Number(r.duration_minutes || 60),
        isActive: Boolean(r.is_active),
        isCompleted: Boolean(r.is_completed),
        scheduledAt: r.scheduled_at,
        startedAt: r.started_at,
        endedAt: r.ended_at,
      }))
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * User endpoint: Claim reward code via WebApp Mini App
 */
export async function claimAiRewardHandler(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Nicht authentifiziert' });
    }

    const { claimCode } = req.body || {};
    if (!claimCode) {
      return res.status(400).json({ success: false, error: 'claimCode ist erforderlich' });
    }

    const user = await db('users').where({ id: userId }).first();
    const result = await processAiRewardClaim(userId, user?.id || null, claimCode);

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Get AI Settings & Status
 */
export async function getAdminAiSettingsHandler(_req: Request, res: Response) {
  try {
    const settings = await getAiSettings();
    const modelValidation = await validateSelectedModel(settings.selected_model, settings.deepseek_api_key);
    const costEstimate = calculateEstimatedDailyCostEur(
      settings.model_market_news,
      settings.model_live_events,
      settings.model_channel_posts
    );

    const maskedKey = settings.deepseek_api_key && settings.deepseek_api_key.length >= 8
      ? settings.deepseek_api_key.slice(0, 4) + '••••••••' + settings.deepseek_api_key.slice(-4)
      : (settings.deepseek_api_key ? 'sk-••••••••' : '');

    return res.json({
      success: true,
      settings: {
        ...settings,
        hasApiKey: settings.hasApiKey,
        apiKeySource: settings.apiKeySource,
        deepseek_api_key_masked: maskedKey,
      },
      modelValidation,
      pricingMatrix: DEEPSEEK_MODELS_PRICING,
      costEstimate
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Update AI Settings
 */
export async function updateAdminAiSettingsHandler(req: Request, res: Response) {
  try {
    const {
      deepseek_api_key,
      selected_model,
      model_market_news,
      model_live_events,
      model_channel_posts,
      is_enabled,
      auto_post_channel,
      telegram_channel_id,
      storyline_theme,
      interval_hours
    } = req.body || {};

    const updates: any = {};
    if (deepseek_api_key !== undefined) {
      if (typeof deepseek_api_key === 'string' && deepseek_api_key.trim().length > 0) {
        updates.deepseek_api_key = deepseek_api_key.trim();
      } else if (deepseek_api_key === '' || deepseek_api_key === null) {
        updates.deepseek_api_key = null;
      }
    }
    if (selected_model !== undefined) updates.selected_model = selected_model;
    if (model_market_news !== undefined) updates.model_market_news = model_market_news;
    if (model_live_events !== undefined) updates.model_live_events = model_live_events;
    if (model_channel_posts !== undefined) updates.model_channel_posts = model_channel_posts;
    if (is_enabled !== undefined) updates.is_enabled = Boolean(is_enabled);
    if (auto_post_channel !== undefined) updates.auto_post_channel = Boolean(auto_post_channel);
    if (telegram_channel_id !== undefined) updates.telegram_channel_id = telegram_channel_id;
    if (storyline_theme !== undefined) updates.storyline_theme = storyline_theme;
    if (interval_hours !== undefined) updates.interval_hours = Number(interval_hours) || 12;

    const updated = await updateAiSettings(updates);
    const modelValidation = await validateSelectedModel(updated.selected_model, updated.deepseek_api_key);
    const costEstimate = calculateEstimatedDailyCostEur(
      updated.model_market_news,
      updated.model_live_events,
      updated.model_channel_posts
    );

    const maskedKey = updated.deepseek_api_key && updated.deepseek_api_key.length >= 8
      ? updated.deepseek_api_key.slice(0, 4) + '••••••••' + updated.deepseek_api_key.slice(-4)
      : (updated.deepseek_api_key ? 'sk-••••••••' : '');

    return res.json({
      success: true,
      settings: {
        ...updated,
        hasApiKey: updated.hasApiKey,
        apiKeySource: updated.apiKeySource,
        deepseek_api_key_masked: maskedKey,
      },
      modelValidation,
      pricingMatrix: DEEPSEEK_MODELS_PRICING,
      costEstimate
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Live Verification of Telegram Channel Moderator connection
 */
export async function verifyAdminAiChannelHandler(req: Request, res: Response) {
  try {
    const { channelId } = req.body || {};
    const result = await verifyTelegramChannelConnection(channelId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Fetch Live DeepSeek Models
 */
export async function getAdminAiModelsHandler(req: Request, res: Response) {
  try {
    const apiKey = (req.query.apiKey as string) || undefined;
    const result = await fetchAvailableModels(apiKey);
    return res.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Trigger Manual 12-Hour AI Script Generation (with override / purge option)
 */
export async function triggerAdminAiGenerateHandler(req: Request, res: Response) {
  try {
    const { force_regenerate } = req.body || {};
    const result = await trigger12HourAiCycle(true, force_regenerate !== false);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Get AI History Logs & Complete Schedule (News, Posts, Live Events, Claims)
 */
export async function getAdminAiLogsHandler(_req: Request, res: Response) {
  try {
    const news = await db('ai_market_news').orderBy('scheduled_at', 'desc').limit(50);
    const posts = await db('ai_channel_posts').orderBy('scheduled_at', 'desc').limit(50);
    const liveEvents = await db('ai_live_events').orderBy('scheduled_at', 'desc').limit(50);
    const claims = await db('ai_reward_claims').orderBy('claimed_at', 'desc').limit(50);

    const latestNews = news[0];
    const latestPost = posts[0];
    const currentStoryArc = latestNews?.story_arc || latestPost?.story_arc || 'Cyber Genesis';

    return res.json({
      success: true,
      currentStoryArc,
      news,
      posts,
      liveEvents,
      claims
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Admin: Quick Ping Test to DeepSeek with a "Hallo" prompt
 */
export async function testAdminAiHelloHandler(req: Request, res: Response) {
  try {
    const { apiKey, model } = req.body || {};
    const result = await testDeepSeekHello(apiKey, model);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
