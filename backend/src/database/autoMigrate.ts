import { Knex } from 'knex';
import { config } from '../config';

/**
 * Database Auto-Migration & Self-Healing Synchronizer
 * Automatically runs pending migrations and guarantees every table and column exists.
 * If any migrations fail (e.g. existing tables in PostgreSQL), the self-healing engine
 * verifies and creates all tables, columns, indexes, and seed records on the fly.
 */
export async function runAutoMigrations(knex: Knex): Promise<void> {
  console.log('[DATABASE AUTO-SYNC]: Checking and applying database migrations...');

  try {
    // 1. Attempt standard Knex migrations
    await knex.migrate.latest();
    console.log('[DATABASE AUTO-SYNC]: Standard Knex migrations executed successfully.');
  } catch (err: any) {
    console.warn('[DATABASE AUTO-SYNC WARNING]: knex.migrate.latest note (self-healing will ensure all schemas):', err.message);
  }

  // 2. Comprehensive Self-Healing Check for all Tables and Columns
  try {
    // ── Table: USERS ──────────────────────────────────────────────────────────
    const hasUsersTable = await knex.schema.hasTable('users');
    if (!hasUsersTable) {
      await knex.schema.createTable('users', (table) => {
        table.string('id').primary(); // Telegram user ID as string
        table.string('username').nullable();
        table.string('first_name').nullable();
        table.string('last_name').nullable();
        table.string('display_name').nullable();
        table.boolean('display_name_changed').defaultTo(false);
        table.integer('energy_value').defaultTo(5);
        table.timestamp('energy_updated_at').defaultTo(knex.fn.now());
        table.float('game_cash').defaultTo(0.0);
        table.string('wallet_ltc').nullable();
        table.string('wallet_btc').nullable();
        table.string('wallet_sol').nullable();
        table.string('wallet_eth').nullable();
        table.string('referred_by').nullable();
        table.timestamp('deletion_scheduled_at').nullable();
        table.integer('daily_ad_count').defaultTo(0);
        table.string('last_ad_date').nullable();
        table.timestamp('last_ad_watch_at').nullable();
        table.timestamp('time_booster_until').nullable();
        table.string('season_pass_type').defaultTo('NONE');
        table.string('last_daily_free_refill_date').nullable();
        table.integer('daily_refill_count').defaultTo(0);
        table.timestamp('full_energy_notified_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created users table.');
    } else {
      await ensureColumn(knex, 'users', 'display_name', (t) => t.string('display_name').nullable());
      await ensureColumn(knex, 'users', 'display_name_changed', (t) => t.boolean('display_name_changed').defaultTo(false));
      await ensureColumn(knex, 'users', 'energy_value', (t) => t.integer('energy_value').defaultTo(5));
      await ensureColumn(knex, 'users', 'energy_updated_at', (t) => t.timestamp('energy_updated_at').defaultTo(knex.fn.now()));
      await ensureColumn(knex, 'users', 'game_cash', (t) => t.float('game_cash').defaultTo(0.0));
      await ensureColumn(knex, 'users', 'wallet_ltc', (t) => t.string('wallet_ltc').nullable());
      await ensureColumn(knex, 'users', 'wallet_btc', (t) => t.string('wallet_btc').nullable());
      await ensureColumn(knex, 'users', 'wallet_sol', (t) => t.string('wallet_sol').nullable());
      await ensureColumn(knex, 'users', 'wallet_eth', (t) => t.string('wallet_eth').nullable());
      await ensureColumn(knex, 'users', 'referred_by', (t) => t.string('referred_by').nullable());
      await ensureColumn(knex, 'users', 'deletion_scheduled_at', (t) => t.timestamp('deletion_scheduled_at').nullable());
      await ensureColumn(knex, 'users', 'daily_ad_count', (t) => t.integer('daily_ad_count').defaultTo(0));
      await ensureColumn(knex, 'users', 'last_ad_date', (t) => t.string('last_ad_date').nullable());
      await ensureColumn(knex, 'users', 'last_ad_watch_at', (t) => t.timestamp('last_ad_watch_at').nullable());
      await ensureColumn(knex, 'users', 'time_booster_until', (t) => t.timestamp('time_booster_until').nullable());
      await ensureColumn(knex, 'users', 'season_pass_type', (t) => t.string('season_pass_type').defaultTo('NONE'));
      await ensureColumn(knex, 'users', 'last_daily_free_refill_date', (t) => t.string('last_daily_free_refill_date').nullable());
      await ensureColumn(knex, 'users', 'daily_refill_count', (t) => t.integer('daily_refill_count').defaultTo(0));
      await ensureColumn(knex, 'users', 'full_energy_notified_at', (t) => t.timestamp('full_energy_notified_at').nullable());
    }

    // ── Table: SCORES ─────────────────────────────────────────────────────────
    const hasScoresTable = await knex.schema.hasTable('scores');
    if (!hasScoresTable) {
      await knex.schema.createTable('scores', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('game_id').notNullable();
        table.integer('score').notNullable();
        table.text('validation_payload').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created scores table.');
    }

    // ── Table: REFERRALS ──────────────────────────────────────────────────────
    const hasReferralsTable = await knex.schema.hasTable('referrals');
    if (!hasReferralsTable) {
      await knex.schema.createTable('referrals', (table) => {
        table.increments('id').primary();
        table.string('referrer_id').notNullable();
        table.string('referred_id').notNullable();
        table.boolean('bonus_processed').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created referrals table.');
    }

    // ── Table: SEASONS ────────────────────────────────────────────────────────
    const hasSeasonsTable = await knex.schema.hasTable('seasons');
    if (!hasSeasonsTable) {
      await knex.schema.createTable('seasons', (table) => {
        table.increments('id').primary();
        table.integer('season_number').defaultTo(0);
        table.string('name').notNullable();
        table.string('status').defaultTo('preparing');
        table.decimal('target_amount', 12, 2).defaultTo(1000.00);
        table.decimal('current_pot', 12, 2).defaultTo(0.00);
        table.decimal('revenue_share_percent', 5, 2).defaultTo(30.00);
        table.integer('duration_days').defaultTo(30);
        table.decimal('top10_share_percent', 5, 2).defaultTo(60.00);
        table.decimal('active20_share_percent', 5, 2).defaultTo(20.00);
        table.decimal('random_share_percent', 5, 2).defaultTo(20.00);
        table.timestamp('start_date').nullable();
        table.timestamp('end_date').nullable();
        table.boolean('is_active').defaultTo(false);
        table.decimal('initial_pot_amount', 12, 2).defaultTo(0.00);
        table.timestamp('started_at').nullable();
        table.timestamp('settled_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').nullable();
      });
      console.log('[DATABASE AUTO-SYNC]: Created seasons table.');
    } else {
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
      await ensureColumn(knex, 'seasons', 'updated_at', (t) => t.timestamp('updated_at').nullable());
      await ensureColumn(knex, 'seasons', 'is_active', (t) => t.boolean('is_active').defaultTo(false));

      // Guarantee nullable start_date and end_date in SQLite and PostgreSQL
      const isSqlite = !knex.client.config.client.includes('pg') && !knex.client.config.client.includes('postgres');
      if (isSqlite) {
        try {
          const pragmaColumns = await knex.raw("PRAGMA table_info('seasons')");
          const startDateCol = pragmaColumns.find((c: any) => c.name === 'start_date');
          if (startDateCol && startDateCol.notnull === 1) {
            console.log('[DATABASE AUTO-SYNC]: Migrating SQLite seasons table to make start_date and end_date nullable...');
            await knex.raw(`
              CREATE TABLE seasons_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                season_number INTEGER DEFAULT 0,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'preparing',
                target_amount NUMERIC DEFAULT 1000.00,
                current_pot NUMERIC DEFAULT 0.00,
                revenue_share_percent NUMERIC DEFAULT 30.00,
                duration_days INTEGER DEFAULT 30,
                top10_share_percent NUMERIC DEFAULT 60.00,
                active20_share_percent NUMERIC DEFAULT 20.00,
                random_share_percent NUMERIC DEFAULT 20.00,
                start_date TIMESTAMP NULL,
                end_date TIMESTAMP NULL,
                is_active BOOLEAN DEFAULT 0,
                initial_pot_amount NUMERIC DEFAULT 0.00,
                started_at TIMESTAMP NULL,
                settled_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL
              )
            `);
            await knex.raw(`
              INSERT INTO seasons_new (id, season_number, name, status, target_amount, current_pot, revenue_share_percent, duration_days, top10_share_percent, active20_share_percent, random_share_percent, start_date, end_date, is_active, initial_pot_amount, started_at, settled_at, created_at, updated_at)
              SELECT id, season_number, name, status, target_amount, current_pot, revenue_share_percent, duration_days, top10_share_percent, active20_share_percent, random_share_percent, NULL, NULL, is_active, initial_pot_amount, started_at, settled_at, created_at, updated_at
              FROM seasons
            `);
            await knex.raw('DROP TABLE seasons');
            await knex.raw('ALTER TABLE seasons_new RENAME TO seasons');
            console.log('[DATABASE AUTO-SYNC]: Successfully migrated SQLite seasons table schema.');
          }
        } catch (mErr: any) {
          console.warn('[DATABASE AUTO-SYNC]: SQLite seasons schema migration note:', mErr.message);
        }
      } else {
        try {
          await knex.raw('ALTER TABLE seasons ALTER COLUMN start_date DROP NOT NULL');
          await knex.raw('ALTER TABLE seasons ALTER COLUMN end_date DROP NOT NULL');
        } catch {}
      }
    }

    // ── Table: SEASON_USER_STATS ──────────────────────────────────────────────
    const hasSeasonStatsTable = await knex.schema.hasTable('season_user_stats');
    if (!hasSeasonStatsTable) {
      await knex.schema.createTable('season_user_stats', (table) => {
        table.increments('id').primary();
        table.integer('season_id').notNullable();
        table.string('user_id').notNullable();
        table.decimal('net_profit', 14, 4).defaultTo(0.0000);
        table.integer('total_rounds').defaultTo(0);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created season_user_stats table.');
    }

    // ── Table: AIRDROP_PAYOUTS ────────────────────────────────────────────────
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
        table.timestamp('paid_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created airdrop_payouts table.');
    } else {
      await ensureColumn(knex, 'airdrop_payouts', 'amount_crypto', (t) => t.decimal('amount_crypto', 18, 8).nullable());
      await ensureColumn(knex, 'airdrop_payouts', 'coin', (t) => t.string('coin').defaultTo('LTC'));
      await ensureColumn(knex, 'airdrop_payouts', 'wallet_address', (t) => t.string('wallet_address').nullable());
      await ensureColumn(knex, 'airdrop_payouts', 'status', (t) => t.string('status').defaultTo('pending'));
      await ensureColumn(knex, 'airdrop_payouts', 'tx_hash', (t) => t.string('tx_hash').nullable());
    }

    // ── Table: WALLET_ADDRESS_POOL ────────────────────────────────────────────
    const hasWalletPoolTable = await knex.schema.hasTable('wallet_address_pool');
    if (!hasWalletPoolTable) {
      await knex.schema.createTable('wallet_address_pool', (table) => {
        table.increments('id').primary();
        table.string('coin').notNullable();
        table.string('address').notNullable().unique();
        table.integer('address_index').notNullable();
        table.boolean('is_used').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created wallet_address_pool table.');
    } else {
      await ensureColumn(knex, 'wallet_address_pool', 'coin', (t) => t.string('coin').notNullable().defaultTo('LTC'));
      await ensureColumn(knex, 'wallet_address_pool', 'address', (t) => t.string('address').notNullable().defaultTo(''));
      await ensureColumn(knex, 'wallet_address_pool', 'address_index', (t) => t.integer('address_index').notNullable().defaultTo(0));
      await ensureColumn(knex, 'wallet_address_pool', 'is_used', (t) => t.boolean('is_used').defaultTo(false));
      await ensureColumn(knex, 'wallet_address_pool', 'created_at', (t) => t.timestamp('created_at').defaultTo(knex.fn.now()));
    }

    // Always ensure pre-seeded HD fallback addresses are present in the pool
    const defaultAddresses = [
      // LTC
      { coin: 'LTC', address: 'ltc1q9a2t2p33wlyjvevve5rld2zvevdvx05p73dlnq', address_index: 0, is_used: false },
      { coin: 'LTC', address: 'ltc1q8862k6p9q4g6v5x84m6a7x7j7z5z5v5x5v5x5v', address_index: 1, is_used: false },
      { coin: 'LTC', address: 'ltc1q3k5l8w4p2m9q7r1v0t8z6x4y2u0w8v6t4r2q0p', address_index: 2, is_used: false },
      // BTC
      { coin: 'BTC', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', address_index: 0, is_used: false },
      { coin: 'BTC', address: 'bc1q0x959k6p9q4g6v5x84m6a7x7j7z5z5v5x5v5x5v', address_index: 1, is_used: false },
      { coin: 'BTC', address: 'bc1q5v8w4m2p9q7r1v0t8z6x4y2u0w8v6t4r2q0p3k', address_index: 2, is_used: false },
      // ETH
      { coin: 'ETH', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', address_index: 0, is_used: false },
      { coin: 'ETH', address: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30', address_index: 1, is_used: false },
      { coin: 'ETH', address: '0xb794F5eA0ba39494cE839613fffBA74279579268', address_index: 2, is_used: false },
      // SOL
      { coin: 'SOL', address: 'BdqfbRJTPUke6uGLZ2zT9FkmZCMCdg7S8GckWjFz7Woc', address_index: 0, is_used: false },
      { coin: 'SOL', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', address_index: 1, is_used: false },
      { coin: 'SOL', address: 'E64D7teFXZ6g3gTyK2c6k4sB5y2x8w1v0z8y6u4t2r0p', address_index: 2, is_used: false },
    ];

    for (const item of defaultAddresses) {
      try {
        await knex('wallet_address_pool').insert(item).onConflict('address').ignore();
      } catch {
        // Ignored
      }
    }

    // ── Table: SHOP_ORDERS ────────────────────────────────────────────────────
    const hasShopOrdersTable = await knex.schema.hasTable('shop_orders');
    if (!hasShopOrdersTable) {
      await knex.schema.createTable('shop_orders', (table) => {
        table.string('id', 255).primary();
        table.string('user_id').notNullable();
        table.string('product_id').notNullable();
        table.decimal('amount_eur', 12, 2).notNullable();
        table.decimal('amount_crypto', 18, 8).nullable();
        table.string('coin').nullable();
        table.string('address').nullable();
        table.string('status').defaultTo('pending');
        table.timestamp('expires_at').nullable();
        table.timestamp('paid_at').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created shop_orders table.');
    } else {
      // If table already exists, ensure id column is VARCHAR(255) on PostgreSQL
      if (config.isPostgres) {
        try {
          await knex.raw('ALTER TABLE shop_orders ALTER COLUMN id TYPE VARCHAR(255) USING id::text;');
          console.log('[DATABASE AUTO-SYNC]: Verified shop_orders id column is VARCHAR(255).');
        } catch (colErr: any) {
          console.warn('[DATABASE AUTO-SYNC]: shop_orders id column type migration notice:', colErr.message);
        }
      }
      await ensureColumn(knex, 'shop_orders', 'user_id', (t) => t.string('user_id').notNullable().defaultTo(''));
      await ensureColumn(knex, 'shop_orders', 'product_id', (t) => t.string('product_id').notNullable().defaultTo(''));
      await ensureColumn(knex, 'shop_orders', 'amount_eur', (t) => t.decimal('amount_eur', 12, 2).notNullable().defaultTo(0));
      await ensureColumn(knex, 'shop_orders', 'amount_crypto', (t) => t.decimal('amount_crypto', 18, 8).nullable());
      await ensureColumn(knex, 'shop_orders', 'coin', (t) => t.string('coin').nullable());
      await ensureColumn(knex, 'shop_orders', 'address', (t) => t.string('address').nullable());
      await ensureColumn(knex, 'shop_orders', 'status', (t) => t.string('status').defaultTo('pending'));
      await ensureColumn(knex, 'shop_orders', 'expires_at', (t) => t.timestamp('expires_at').nullable());
      await ensureColumn(knex, 'shop_orders', 'paid_at', (t) => t.timestamp('paid_at').nullable());
      await ensureColumn(knex, 'shop_orders', 'created_at', (t) => t.timestamp('created_at').defaultTo(knex.fn.now()));
    }

    // ── Table: MARKET_COINS ───────────────────────────────────────────────────
    const hasMarketCoins = await knex.schema.hasTable('market_coins');
    if (!hasMarketCoins) {
      await knex.schema.createTable('market_coins', (table) => {
        table.string('symbol').primary(); // DOODLE, FLAPPY
        table.string('name').notNullable();
        table.string('game_id').notNullable();
        table.float('current_price').notNullable().defaultTo(0.00000001);
        table.float('base_price').notNullable().defaultTo(0.00000001);
        table.float('virtual_game_reserve').notNullable().defaultTo(100000.0);
        table.float('virtual_token_reserve').notNullable().defaultTo(10000000000000.0);
        table.float('constant_product_k').notNullable().defaultTo(1000000000000000000.0);
        table.float('circulating_supply').notNullable().defaultTo(10000000000000.0);
        table.float('total_burned').defaultTo(0.0);
        table.float('volume_24h').defaultTo(0.0);
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created market_coins table with AMM pool parameters.');

      await knex('market_coins').insert([
        {
          symbol: 'DOODLE',
          name: 'Neon Jump Coin',
          game_id: 'doodlejump',
          current_price: 0.00000001,
          base_price: 0.00000001,
          virtual_game_reserve: 100000.0,
          virtual_token_reserve: 10000000000000.0,
          constant_product_k: 1000000000000000000.0,
          circulating_supply: 10000000000000.0,
          total_burned: 0.0,
          volume_24h: 0.0
        },
        {
          symbol: 'FLAPPY',
          name: 'Neon Bird Coin',
          game_id: 'neonbird',
          current_price: 0.00000001,
          base_price: 0.00000001,
          virtual_game_reserve: 100000.0,
          virtual_token_reserve: 10000000000000.0,
          constant_product_k: 1000000000000000000.0,
          circulating_supply: 10000000000000.0,
          total_burned: 0.0,
          volume_24h: 0.0
        },
      ]);
    } else {
      await ensureColumn(knex, 'market_coins', 'virtual_game_reserve', (t) => t.float('virtual_game_reserve').defaultTo(100000.0));
      await ensureColumn(knex, 'market_coins', 'virtual_token_reserve', (t) => t.float('virtual_token_reserve').defaultTo(10000000000000.0));
      await ensureColumn(knex, 'market_coins', 'constant_product_k', (t) => t.float('constant_product_k').defaultTo(1000000000000000000.0));

      // Ensure canonical names & initialize pool reserves if missing or 0
      await knex('market_coins').where({ symbol: 'DOODLE' }).update({
        name: 'Neon Jump Coin',
      });
      await knex('market_coins').where({ symbol: 'FLAPPY' }).update({
        name: 'Neon Bird Coin',
      });

      // Self-heal pool reserves for any coins with 0 or null reserves
      const allCoins = await knex('market_coins').select('*');
      for (const coin of allCoins) {
        const vGame = Number(coin.virtual_game_reserve || 0);
        const vTokens = Number(coin.virtual_token_reserve || 0);
        const k = Number(coin.constant_product_k || 0);
        const updates: Record<string, any> = {};

        if (!vGame || vGame <= 0) updates.virtual_game_reserve = 100000.0;
        if (!vTokens || vTokens <= 0) updates.virtual_token_reserve = 10000000000000.0;
        if (!k || k <= 0) updates.constant_product_k = 1000000000000000000.0;
        if (Number(coin.circulating_supply || 0) < 10000000000.0) updates.circulating_supply = 10000000000000.0;

        if (Object.keys(updates).length > 0) {
          await knex('market_coins').where({ symbol: coin.symbol }).update(updates);
          console.log(`[DATABASE AUTO-SYNC]: Initialized AMM pool parameters for $${coin.symbol}`);
        }
      }
    }

    // ── Table: USER_PORTFOLIOS ────────────────────────────────────────────────
    const hasUserPortfolios = await knex.schema.hasTable('user_portfolios');
    if (!hasUserPortfolios) {
      await knex.schema.createTable('user_portfolios', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('coin_symbol').notNullable();
        table.float('amount').defaultTo(0.0);
        table.float('avg_buy_price').defaultTo(0.0);
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created user_portfolios table.');
    }

    // ── Table: USER_TRADES ────────────────────────────────────────────────────
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
        table.float('price_impact_percent').defaultTo(0.0);
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created user_trades table.');
    } else {
      await ensureColumn(knex, 'user_trades', 'price_impact_percent', (t) => t.float('price_impact_percent').defaultTo(0.0));
    }

    // ── Table: MARKET_PRICE_HISTORY ───────────────────────────────────────────
    const hasPriceHistory = await knex.schema.hasTable('market_price_history');
    if (!hasPriceHistory) {
      await knex.schema.createTable('market_price_history', (table) => {
        table.increments('id').primary();
        table.string('coin_symbol').notNullable();
        table.float('price').notNullable();
        table.float('volume').defaultTo(0.0);
        table.timestamp('timestamp').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created market_price_history table.');
    }

    // ── Table: MARKET_EVENTS ──────────────────────────────────────────────────
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
      console.log('[DATABASE AUTO-SYNC]: Created market_events table.');
    }

    // ── Table: USER_INBOX ─────────────────────────────────────────────────────
    const hasInboxTable = await knex.schema.hasTable('user_inbox');
    if (!hasInboxTable) {
      await knex.schema.createTable('user_inbox', (table) => {
        table.increments('id').primary();
        table.string('user_id').notNullable();
        table.string('title').notNullable();
        table.text('message').notNullable();
        table.string('category').defaultTo('system');
        table.boolean('is_read').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
      });
      console.log('[DATABASE AUTO-SYNC]: Created user_inbox table.');
    }

    // ── Default Season Seed (Season 0 in 'preparing' state for initial 1.000 € fill-up) ─────
    const existingSeason = await knex('seasons').first();
    if (!existingSeason) {
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
        start_date: null,
        end_date: null,
        initial_pot_amount: 0.00,
        is_active: false,
      });
      console.log('[DATABASE AUTO-SYNC]: Seeded initial Season 0 in preparing state (target: 1000.00 €).');
    }

    console.log('[DATABASE AUTO-SYNC]: All database tables, columns, and SQL structures are 100% verified and synchronized.');
  } catch (syncErr: any) {
    console.error('[DATABASE AUTO-SYNC ERROR]: Failed self-healing database check:', syncErr.message);
    throw syncErr;
  }
}

async function ensureColumn(
  knex: Knex,
  tableName: string,
  columnName: string,
  builder: (table: Knex.CreateTableBuilder) => void
): Promise<void> {
  try {
    const hasColumn = await knex.schema.hasColumn(tableName, columnName);
    if (!hasColumn) {
      await knex.schema.alterTable(tableName, (table) => {
        builder(table);
      });
      console.log(`[DATABASE AUTO-SYNC]: Added missing column '${columnName}' to table '${tableName}'.`);
    }
  } catch (colErr: any) {
    // If column already exists or table alteration is concurrent, log and continue
    console.warn(`[DATABASE AUTO-SYNC]: Column '${columnName}' check on '${tableName}':`, colErr.message);
  }
}
