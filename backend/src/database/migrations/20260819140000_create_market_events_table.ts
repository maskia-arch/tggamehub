import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasMarketEvents = await knex.schema.hasTable('market_events');
  if (!hasMarketEvents) {
    await knex.schema.createTable('market_events', (table) => {
      table.increments('id').primary();
      table.string('coin_symbol').notNullable().references('symbol').inTable('market_coins').onDelete('CASCADE');
      table.string('event_type').notNullable(); // 'BULL_RALLY', 'BEAR_DUMP', 'WHALE_BUY', 'VOLATILITY_SPIKE', 'VIRAL_HYPE'
      table.string('title').notNullable();
      table.string('description').notNullable();
      table.float('price_impact_percent').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['coin_symbol', 'created_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('market_events');
}
