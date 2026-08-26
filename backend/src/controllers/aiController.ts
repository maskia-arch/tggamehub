import { Request, Response } from 'express';
import db from '../database/client';
import {
  getAiSettings,
  updateAiSettings,
  fetchAvailableModels,
  validateSelectedModel,
  calculateEstimatedDailyCostEur,
  DEEPSEEK_MODELS_PRICING,
  testDeepSeekHello
} from '../services/deepseekService';
import { trigger12HourAiCycle, verifyTelegramChannelConnection } from '../services/aiScheduler';
import { addEnergy } from '../services/energy';

/**
 * Claims a community reward code atomically
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

  const post = await db('ai_channel_posts')
    .where({ reward_claim_code: cleanCode })
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
  const existingClaim = await db('ai_reward_claims')
    .where({ claim_code: cleanCode, user_id: userId })
    .first();

  if (existingClaim) {
    return { success: false, message: 'Du hast diesen Bonus bereits erfolgreich eingelöst!' };
  }

  // Atomic Claim Execution via SQL Transaction
  return await db.transaction(async (trx) => {
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
        rewardType: 'ENERGY',
        amount: amount,
        message: `⚡ Glückwunsch! Dir wurden ${amount} Energie-Punkte gutgeschrieben!`
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
        rewardType: 'COIN',
        amount: amount,
        coinSymbol: sym,
        message: `🎁 Glückwunsch! Dir wurden ${amount.toLocaleString()} $${sym} Token gutgeschrieben!`
      };
    }

    return { success: true, message: 'Bonus erfolgreich eingelöst!' };
  });
}

/**
 * Public/User endpoint: Get active published market news
 */
export async function getMarketNewsHandler(req: Request, res: Response) {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const rows = await db('ai_market_news')
      .where('is_published', true)
      .orderBy('published_at', 'desc')
      .limit(limit);

    return res.json({
      success: true,
      news: rows.map(r => ({
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
    return res.status(500).json({ success: false, error: err.message });
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
 * Admin: Trigger Manual 12-Hour AI Script Generation
 */
export async function triggerAdminAiGenerateHandler(_req: Request, res: Response) {
  try {
    const result = await trigger12HourAiCycle(true);
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
