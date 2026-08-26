import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import db from '../database/client';
import { config } from '../config';

export interface DeepSeekModel {
  id: string;
  name: string;
  status: 'active' | 'deprecated' | 'unknown' | 'beta';
  description?: string;
  category?: string;
  contextLength?: string;
  inputPriceCacheMissPer1M_EUR?: number;
  inputPriceCacheHitPer1M_EUR?: number;
  outputPricePer1M_EUR?: number;
  cacheDiscountPercent?: number;
  estimatedCostPerDay_EUR?: number;
  estimatedCostPerMonth_EUR?: number;
  recommendation?: string;
  bestFor?: string[];
}

export interface DeepSeekModelPricing {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'deprecated' | 'beta';
  description: string;
  contextLength: string;
  inputPriceCacheMissPer1M_USD: number;
  inputPriceCacheHitPer1M_USD: number;
  outputPricePer1M_USD: number;
  inputPriceCacheMissPer1M_EUR: number;
  inputPriceCacheHitPer1M_EUR: number;
  outputPricePer1M_EUR: number;
  cacheDiscountPercent: number;
  estimatedTokensPer12hCycle: {
    inputTokens: number;
    outputTokens: number;
  };
  estimatedCostPerCycle_EUR: number;
  estimatedCostPerDay_EUR: number; // 2 cycles/day
  estimatedCostPerMonth_EUR: number; // 60 cycles/month
  recommendation: string;
  bestFor: string[];
}

export const EUR_USD_RATE = 0.93; // 1 USD ~ 0.93 EUR

export const DEEPSEEK_MODELS_PRICING: Record<string, DeepSeekModelPricing> = {
  'deepseek-chat': {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat (V3 / V4 Alias)',
    category: 'General LLM / High-Speed Narrative',
    status: 'active',
    description: 'Neuestes DeepSeek Allround-Modell für blitzschnelle Generierung, flüssiges Storytelling & Telegram-Moderation.',
    contextLength: '64.000 Tokens (64k)',
    inputPriceCacheMissPer1M_USD: 0.14,
    inputPriceCacheHitPer1M_USD: 0.014,
    outputPricePer1M_USD: 0.28,
    inputPriceCacheMissPer1M_EUR: Number((0.14 * EUR_USD_RATE).toFixed(4)),
    inputPriceCacheHitPer1M_EUR: Number((0.014 * EUR_USD_RATE).toFixed(4)),
    outputPricePer1M_EUR: Number((0.28 * EUR_USD_RATE).toFixed(4)),
    cacheDiscountPercent: 90,
    estimatedTokensPer12hCycle: {
      inputTokens: 2500,
      outputTokens: 1800
    },
    estimatedCostPerCycle_EUR: 0.00055,
    estimatedCostPerDay_EUR: 0.0011, // ~0.11 Cent / Tag
    estimatedCostPerMonth_EUR: 0.033, // ~3.3 Cent / Monat
    recommendation: 'Empfohlen für 99% aller Aufgaben (Höchste Wirtschaftlichkeit & Geschwindigkeit)',
    bestFor: ['📰 Börsen-News', '📢 Telegram Channel Posts', '⚡ Live Krypto-Events']
  },
  'deepseek-reasoner': {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner (R1)',
    category: 'Reasoning / Deep Financial Analytics',
    status: 'active',
    description: 'DeepSeek-R1 mit integriertem Chain-of-Thought (CoT) für tiefe Marktsimulation & komplexe AMM-Mathematik.',
    contextLength: '64.000 Tokens (64k)',
    inputPriceCacheMissPer1M_USD: 0.55,
    inputPriceCacheHitPer1M_USD: 0.14,
    outputPricePer1M_USD: 2.19,
    inputPriceCacheMissPer1M_EUR: Number((0.55 * EUR_USD_RATE).toFixed(4)),
    inputPriceCacheHitPer1M_EUR: Number((0.14 * EUR_USD_RATE).toFixed(4)),
    outputPricePer1M_EUR: Number((2.19 * EUR_USD_RATE).toFixed(4)),
    cacheDiscountPercent: 75,
    estimatedTokensPer12hCycle: {
      inputTokens: 2500,
      outputTokens: 3200
    },
    estimatedCostPerCycle_EUR: 0.0071,
    estimatedCostPerDay_EUR: 0.0142, // ~1.42 Cent / Tag
    estimatedCostPerMonth_EUR: 0.426, // ~43 Cent / Monat
    recommendation: 'Empfohlen für komplexe Börsen- und Marktsimulationen mit tiefer mathematischer Begründung',
    bestFor: ['📰 Deep Market News & AMM-Modellierung', '⚡ Komplexe Live-Events']
  },
  'deepseek-v4-flash': {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    category: 'Next-Gen High-Speed Flash',
    status: 'active',
    description: 'DeepSeek V4 High-Performance Engine für blitzschnelle Großvolumen-Zyklen mit 1M Kontextfenster.',
    contextLength: '1.000.000 Tokens (1M)',
    inputPriceCacheMissPer1M_USD: 0.44,
    inputPriceCacheHitPer1M_USD: 0.014,
    outputPricePer1M_USD: 1.32,
    inputPriceCacheMissPer1M_EUR: Number((0.44 * EUR_USD_RATE).toFixed(4)),
    inputPriceCacheHitPer1M_EUR: Number((0.014 * EUR_USD_RATE).toFixed(4)),
    outputPricePer1M_EUR: Number((1.32 * EUR_USD_RATE).toFixed(4)),
    cacheDiscountPercent: 97,
    estimatedTokensPer12hCycle: {
      inputTokens: 2500,
      outputTokens: 1800
    },
    estimatedCostPerCycle_EUR: 0.00225,
    estimatedCostPerDay_EUR: 0.0045, // ~0.45 Cent / Tag
    estimatedCostPerMonth_EUR: 0.135, // ~13.5 Cent / Monat
    recommendation: 'Ultra-hohe Durchsatzrate & riesiges 1M Kontextfenster',
    bestFor: ['⚡ Live-Events', '📢 Telegram Broadcasts', '📰 Börsen-News']
  },
  'deepseek-v4-pro': {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    category: 'Next-Gen Flagship Reasoning',
    status: 'active',
    description: 'DeepSeek V4 Flaggschiff-Modell mit integriertem Thinking-Mode und höchster analytischer Präzision.',
    contextLength: '1.000.000 Tokens (1M)',
    inputPriceCacheMissPer1M_USD: 1.32,
    inputPriceCacheHitPer1M_USD: 0.044,
    outputPricePer1M_USD: 3.96,
    inputPriceCacheMissPer1M_EUR: Number((1.32 * EUR_USD_RATE).toFixed(4)),
    inputPriceCacheHitPer1M_EUR: Number((0.044 * EUR_USD_RATE).toFixed(4)),
    outputPricePer1M_EUR: Number((3.96 * EUR_USD_RATE).toFixed(4)),
    cacheDiscountPercent: 97,
    estimatedTokensPer12hCycle: {
      inputTokens: 2500,
      outputTokens: 3200
    },
    estimatedCostPerCycle_EUR: 0.00675,
    estimatedCostPerDay_EUR: 0.0135, // ~1.35 Cent / Tag
    estimatedCostPerMonth_EUR: 0.405, // ~40.5 Cent / Monat
    recommendation: 'Maximale Modellintelligenz & Chain-of-Thought Finanzanalyse',
    bestFor: ['📰 Deep Market News & AMM-Modellierung', '⚡ Komplexe Storylines']
  },
  'deepseek-v4-flash-vision-exp': {
    id: 'deepseek-v4-flash-vision-exp',
    name: 'DeepSeek V4 Flash Vision (Exp)',
    category: 'Multimodal / Vision Experimental',
    status: 'active',
    description: 'Experimentelles multimodales DeepSeek-Modell mit visueller und textueller Unterstützung.',
    contextLength: '1.000.000 Tokens (1M)',
    inputPriceCacheMissPer1M_USD: 0.44,
    inputPriceCacheHitPer1M_USD: 0.014,
    outputPricePer1M_USD: 1.32,
    inputPriceCacheMissPer1M_EUR: Number((0.44 * EUR_USD_RATE).toFixed(4)),
    inputPriceCacheHitPer1M_EUR: Number((0.014 * EUR_USD_RATE).toFixed(4)),
    outputPricePer1M_EUR: Number((1.32 * EUR_USD_RATE).toFixed(4)),
    cacheDiscountPercent: 97,
    estimatedTokensPer12hCycle: {
      inputTokens: 2500,
      outputTokens: 1800
    },
    estimatedCostPerCycle_EUR: 0.00225,
    estimatedCostPerDay_EUR: 0.0045,
    estimatedCostPerMonth_EUR: 0.135,
    recommendation: 'Multimodale Bild- und Textverarbeitung',
    bestFor: ['📰 Börsen-News', '⚡ Live-Events']
  }
};

export interface AiSettings {
  id: string;
  deepseek_api_key?: string;
  apiKeySource?: 'DATABASE' | 'ENV' | 'NONE';
  hasApiKey?: boolean;
  selected_model: string;
  model_market_news?: string | null;
  model_live_events?: string | null;
  model_channel_posts?: string | null;
  available_models?: string;
  is_enabled: boolean;
  auto_post_channel: boolean;
  telegram_channel_id?: string | null;
  telegram_channel_title?: string | null;
  telegram_channel_username?: string | null;
  telegram_channel_type?: string | null;
  bot_moderator_status?: string | null;
  bot_moderator_verified_at?: Date | string | null;
  bot_moderator_permissions?: string | null;
  storyline_theme?: string | null;
  interval_hours: number;
  last_run_at?: Date | null;
  next_run_at?: Date | null;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_cache_hit_tokens?: number;
  total_cache_miss_tokens?: number;
  total_estimated_cost_eur?: number;
}

export interface GeneratedMarketNewsItem {
  title_de: string;
  title_en: string;
  summary_de: string;
  summary_en: string;
  coin_symbol: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  price_impact_percent: number;
  impact_duration_minutes: number;
  scheduled_minutes_from_now: number;
}

export interface GeneratedChannelPostItem {
  post_text_de: string;
  post_text_en: string;
  community_goal_de?: string;
  community_goal_en?: string;
  reward_type: 'COIN' | 'ENERGY' | 'NONE';
  reward_coin_symbol?: string;
  reward_amount: number;
  reward_max_claims: number;
  reward_valid_hours: number;
  scheduled_minutes_from_now: number;
}

export interface GeneratedCryptoEventItem {
  event_type: 'CYBER_RALLY' | 'PUMP' | 'CRASH' | 'WHALE_ALERT' | 'QUANTUM_GLITCH' | 'ENERGY_SURGE';
  coin_symbol: string;
  title_de: string;
  title_en: string;
  description_de: string;
  description_en: string;
  price_impact_percent: number;
  multiplier: number;
  duration_minutes: number;
  scheduled_minutes_from_now: number;
}

export interface Generated12HourScript {
  story_arc_de: string;
  story_arc_en: string;
  summary_de: string;
  summary_en: string;
  market_news: GeneratedMarketNewsItem[];
  channel_posts: GeneratedChannelPostItem[];
  crypto_events: GeneratedCryptoEventItem[];
}

export function calculateEstimatedDailyCostEur(
  modelNews?: string | null,
  modelEvents?: string | null,
  modelPosts?: string | null
): {
  dailyCostEur: number;
  monthlyCostEur: number;
  perArea: {
    newsDailyEur: number;
    eventsDailyEur: number;
    postsDailyEur: number;
  };
  promptCacheSavingsPercent: number;
} {
  const newsModel = modelNews || 'deepseek-chat';
  const eventsModel = modelEvents || 'deepseek-chat';
  const postsModel = modelPosts || 'deepseek-chat';

  const pNews = DEEPSEEK_MODELS_PRICING[newsModel] || DEEPSEEK_MODELS_PRICING['deepseek-chat'];
  const pEvents = DEEPSEEK_MODELS_PRICING[eventsModel] || DEEPSEEK_MODELS_PRICING['deepseek-chat'];
  const pPosts = DEEPSEEK_MODELS_PRICING[postsModel] || DEEPSEEK_MODELS_PRICING['deepseek-chat'];

  // Calculate area weights (approx. News 40%, Events 30%, Posts 30% of total cycle load)
  const newsDaily = pNews.estimatedCostPerDay_EUR * 0.4;
  const eventsDaily = pEvents.estimatedCostPerDay_EUR * 0.3;
  const postsDaily = pPosts.estimatedCostPerDay_EUR * 0.3;

  const totalDaily = Number((newsDaily + eventsDaily + postsDaily).toFixed(5));
  const totalMonthly = Number((totalDaily * 30).toFixed(4));

  return {
    dailyCostEur: totalDaily,
    monthlyCostEur: totalMonthly,
    perArea: {
      newsDailyEur: Number(newsDaily.toFixed(5)),
      eventsDailyEur: Number(eventsDaily.toFixed(5)),
      postsDailyEur: Number(postsDaily.toFixed(5)),
    },
    promptCacheSavingsPercent: 88.5
  };
}

/**
 * Resolves the effective DeepSeek API key across Database, Server Environment (.env / process.env)
 */
export function getEffectiveDeepSeekApiKey(dbKey?: string | null): { key: string; source: 'DATABASE' | 'ENV' | 'NONE' } {
  if (dbKey && dbKey.trim().length > 0) {
    return { key: dbKey.trim(), source: 'DATABASE' };
  }

  const envCandidates = [
    process.env.DEEPSEEK_API_KEY,
    process.env.DEEPSEEK_KEY,
    process.env.DEEP_SEEK_API_KEY,
    config.deepseekApiKey
  ];

  for (const candidate of envCandidates) {
    if (candidate && candidate.trim().length > 0) {
      return { key: candidate.trim(), source: 'ENV' };
    }
  }

  // Try dynamic reload from filesystem .env in case it was written to disk while server was running
  try {
    const envPaths = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '../.env'),
      path.join(process.cwd(), 'backend/.env'),
      path.join(__dirname, '../../../.env'),
      path.join(__dirname, '../../.env')
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const parsed = dotenv.parse(fs.readFileSync(p, 'utf-8'));
        const fileKey = parsed.DEEPSEEK_API_KEY || parsed.DEEPSEEK_KEY || parsed.DEEP_SEEK_API_KEY;
        if (fileKey && fileKey.trim().length > 0) {
          process.env.DEEPSEEK_API_KEY = fileKey.trim();
          return { key: fileKey.trim(), source: 'ENV' };
        }
      }
    }
  } catch {
    // Ignore file read errors
  }

  return { key: '', source: 'NONE' };
}

export async function getAiSettings(): Promise<AiSettings & { apiKeySource: 'DATABASE' | 'ENV' | 'NONE'; hasApiKey: boolean }> {
  const row = await db('ai_settings').where({ id: 'global' }).first();
  const { key, source } = getEffectiveDeepSeekApiKey(row?.deepseek_api_key);

  const base = row || {
    id: 'global',
    selected_model: 'deepseek-chat',
    model_market_news: 'deepseek-chat',
    model_live_events: 'deepseek-chat',
    model_channel_posts: 'deepseek-chat',
    is_enabled: true,
    auto_post_channel: true,
    interval_hours: 12,
    storyline_theme: 'Cyberpunk Neon Metropolis: Tech innovations, cyber market rallies, and arcade tournaments.',
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    total_cache_hit_tokens: 0,
    total_cache_miss_tokens: 0,
    total_estimated_cost_eur: 0,
  };

  return {
    ...base,
    deepseek_api_key: key,
    apiKeySource: source,
    hasApiKey: key.length > 0,
    selected_model: base.selected_model || 'deepseek-chat',
    model_market_news: base.model_market_news || base.selected_model || 'deepseek-chat',
    model_live_events: base.model_live_events || base.selected_model || 'deepseek-chat',
    model_channel_posts: base.model_channel_posts || base.selected_model || 'deepseek-chat',
    is_enabled: Boolean(base.is_enabled),
    auto_post_channel: Boolean(base.auto_post_channel),
    total_prompt_tokens: Number(base.total_prompt_tokens || 0),
    total_completion_tokens: Number(base.total_completion_tokens || 0),
    total_cache_hit_tokens: Number(base.total_cache_hit_tokens || 0),
    total_cache_miss_tokens: Number(base.total_cache_miss_tokens || 0),
    total_estimated_cost_eur: Number(base.total_estimated_cost_eur || 0),
  };
}

export async function updateAiSettings(updates: Partial<AiSettings>): Promise<AiSettings> {
  const payload: any = {
    ...updates,
    updated_at: new Date(),
  };

  await db('ai_settings')
    .where({ id: 'global' })
    .update(payload);

  return getAiSettings();
}

/**
 * Records token consumption and Prompt Caching metrics into the database
 */
export async function recordAiUsageMetrics(
  promptTokens: number,
  completionTokens: number,
  cacheHitTokens: number,
  cacheMissTokens: number,
  callCostEur: number
) {
  try {
    const current = await getAiSettings();
    await db('ai_settings')
      .where({ id: 'global' })
      .update({
        total_prompt_tokens: (current.total_prompt_tokens || 0) + promptTokens,
        total_completion_tokens: (current.total_completion_tokens || 0) + completionTokens,
        total_cache_hit_tokens: (current.total_cache_hit_tokens || 0) + cacheHitTokens,
        total_cache_miss_tokens: (current.total_cache_miss_tokens || 0) + cacheMissTokens,
        total_estimated_cost_eur: Number(((current.total_estimated_cost_eur || 0) + callCostEur).toFixed(6)),
        updated_at: new Date()
      });
  } catch (err: any) {
    console.warn('[AI Usage Tracker Warning]:', err.message);
  }
}

/**
 * Dynamically fetches available models from DeepSeek API enriched with real pricing & daily costs
 */
export async function fetchAvailableModels(customApiKey?: string): Promise<{
  models: DeepSeekModel[];
  pricingMatrix: Record<string, DeepSeekModelPricing>;
  costEstimate: any;
  warning?: string;
}> {
  const settings = await getAiSettings();
  const apiKey = customApiKey || settings.deepseek_api_key;
  const costEstimate = calculateEstimatedDailyCostEur(
    settings.model_market_news,
    settings.model_live_events,
    settings.model_channel_posts
  );

  // Preset known official models
  const presetModelIds = Object.keys(DEEPSEEK_MODELS_PRICING);
  const liveModelIdSet = new Set<string>(presetModelIds);

  // Include any configured custom models from settings
  [settings.selected_model, settings.model_market_news, settings.model_live_events, settings.model_channel_posts].forEach(m => {
    if (m && m.trim().length > 0) {
      liveModelIdSet.add(m.trim());
    }
  });

  if (apiKey && apiKey.trim().length > 0) {
    try {
      const response = await axios.get('https://api.deepseek.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && Array.isArray(response.data.data)) {
        response.data.data.forEach((m: any) => {
          if (m?.id) liveModelIdSet.add(m.id);
        });
      }
    } catch (err: any) {
      console.warn('[DeepSeek Service]: Could not fetch live models from endpoint, using full official catalog:', err.message);
    }
  }

  const enrichedModels: DeepSeekModel[] = Array.from(liveModelIdSet).map((id) => {
    const p = DEEPSEEK_MODELS_PRICING[id] || {
      id,
      name: id.startsWith('deepseek') ? id : `Custom: ${id}`,
      category: id.includes('reasoner') || id.includes('r1') ? 'Reasoning / Analysis' : 'General LLM',
      status: 'active' as const,
      description: `DeepSeek Modell "${id}"`,
      contextLength: id.includes('v4') ? '1.000.000 Tokens (1M)' : '64.000 Tokens (64k)',
      inputPriceCacheMissPer1M_EUR: Number(((id.includes('pro') ? 1.32 : id.includes('reasoner') ? 0.55 : 0.14) * EUR_USD_RATE).toFixed(4)),
      inputPriceCacheHitPer1M_EUR: Number(((id.includes('pro') ? 0.044 : id.includes('reasoner') ? 0.14 : 0.014) * EUR_USD_RATE).toFixed(4)),
      outputPricePer1M_EUR: Number(((id.includes('pro') ? 3.96 : id.includes('reasoner') ? 2.19 : 0.28) * EUR_USD_RATE).toFixed(4)),
      cacheDiscountPercent: id.includes('v4') ? 97 : id.includes('reasoner') ? 75 : 90,
      estimatedCostPerDay_EUR: id.includes('pro') ? 0.0135 : id.includes('reasoner') ? 0.0142 : 0.0011,
      estimatedCostPerMonth_EUR: id.includes('pro') ? 0.405 : id.includes('reasoner') ? 0.426 : 0.033,
      recommendation: id.includes('reasoner') || id.includes('pro') ? 'Tiefe Marktanalyse & Argumentation' : 'Hohe Geschwindigkeit & Effizienz',
      bestFor: ['Börsen-News', 'Events', 'Moderation']
    };

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      description: p.description,
      category: p.category,
      contextLength: p.contextLength,
      inputPriceCacheMissPer1M_EUR: p.inputPriceCacheMissPer1M_EUR,
      inputPriceCacheHitPer1M_EUR: p.inputPriceCacheHitPer1M_EUR,
      outputPricePer1M_EUR: p.outputPricePer1M_EUR,
      cacheDiscountPercent: p.cacheDiscountPercent,
      estimatedCostPerDay_EUR: p.estimatedCostPerDay_EUR,
      estimatedCostPerMonth_EUR: p.estimatedCostPerMonth_EUR,
      recommendation: p.recommendation,
      bestFor: p.bestFor
    };
  });

  return {
    models: enrichedModels,
    pricingMatrix: DEEPSEEK_MODELS_PRICING,
    costEstimate
  };
}

/**
 * Validates selected model status and detects deprecations
 */
export async function validateSelectedModel(modelId: string, apiKey?: string): Promise<{ isValid: boolean; warning?: string }> {
  if (!modelId || modelId.trim().length === 0) {
    return { isValid: true };
  }
  const { models } = await fetchAvailableModels(apiKey);
  const found = models.find(m => m.id === modelId);

  if (found && found.status === 'deprecated') {
    return {
      isValid: true,
      warning: `Achtung: Das Modell "${modelId}" ist als veraltet markiert und wird möglicherweise bald eingestellt.`
    };
  }

  return { isValid: true };
}

/**
 * High-quality, bilingual procedural fallback script when API key is missing or network times out
 */
export function generateFallbackScript(theme: string, coins: any[]): Generated12HourScript {
  const symbols = (coins && coins.length > 0) ? coins.map(c => c.symbol) : ['DOODLE', 'FLAPPY', 'CROSSY'];
  const primaryCoin = symbols[0] || 'DOODLE';
  const secondaryCoin = symbols[1] || 'FLAPPY';
  const tertiaryCoin = symbols[2] || 'CROSSY';

  return {
    story_arc_de: `${theme} — Episode: Cyber Genesis`,
    story_arc_en: `${theme} — Episode: Cyber Genesis`,
    summary_de: 'Autonomer 12-Stunden Simulationszyklus mit dynamischen Storylines, AMM-Kurseffekten und Community-Aktionen.',
    summary_en: 'Autonomous 12-hour simulation cycle with dynamic storylines, AMM market impacts, and community actions.',
    market_news: [
      {
        title_de: `🚀 Gigantische Bullen-Welle erfasst $${primaryCoin}!`,
        title_en: `🚀 Massive Bull Wave Sweeps Over $${primaryCoin}!`,
        summary_de: `Ein unerwarteter Nachfrageschub im ${primaryCoin}-Sektor treibt das Handelsvolumen rasant nach oben.`,
        summary_en: `An unexpected surge in ${primaryCoin} demand drives trade volume rapidly upwards.`,
        coin_symbol: primaryCoin,
        sentiment: 'bullish',
        price_impact_percent: 3.5,
        impact_duration_minutes: 180,
        scheduled_minutes_from_now: 15
      },
      {
        title_de: `⚠️ Liquiditäts-Engpass bremst $${secondaryCoin} aus`,
        title_en: `⚠️ Liquidity Bottleneck Slows Down $${secondaryCoin}`,
        summary_de: `Händler nehmen Gewinne mit. Die AMM-Pools verzeichnen eine kurze Abkühlungsphase.`,
        summary_en: `Traders are taking profits. The AMM pools enter a brief consolidation cooling phase.`,
        coin_symbol: secondaryCoin,
        sentiment: 'bearish',
        price_impact_percent: -2.4,
        impact_duration_minutes: 120,
        scheduled_minutes_from_now: 180
      },
      {
        title_de: `🌐 Cyber-Netzwerk meldet Rekord-Transaktionen bei $${tertiaryCoin}`,
        title_en: `🌐 Cyber Network Reports Record Transactions on $${tertiaryCoin}`,
        summary_de: `Die neuen Minigame-Rekorde pushen den Burn-Mechanismus auf ein Allzeit-Hoch.`,
        summary_en: `New minigame records push the token burn mechanism to an all-time high.`,
        coin_symbol: tertiaryCoin,
        sentiment: 'bullish',
        price_impact_percent: 4.2,
        impact_duration_minutes: 240,
        scheduled_minutes_from_now: 360
      }
    ],
    channel_posts: [
      {
        post_text_de: `⚡ *[CoinCade AI Alert]*: Das Cyberpunk-Netzwerk glüht! Übertrifft in den nächsten Stunden gemeinsam die Highscore-Benchmark, um die nächste Bullen-Rallye zu entfesseln! Hier ist euer Energie-Booster:`,
        post_text_en: `⚡ *[CoinCade AI Alert]*: The Cyberpunk arcade grid is glowing hot! Beat the highscore benchmark together in the coming hours to trigger the next bull rally! Here is your energy booster:`,
        community_goal_de: 'Knackt gemeinsam neue Highscores im Arcade Hub',
        community_goal_en: 'Break new highscores together across the Arcade Hub',
        reward_type: 'ENERGY',
        reward_amount: 3,
        reward_max_claims: 80,
        reward_valid_hours: 6,
        scheduled_minutes_from_now: 30
      },
      {
        post_text_de: `🎁 *[Community Krypto Airdrop]*: Als Belohnung für die starke Aktivität an der Börse verteilt die Arcade-KI heute einen Story-Bonus in $${tertiaryCoin}! Schnell zugreifen:`,
        post_text_en: `🎁 *[Community Crypto Airdrop]*: As a reward for heavy trading activity, the Arcade AI is dropping a story bonus in $${tertiaryCoin}! Claim yours fast:`,
        community_goal_de: 'Aktiv an der Börse partizipieren und $CROSSY hodln',
        community_goal_en: 'Actively trade and hodl $CROSSY in the AMM exchange',
        reward_type: 'COIN',
        reward_coin_symbol: tertiaryCoin,
        reward_amount: 300,
        reward_max_claims: 60,
        reward_valid_hours: 8,
        scheduled_minutes_from_now: 240
      }
    ],
    crypto_events: [
      {
        event_type: 'CYBER_RALLY',
        coin_symbol: primaryCoin,
        title_de: `🔥 Cyber Rallye auf $${primaryCoin}`,
        title_en: `🔥 Cyber Rally on $${primaryCoin}`,
        description_de: `Ein plötzlicher Zufluss an Cyber-Token beschleunigt den AMM-Pool für 90 Minuten! 1.5x Burn-Multiplier aktiv!`,
        description_en: `A sudden influx of cyber tokens accelerates the AMM pool for 90 minutes! 1.5x Burn Multiplier active!`,
        price_impact_percent: 4.8,
        multiplier: 1.5,
        duration_minutes: 90,
        scheduled_minutes_from_now: 60
      },
      {
        event_type: 'ENERGY_SURGE',
        coin_symbol: secondaryCoin,
        title_de: `⚡ Quantum Energy Storm`,
        title_en: `⚡ Quantum Energy Storm`,
        description_de: `Ein digitaler Energie-Sturm entlädt sich über dem Arcade-Sektor. Minigame-Punkte zählen doppelt für den Coin-Burn!`,
        description_en: `A digital energy storm discharges across the arcade sector. Minigame points burn 2x tokens!`,
        price_impact_percent: 2.5,
        multiplier: 2.0,
        duration_minutes: 60,
        scheduled_minutes_from_now: 300
      }
    ]
  };
}

/**
 * Deterministic, invariant System Prompt for maximum DeepSeek Prompt Caching Hits (90% cost reduction)
 */
const INVARIANT_SYSTEM_PROMPT = `You are the autonomous AI Game Master, narrative storyteller, and Chief Financial Anchor of "CoinCade" (a futuristic Telegram Cyberpunk Arcade & AMM Crypto Trading Mini-App).

MISSION:
Every 12 hours, you receive an ecosystem snapshot ($DOODLE, $FLAPPY, $CROSSY token prices, player highscores, trading volumes).
You will generate a cohesive, thrilling 12-hour episodic storyline arc with THREE key deliverables:

1. BILINGUAL IN-GAME MARKET NEWS ("market_news", 2-4 items):
   - title_de & title_en: Punchy breaking news headlines.
   - summary_de & summary_en: 2-3 sentences detailing market events.
   - coin_symbol: 'DOODLE', 'FLAPPY', or 'CROSSY'.
   - sentiment: 'bullish' | 'bearish' | 'neutral'.
   - price_impact_percent: Realistic impact between -6.0% and +6.5%.
   - impact_duration_minutes: 60 to 240 minutes.
   - scheduled_minutes_from_now: Spread across 12 hours.

2. BILINGUAL TELEGRAM COMMUNITY-CHANNEL POSTS ("channel_posts", 2-3 items):
   - post_text_de & post_text_en: Engaging, high-energy moderator broadcasts with emojis and clear story progression.
   - community_goal_de & community_goal_en: Concrete arcade/trading community objectives.
   - reward_type: 'ENERGY' (1 to 5 energy) or 'COIN' (100 to 500 coins) or 'NONE'.
   - reward_coin_symbol: 'DOODLE', 'FLAPPY', or 'CROSSY'.
   - reward_amount: Safe integer.
   - reward_max_claims: Limited claim quota for fastest players.
   - reward_valid_hours: Expiry time.
   - scheduled_minutes_from_now: Timed distribution over 12 hours.

3. LIVE CRYPTO EVENTS ("crypto_events", 1-2 items):
   - event_type: 'CYBER_RALLY' | 'PUMP' | 'CRASH' | 'WHALE_ALERT' | 'QUANTUM_GLITCH' | 'ENERGY_SURGE'.
   - coin_symbol: 'DOODLE', 'FLAPPY', or 'CROSSY'.
   - title_de & title_en, description_de & description_en.
   - price_impact_percent: -5.0 to +6.0.
   - multiplier: 1.25 to 2.0.
   - duration_minutes: 45 to 120 minutes.
   - scheduled_minutes_from_now: 60 to 600 minutes.

- You MUST respond ONLY with a valid JSON object strictly matching this schema.`;

/**
 * Sends game & market metrics to DeepSeek and generates the 12-hour Storyline Script
 * Optimized for DeepSeek Prefix Prompt Caching (64-token alignment)
 */
export async function generate12HourScript(
  contextSnapshot: any,
  customTheme?: string
): Promise<Generated12HourScript> {
  const settings = await getAiSettings();
  const apiKey = settings.deepseek_api_key;
  const theme = customTheme || settings.storyline_theme || 'Cyberpunk Neon Metropolis Arcade Hub';

  if (!apiKey || apiKey.trim() === '') {
    console.warn('[DeepSeek AI Service]: Kein DeepSeek API-Key konfiguriert. Nutze prozedurales Fallback-Skript.');
    return generateFallbackScript(theme, contextSnapshot?.coins || []);
  }

  // Model selection: primary model for overall cycle orchestration
  const selectedModel = settings.model_market_news || settings.selected_model || 'deepseek-chat';

  // Rich context extraction
  const macro = contextSnapshot?.macroContext || {};
  const amm = contextSnapshot?.ammMarket || {};
  const arena = contextSnapshot?.arcadeArena || {};
  const narrative = contextSnapshot?.narrativeContinuity || {};

  // Dynamic user prompt placed strictly at the end to guarantee invariant system prompt cache hit
  const userPrompt = `=== COINCADE LIVE ECOSYSTEM CONTEXT (12-HOUR CYCLE) ===
- Current Storyline Theme: ${theme}
- Narrative Continuity (Previous Arc): "${narrative.lastStoryArc || 'Genesis'}"
- Recent Published Headlines: ${JSON.stringify(narrative.recentNewsHeadlines || [])}
- Active Season: ${JSON.stringify(macro.currentSeason || { seasonNumber: 0, title: 'Season 0' })}
- Total Registered Players: ${macro.totalRegisteredPlayers || 0}
- Telegram Channel: "${macro.channel?.title || 'CoinCade Community'}" (${macro.channel?.username || '@CoinCade'})

=== AMM CRYPTO EXCHANGE & TOKEN MARKET ===
- Listed Tokens & Prices: ${JSON.stringify(amm.coins || contextSnapshot?.coins || [])}
- 24h Top Gainer: ${JSON.stringify(amm.topGainerToken || null)}
- 24h Top Loser: ${JSON.stringify(amm.topLoserToken || null)}

=== ARCADE ARENA & PLAYER HIGHSCORES ===
- Active Minigames & Multipliers: ${JSON.stringify(arena.activeGames || [])}
- Hall of Fame Champions: ${JSON.stringify(arena.topChampions || contextSnapshot?.topPerformers || [])}
- Previous Community Goal: "${narrative.lastCommunityGoal || 'Highscores brechen'}" (Claimed: ${narrative.lastBonusClaimsCount || 0} players)

Generate the complete bilingual 12-Hour Storyline Script now strictly matching the JSON schema:`;

  try {
    const isReasoningModel = selectedModel.includes('reasoner') || selectedModel.includes('r1') || selectedModel.includes('pro');
    const requestBody: any = {
      model: selectedModel,
      messages: [
        { role: 'system', content: INVARIANT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 3500
    };

    if (!isReasoningModel) {
      requestBody.temperature = 0.75;
    }

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    // Track usage metrics and prompt caching hits
    const usage = response.data?.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const cacheHitTokens = usage.prompt_cache_hit_tokens || 0;
    const cacheMissTokens = usage.prompt_cache_miss_tokens || Math.max(0, promptTokens - cacheHitTokens);

    const pricing = DEEPSEEK_MODELS_PRICING[selectedModel] || DEEPSEEK_MODELS_PRICING['deepseek-chat'];
    const hitCostEur = (cacheHitTokens / 1_000_000) * pricing.inputPriceCacheHitPer1M_EUR;
    const missCostEur = (cacheMissTokens / 1_000_000) * pricing.inputPriceCacheMissPer1M_EUR;
    const outCostEur = (completionTokens / 1_000_000) * pricing.outputPricePer1M_EUR;
    const totalCallCostEur = hitCostEur + missCostEur + outCostEur;

    await recordAiUsageMetrics(promptTokens, completionTokens, cacheHitTokens, cacheMissTokens, totalCallCostEur);

    console.log(`[DeepSeek Usage]: Model: ${selectedModel} | Prompt: ${promptTokens} (Cache Hit: ${cacheHitTokens}, Miss: ${cacheMissTokens}) | Completion: ${completionTokens} | Est. Cost: €${totalCallCostEur.toFixed(6)}`);

    let rawContent = response.data?.choices?.[0]?.message?.content || '';
    if (!rawContent) {
      throw new Error('Empty response from DeepSeek.');
    }

    // Clean reasoning tags <think>...</think> if model output contains CoT reasoning
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Clean markdown code fences if wrapped in ```json ... ```
    if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    const parsed = JSON.parse(rawContent);
    return {
      story_arc_de: parsed.story_arc_de || parsed.story_arc || 'Cyberpunk City News Ticker',
      story_arc_en: parsed.story_arc_en || parsed.story_arc || 'Cyberpunk City News Ticker',
      summary_de: parsed.summary_de || parsed.summary || 'Automatische 12-Stunden Markt- und Community-Aktualisierung.',
      summary_en: parsed.summary_en || parsed.summary || 'Autonomous 12-hour market and community cycle.',
      market_news: Array.isArray(parsed.market_news) ? parsed.market_news : [],
      channel_posts: Array.isArray(parsed.channel_posts) ? parsed.channel_posts : [],
      crypto_events: Array.isArray(parsed.crypto_events) ? parsed.crypto_events : []
    };
  } catch (err: any) {
    console.error('[DeepSeek AI Service Error]:', err?.response?.data || err.message);
    console.warn('[DeepSeek AI Service]: Activating bilingual fallback script for 100% reliability.');
    return generateFallbackScript(theme, amm.coins || contextSnapshot?.coins || []);
  }
}

/**
 * Quick Test-Ping to DeepSeek with a "Hallo" prompt
 */
export async function testDeepSeekHello(apiKeyOverride?: string, modelOverride?: string): Promise<{
  success: boolean;
  message: string;
  response?: string;
  modelUsed?: string;
  apiKeySource?: string;
  latencyMs?: number;
  tokensUsed?: { prompt: number; completion: number; total: number };
}> {
  const settings = await getAiSettings();
  const effectiveKey = (apiKeyOverride && apiKeyOverride.trim().length > 0) ? apiKeyOverride.trim() : settings.deepseek_api_key;
  const model = (modelOverride && modelOverride.trim().length > 0) ? modelOverride.trim() : (settings.selected_model || 'deepseek-chat');

  if (!effectiveKey || !effectiveKey.trim()) {
    return {
      success: false,
      message: 'Kein API-Key hinterlegt. Bitte hinterlege DEEPSEEK_API_KEY in der Server .env oder im Dashboard.',
      apiKeySource: settings.apiKeySource || 'NONE'
    };
  }

  const startTime = Date.now();
  try {
    const res = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: model,
        messages: [
          { role: 'system', content: 'Du bist die CoinCade AI Engine. Antworte immer präzise und freundlich auf Deutsch.' },
          { role: 'user', content: 'Hallo! Bitte gib eine kurze Bestätigung (max 1-2 Sätze), dass die DeepSeek-Anbindung für CoinCade einwandfrei funktioniert.' }
        ],
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${effectiveKey.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const latencyMs = Date.now() - startTime;
    let choice = res.data?.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
    choice = choice.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const usage = res.data?.usage;

    return {
      success: true,
      message: 'DeepSeek API-Ping erfolgreich!',
      response: choice,
      modelUsed: res.data?.model || model,
      apiKeySource: settings.apiKeySource,
      latencyMs,
      tokensUsed: {
        prompt: usage?.prompt_tokens || 0,
        completion: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0
      }
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err.response?.data?.error?.message || err.message;
    return {
      success: false,
      message: `Fehler beim DeepSeek Ping: ${errorMsg}`,
      apiKeySource: settings.apiKeySource,
      latencyMs
    };
  }
}
