import { Knex } from 'knex';

/**
 * Database Auto-Migration & Self-Healing Synchronizer
 * Automatically runs pending migrations and verifies all tables and columns on startup/deploy.
 * If any missing SQL columns or tables are detected, they are created dynamically on the fly.
 */
export async function runAutoMigrations(knex: Knex): Promise<void> {
  console.log('[DATABASE AUTO-SYNC]: Checking and applying database migrations...');

  try {
    // 1. Run standard Knex migrations
    await knex.migrate.latest();
    console.log('[DATABASE AUTO-SYNC]: Standard migrations up to date.');
  } catch (err: any) {
    console.warn('[DATABASE AUTO-SYNC WARNING]: knex.migrate.latest encountered an issue, running self-healing check:', err.message);
  }

  // 2. Self-healing check for tables & columns
  try {
    // Ensure 'users' columns
    const hasUsersTable = await knex.schema.hasTable('users');
    if (hasUsersTable) {
      await ensureColumn(knex, 'users', 'display_name', (t) => t.string('display_name').nullable());
      await ensureColumn(knex, 'users', 'display_name_changed', (t) => t.boolean('display_name_changed').defaultTo(false));
      await ensureColumn(knex, 'users', 'wallet_ltc', (t) => t.string('wallet_ltc').nullable());
      await ensureColumn(knex, 'users', 'wallet_btc', (t) => t.string('wallet_btc').nullable());
      await ensureColumn(knex, 'users', 'deletion_scheduled_at', (t) => t.timestamp('deletion_scheduled_at').nullable());
      await ensureColumn(knex, 'users', 'daily_ad_count', (t) => t.integer('daily_ad_count').defaultTo(0));
      await ensureColumn(knex, 'users', 'last_ad_date', (t) => t.string('last_ad_date').nullable());
      await ensureColumn(knex, 'users', 'last_ad_watch_at', (t) => t.timestamp('last_ad_watch_at').nullable());
      await ensureColumn(knex, 'users', 'time_booster_until', (t) => t.timestamp('time_booster_until').nullable());
      await ensureColumn(knex, 'users', 'season_pass_type', (t) => t.string('season_pass_type').defaultTo('NONE'));
      await ensureColumn(knex, 'users', 'last_daily_free_refill_date', (t) => t.string('last_daily_free_refill_date').nullable());
    }

    // Ensure 'seasons' table & columns
    const hasSeasonsTable = await knex.schema.hasTable('seasons');
    if (hasSeasonsTable) {
      await ensureColumn(knex, 'seasons', 'season_number', (t) => t.integer('season_number').defaultTo(0));
      await ensureColumn(knex, 'seasons', 'status', (t) => t.string('status').defaultTo('preparing'));
      await ensureColumn(knex, 'seasons', 'target_amount', (t) => t.decimal('target_amount', 12, 2).defaultTo(1000.00));
      await ensureColumn(knex, 'seasons', 'current_pot', (t) => t.decimal('current_pot', 12, 2).defaultTo(0.00));
      await ensureColumn(knex, 'seasons', 'revenue_share_percent', (t) => t.decimal('revenue_share_percent', 5, 2).defaultTo(30.00));
      await ensureColumn(knex, 'seasons', 'duration_days', (t) => t.integer('duration_days').defaultTo(30));
      await ensureColumn(knex, 'seasons', 'top10_share_percent', (t) => t.decimal('top10_share_percent', 5, 2).defaultTo(60.00));
      await ensureColumn(knex, 'seasons', 'active20_share_percent', (t) => t.decimal('active20_share_percent', 5, 2).defaultTo(20.00));
      await ensureColumn(knex, 'seasons', 'random_share_percent', (t) => t.decimal('random_share_percent', 5, 2).defaultTo(20.00));
      await ensureColumn(knex, 'seasons', 'started_at', (t) => t.timestamp('started_at').nullable());
      await ensureColumn(knex, 'seasons', 'settled_at', (t) => t.timestamp('settled_at').nullable());
    }

    // Ensure 'season_user_stats' table
    const hasSeasonStatsTable = await knex.schema.hasTable('season_user_stats');
    if (!hasSeasonStatsTable) {
      await knex.schema.createTable('season_user_stats', (table) => {
        table.increments('id').primary();
        table.integer('season_id').notNullable();
        table.string('user_id').notNullable();
        table.decimal('net_profit', 14, 2).defaultTo(0.00);
        table.integer('total_rounds').defaultTo(0);
        table.timestamps(true, true);
        table.unique(['season_id', 'user_id']);
      });
    }

    // Ensure 'airdrop_payouts' table
    const hasAirdropTable = await knex.schema.hasTable('airdrop_payouts');
    if (!hasAirdropTable) {
      await knex.schema.createTable('airdrop_payouts', (table) => {
        table.increments('id').primary();
        table.integer('season_id').notNullable();
        table.string('user_id').notNullable();
        table.string('category').notNullable();
        table.integer('rank').nullable();
        table.decimal('amount_eur', 12, 2).notNullable();
        table.decimal('amount_crypto', 18, 8).nullable();
        table.string('coin').defaultTo('LTC');
        table.string('wallet_address').nullable();
        table.string('status').defaultTo('pending');
        table.string('tx_hash').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('paid_at').nullable();
      });
    } else {
      await ensureColumn(knex, 'airdrop_payouts', 'amount_crypto', (t) => t.decimal('amount_crypto', 18, 8).nullable());
      await ensureColumn(knex, 'airdrop_payouts', 'coin', (t) => t.string('coin').defaultTo('LTC'));
      await ensureColumn(knex, 'airdrop_payouts', 'wallet_address', (t) => t.string('wallet_address').nullable());
      await ensureColumn(knex, 'airdrop_payouts', 'status', (t) => t.string('status').defaultTo('pending'));
      await ensureColumn(knex, 'airdrop_payouts', 'tx_hash', (t) => t.string('tx_hash').nullable());
      await ensureColumn(knex, 'airdrop_payouts', 'created_at', (t) => t.timestamp('created_at').nullable());
    }

    // Ensure 'referrals' table
    const hasReferralsTable = await knex.schema.hasTable('referrals');
    if (!hasReferralsTable) {
      await knex.schema.createTable('referrals', (table) => {
        table.increments('id').primary();
        table.string('referrer_id').notNullable();
        table.string('referred_id').notNullable();
        table.timestamps(true, true);
      });
    }

    // Ensure 'scores' table
    const hasScoresTable = await knex.schema.hasTable('scores');
    if (!hasScoresTable) {
      await knex.schema.createTable('scores', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('game_id').notNullable();
        table.integer('score').notNullable();
        table.text('validation_payload').nullable();
        table.timestamps(true, true);
      });
    }

    // Ensure 'shop_orders' table
    const hasShopOrdersTable = await knex.schema.hasTable('shop_orders');
    if (!hasShopOrdersTable) {
      await knex.schema.createTable('shop_orders', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('product_id').notNullable();
        table.decimal('amount_eur', 12, 2).notNullable();
        table.decimal('amount_crypto', 18, 8).nullable();
        table.string('coin').nullable();
        table.string('status').defaultTo('pending');
        table.timestamp('paid_at').nullable();
        table.timestamp('expires_at').nullable();
        table.timestamps(true, true);
      });
    }

    // Ensure 'wallet_address_pool' table
    const hasWalletPoolTable = await knex.schema.hasTable('wallet_address_pool');
    if (!hasWalletPoolTable) {
      await knex.schema.createTable('wallet_address_pool', (table) => {
        table.increments('id').primary();
        table.string('coin').notNullable();
        table.string('address').notNullable().unique();
        table.boolean('is_used').defaultTo(false);
        table.timestamps(true, true);
      });
    }

    // Ensure 'game_cash' column on users
    if (hasUsersTable) {
      await ensureColumn(knex, 'users', 'game_cash', (t) => t.float('game_cash').defaultTo(0.0));
    }

    // Ensure 'market_coins' table
    const hasMarketCoins = await knex.schema.hasTable('market_coins');
    if (!hasMarketCoins) {
      await knex.schema.createTable('market_coins', (table) => {
        table.string('symbol').primary();
        table.string('name').notNullable();
        table.string('game_id').notNullable().unique();
        table.float('current_price').notNullable();
        table.float('base_price').notNullable();
        table.float('circulating_supply').notNullable();
        table.float('total_burned').defaultTo(0.0).notNullable();
        table.float('volume_24h').defaultTo(0.0).notNullable();
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });

      // Seed default coins
      await knex('market_coins').insert([
        { symbol: 'DOODLE', name: 'Doodle Jump Coin', game_id: 'doodlejump', current_price: 0.00000001, base_price: 0.00000001, circulating_supply: 1000000000.0, total_burned: 0.0, volume_24h: 0.0 },
        { symbol: 'FLAPPY', name: 'Neon Flappy Coin', game_id: 'neonbird', current_price: 0.00000001, base_price: 0.00000001, circulating_supply: 1000000000.0, total_burned: 0.0, volume_24h: 0.0 },
      ]);
    }

    // Ensure 'user_portfolios' table
    const hasUserPortfolios = await knex.schema.hasTable('user_portfolios');
    if (!hasUserPortfolios) {
      await knex.schema.createTable('user_portfolios', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('coin_symbol').notNullable();
        table.float('amount').defaultTo(0.0).notNullable();
        table.float('avg_buy_price').defaultTo(0.0).notNullable();
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.unique(['user_id', 'coin_symbol']);
      });
    }

    // Ensure 'user_trades' table
    const hasUserTrades = await knex.schema.hasTable('user_trades');
    if (!hasUserTrades) {
      await knex.schema.createTable('user_trades', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('coin_symbol').notNullable();
        table.string('trade_type').notNullable();
        table.float('amount_tokens').notNullable();
        table.float('price_per_token').notNullable();
        table.float('total_cash').notNullable();
        table.float('gas_fee').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.index(['user_id']);
        table.index(['coin_symbol']);
      });
    }

    // Ensure 'market_price_history' table
    const hasPriceHistory = await knex.schema.hasTable('market_price_history');
    if (!hasPriceHistory) {
      await knex.schema.createTable('market_price_history', (table) => {
        table.increments('id').primary();
        table.string('coin_symbol').notNullable();
        table.float('price').notNullable();
        table.float('volume').defaultTo(0.0).notNullable();
        table.timestamp('timestamp').defaultTo(knex.fn.now());
        table.index(['coin_symbol', 'timestamp']);
      });
    }

    // Ensure 'market_events' table
    const hasMarketEventsTable = await knex.schema.hasTable('market_events');
    if (!hasMarketEventsTable) {
      await knex.schema.createTable('market_events', (table) => {
        table.increments('id').primary();
        table.string('coin_symbol').notNullable();
        table.string('event_type').notNullable();
        table.string('title').notNullable();
        table.string('description').notNullable();
        table.float('price_impact_percent').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
    }

    // 3. Ensure Season 0 default record exists & update old names to 'Season 0'
    await knex('seasons')
      .where('season_number', 0)
      .orWhere('name', 'like', '%2026 S%')
      .update({
        name: 'Season 0',
        season_number: 0,
        target_amount: 1000.00
      });

    const activeSeason = await knex('seasons').where('is_active', true).first();
    if (!activeSeason) {
      const now = new Date();
      const seasonEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      await knex('seasons').insert({
        season_number: 0,
        name: 'Season 0',
        status: 'preparing',
        target_amount: 1000.00,
        current_pot: 0.00,
        revenue_share_percent: 30.00,
        duration_days: 30,
        top10_share_percent: 60.00,
        active20_share_percent: 20.00,
        random_share_percent: 20.00,
        start_date: now.toISOString(),
        end_date: seasonEnd.toISOString(),
        initial_pot_amount: 0.00,
        is_active: true
      });
      console.log('[DATABASE AUTO-SYNC]: Seeded initial Season 0 record.');
    }

    console.log('[DATABASE AUTO-SYNC]: All database tables, columns, and SQL structures are fully verified and up to date.');
  } catch (syncErr: any) {
    console.error('[DATABASE AUTO-SYNC ERROR]: Failed self-healing database check:', syncErr.message);
  }
}

async function ensureColumn(
  knex: Knex,
  tableName: string,
  columnName: string,
  builder: (table: Knex.CreateTableBuilder) => void
): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(tableName, columnName);
  if (!hasColumn) {
    await knex.schema.alterTable(tableName, (table) => {
      builder(table);
    });
    console.log(`[DATABASE AUTO-SYNC]: Added missing column '${columnName}' to table '${tableName}'.`);
  }
}
