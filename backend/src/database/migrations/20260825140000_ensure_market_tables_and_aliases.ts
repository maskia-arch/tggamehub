import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Ensure user_portfolios table & columns
  const hasUserPortfolios = await knex.schema.hasTable('user_portfolios');
  if (!hasUserPortfolios) {
    await knex.schema.createTable('user_portfolios', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable();
      table.string('coin_symbol').notNullable();
      table.float('amount').defaultTo(0.0).notNullable();
      table.float('avg_buy_price').defaultTo(0.0).notNullable();
      table.float('total_invested').defaultTo(0.0).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['user_id', 'coin_symbol']);
    });
    console.log('[MIGRATION]: Created user_portfolios table.');
  } else {
    const hasTotalInvested = await knex.schema.hasColumn('user_portfolios', 'total_invested');
    if (!hasTotalInvested) {
      await knex.schema.table('user_portfolios', (table) => {
        table.float('total_invested').defaultTo(0.0).notNullable();
      });
    }
  }

  // 2. Ensure user_trades table & columns
  const hasUserTrades = await knex.schema.hasTable('user_trades');
  if (!hasUserTrades) {
    await knex.schema.createTable('user_trades', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable();
      table.string('coin_symbol').notNullable();
      table.string('trade_type').notNullable(); // 'BUY' or 'SELL'
      table.float('amount_tokens').notNullable();
      table.float('price_per_token').notNullable();
      table.float('total_cash').notNullable();
      table.float('gas_fee').notNullable();
      table.float('price_impact_percent').defaultTo(0.0).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['user_id']);
      table.index(['coin_symbol']);
    });
    console.log('[MIGRATION]: Created user_trades table.');
  } else {
    const hasPriceImpact = await knex.schema.hasColumn('user_trades', 'price_impact_percent');
    if (!hasPriceImpact) {
      await knex.schema.table('user_trades', (table) => {
        table.float('price_impact_percent').defaultTo(0.0).notNullable();
      });
    }
  }

  // 3. Ensure market_trades table exists as well (safety compatibility alias/table)
  const hasMarketTrades = await knex.schema.hasTable('market_trades');
  if (!hasMarketTrades) {
    await knex.schema.createTable('market_trades', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable();
      table.string('coin_symbol').notNullable();
      table.string('trade_type').notNullable(); // 'BUY' or 'SELL'
      table.float('amount_cash').defaultTo(0.0).notNullable();
      table.float('amount_tokens').notNullable();
      table.float('execution_price').defaultTo(0.0).notNullable();
      table.float('gas_fee').defaultTo(0.0).notNullable();
      table.float('price_impact_percent').defaultTo(0.0).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['user_id']);
      table.index(['coin_symbol']);
    });
    console.log('[MIGRATION]: Created market_trades compatibility table.');
  }

  // 4. Ensure market_events table exists
  const hasMarketEvents = await knex.schema.hasTable('market_events');
  if (!hasMarketEvents) {
    await knex.schema.createTable('market_events', (table) => {
      table.increments('id').primary();
      table.string('coin_symbol').notNullable();
      table.string('event_type').notNullable();
      table.string('title').notNullable();
      table.string('description').notNullable();
      table.float('price_impact_percent').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log('[MIGRATION]: Created market_events table.');
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible safety migration
}
