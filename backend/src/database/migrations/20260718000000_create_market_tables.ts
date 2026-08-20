import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Add game_cash column to users table if not exists
  const hasGameCash = await knex.schema.hasColumn('users', 'game_cash');
  if (!hasGameCash) {
    await knex.schema.table('users', (table) => {
      table.float('game_cash').defaultTo(0.0).notNullable();
    });
  }

  // 2. Create market_coins table
  const hasMarketCoins = await knex.schema.hasTable('market_coins');
  if (!hasMarketCoins) {
    await knex.schema.createTable('market_coins', (table) => {
      table.string('symbol').primary(); // e.g. DOODLE, FLAPPY
      table.string('name').notNullable();
      table.string('game_id').notNullable().unique();
      table.float('current_price').notNullable();
      table.float('base_price').notNullable();
      table.float('circulating_supply').notNullable();
      table.float('total_burned').defaultTo(0.0).notNullable();
      table.float('volume_24h').defaultTo(0.0).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 3. Create market_price_history table
  const hasPriceHistory = await knex.schema.hasTable('market_price_history');
  if (!hasPriceHistory) {
    await knex.schema.createTable('market_price_history', (table) => {
      table.increments('id').primary();
      table.string('coin_symbol').notNullable().references('symbol').inTable('market_coins').onDelete('CASCADE');
      table.float('price').notNullable();
      table.float('volume').defaultTo(0.0).notNullable();
      table.timestamp('timestamp').defaultTo(knex.fn.now());

      table.index(['coin_symbol', 'timestamp']);
    });
  }

  // 4. Create user_portfolios table
  const hasUserPortfolios = await knex.schema.hasTable('user_portfolios');
  if (!hasUserPortfolios) {
    await knex.schema.createTable('user_portfolios', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('coin_symbol').notNullable().references('symbol').inTable('market_coins').onDelete('CASCADE');
      table.float('amount').defaultTo(0.0).notNullable();
      table.float('avg_buy_price').defaultTo(0.0).notNullable();
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['user_id', 'coin_symbol']);
    });
  }

  // 5. Create user_trades table
  const hasUserTrades = await knex.schema.hasTable('user_trades');
  if (!hasUserTrades) {
    await knex.schema.createTable('user_trades', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('coin_symbol').notNullable().references('symbol').inTable('market_coins').onDelete('CASCADE');
      table.string('trade_type').notNullable(); // 'BUY' or 'SELL'
      table.float('amount_tokens').notNullable();
      table.float('price_per_token').notNullable();
      table.float('total_cash').notNullable();
      table.float('gas_fee').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['user_id']);
      table.index(['coin_symbol']);
    });
  }

  // Seed default market coins (Only active games: DOODLE & FLAPPY starting at micro price $0.00000001)
  const defaultCoins = [
    {
      symbol: 'DOODLE',
      name: 'Doodle Jump Coin',
      game_id: 'doodlejump',
      current_price: 0.00000001,
      base_price: 0.00000001,
      circulating_supply: 1000000000.0,
      total_burned: 0.0,
      volume_24h: 0.0,
    },
    {
      symbol: 'FLAPPY',
      name: 'Neon Flappy Coin',
      game_id: 'neonbird',
      current_price: 0.00000001,
      base_price: 0.00000001,
      circulating_supply: 1000000000.0,
      total_burned: 0.0,
      volume_24h: 0.0,
    },
  ];

  // Insert or update default coins
  for (const coin of defaultCoins) {
    const existing = await knex('market_coins').where({ symbol: coin.symbol }).first();
    if (!existing) {
      await knex('market_coins').insert(coin);
    }
  }

  // Clean up inactive coins ($CROSSY, $STACK) if they were inserted in previous run
  await knex('market_coins').whereNotIn('symbol', ['DOODLE', 'FLAPPY']).del();

  // Seed initial price history points (Clean baseline at 0.00000001 $)
  const historyCount = await knex('market_price_history').count('id as count').first();
  const histVal = historyCount ? parseInt(historyCount.count as string, 10) : 0;

  if (histVal === 0) {
    const now = Date.now();
    const historyEntries: any[] = [];
    for (const coin of defaultCoins) {
      historyEntries.push({
        coin_symbol: coin.symbol,
        price: coin.current_price,
        volume: 0,
        timestamp: new Date(now),
      });
    }

    if (historyEntries.length > 0) {
      await knex('market_price_history').insert(historyEntries);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_trades');
  await knex.schema.dropTableIfExists('user_portfolios');
  await knex.schema.dropTableIfExists('market_price_history');
  await knex.schema.dropTableIfExists('market_coins');
  
  const hasGameCash = await knex.schema.hasColumn('users', 'game_cash');
  if (hasGameCash) {
    await knex.schema.table('users', (table) => {
      table.dropColumn('game_cash');
    });
  }
}
