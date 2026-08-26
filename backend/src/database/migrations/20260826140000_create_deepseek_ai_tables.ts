import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. ai_settings: configuration for DeepSeek and autonomous moderator
  const hasSettings = await knex.schema.hasTable('ai_settings');
  if (!hasSettings) {
    await knex.schema.createTable('ai_settings', (table) => {
      table.string('id', 64).primary().defaultTo('global');
      table.text('deepseek_api_key').nullable();
      table.string('selected_model', 64).defaultTo('deepseek-chat');
      table.text('available_models').nullable(); // JSON list of available models
      table.boolean('is_enabled').defaultTo(true);
      table.boolean('auto_post_channel').defaultTo(true);
      table.string('telegram_channel_id', 128).nullable();
      table.text('storyline_theme').nullable();
      table.integer('interval_hours').defaultTo(12);
      table.timestamp('last_run_at').nullable();
      table.timestamp('next_run_at').nullable();
      table.timestamps(true, true);
    });

    // Seed default settings row
    await knex('ai_settings').insert({
      id: 'global',
      selected_model: 'deepseek-chat',
      is_enabled: true,
      auto_post_channel: true,
      interval_hours: 12,
      storyline_theme: 'Cyberpunk Neon Metropolis: Tech innovations, cyber market rallies, secret hackathons, and arcade gaming tournaments.',
      available_models: JSON.stringify([
        { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', status: 'active' },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', status: 'active' }
      ]),
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  // 2. ai_market_news: In-game news scheduled & published by DeepSeek with real price impacts
  const hasNews = await knex.schema.hasTable('ai_market_news');
  if (!hasNews) {
    await knex.schema.createTable('ai_market_news', (table) => {
      table.increments('id').primary();
      table.string('title', 255).notNullable();
      table.text('summary').notNullable();
      table.text('content').nullable();
      table.string('coin_symbol', 32).notNullable().index();
      table.string('sentiment', 16).notNullable(); // 'bullish', 'bearish', 'neutral'
      table.decimal('price_impact_percent', 10, 4).notNullable().defaultTo(0); // e.g. +3.5 or -2.8
      table.integer('impact_duration_minutes').defaultTo(60);
      table.boolean('is_published').defaultTo(false).index();
      table.string('story_arc', 128).nullable();
      table.timestamp('scheduled_at').notNullable().index();
      table.timestamp('published_at').nullable();
      table.timestamps(true, true);
    });
  }

  // 3. ai_channel_posts: Telegram Community Channel posts with reward claim buttons
  const hasPosts = await knex.schema.hasTable('ai_channel_posts');
  if (!hasPosts) {
    await knex.schema.createTable('ai_channel_posts', (table) => {
      table.increments('id').primary();
      table.text('post_text').notNullable();
      table.string('story_arc', 128).nullable();
      table.string('reward_type', 32).defaultTo('NONE'); // 'COIN', 'ENERGY', 'NONE'
      table.string('reward_coin_symbol', 32).nullable();
      table.decimal('reward_amount', 20, 4).defaultTo(0);
      table.string('reward_claim_code', 64).unique().nullable().index();
      table.integer('reward_max_claims').defaultTo(100);
      table.integer('reward_claimed_count').defaultTo(0);
      table.timestamp('reward_expires_at').nullable();
      table.text('community_goal').nullable();
      table.string('telegram_message_id', 64).nullable();
      table.string('status', 32).defaultTo('SCHEDULED').index(); // 'SCHEDULED', 'POSTED', 'EXPIRED', 'FAILED'
      table.timestamp('scheduled_at').notNullable().index();
      table.timestamp('posted_at').nullable();
      table.timestamps(true, true);
    });
  }

  // 4. ai_reward_claims: strict 1-claim-per-player tracking
  const hasClaims = await knex.schema.hasTable('ai_reward_claims');
  if (!hasClaims) {
    await knex.schema.createTable('ai_reward_claims', (table) => {
      table.increments('id').primary();
      table.string('claim_code', 64).notNullable().index();
      table.string('user_id', 255).notNullable().index();
      table.string('telegram_id', 255).nullable();
      table.string('reward_type', 32).notNullable();
      table.string('reward_coin_symbol', 32).nullable();
      table.decimal('reward_amount', 20, 4).notNullable();
      table.timestamp('claimed_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['claim_code', 'user_id']); // Enforce strictly 1 claim per user per reward code
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_reward_claims');
  await knex.schema.dropTableIfExists('ai_channel_posts');
  await knex.schema.dropTableIfExists('ai_market_news');
  await knex.schema.dropTableIfExists('ai_settings');
}
