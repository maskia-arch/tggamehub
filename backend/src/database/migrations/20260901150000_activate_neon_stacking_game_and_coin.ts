import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const now = new Date().toISOString();

  // 1. Ensure hub_game_settings table exists
  const hasGameSettings = await knex.schema.hasTable('hub_game_settings');
  if (!hasGameSettings) {
    await knex.schema.createTable('hub_game_settings', (table) => {
      table.string('game_id').primary();
      table.string('status').notNullable().defaultTo('active');
      table.text('maintenance_message').nullable();
      table.integer('target_score').defaultTo(100);
      table.integer('sort_order').defaultTo(999);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 2. Force activate neonstacking in hub_game_settings
  const stackExists = await knex('hub_game_settings').where({ game_id: 'neonstacking' }).first();
  if (stackExists) {
    await knex('hub_game_settings').where({ game_id: 'neonstacking' }).update({
      status: 'active',
      maintenance_message: null,
      target_score: 15,
      sort_order: 3,
      updated_at: now,
    });
  } else {
    await knex('hub_game_settings').insert({
      game_id: 'neonstacking',
      status: 'active',
      maintenance_message: null,
      target_score: 15,
      sort_order: 3,
      created_at: now,
      updated_at: now,
    });
  }

  // Ensure all 4 games have correct sequential sort_order
  const defaultGames = [
    { game_id: 'doodlejump', status: 'active', target_score: 1500, sort_order: 0 },
    { game_id: 'neonbird', status: 'active', target_score: 25, sort_order: 1 },
    { game_id: 'crossyneonroad', status: 'active', target_score: 40, sort_order: 2 },
    { game_id: 'neonstacking', status: 'active', target_score: 15, sort_order: 3 },
  ];

  for (const dg of defaultGames) {
    const exists = await knex('hub_game_settings').where({ game_id: dg.game_id }).first();
    if (exists) {
      await knex('hub_game_settings').where({ game_id: dg.game_id }).update({
        sort_order: dg.sort_order,
        target_score: dg.target_score,
      });
    } else {
      await knex('hub_game_settings').insert({
        ...dg,
        maintenance_message: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  // 3. Ensure market_coins has  initialized
  const hasMarketCoins = await knex.schema.hasTable('market_coins');
  if (hasMarketCoins) {
    const stackCoin = await knex('market_coins').where({ symbol: 'STACK' }).first();
    if (!stackCoin) {
      await knex('market_coins').insert({
        symbol: 'STACK',
        name: 'NEON STACK Coin',
        game_id: 'neonstacking',
        current_price: 0.00000001,
        base_price: 0.00000001,
        virtual_game_reserve: 100000.0,
        virtual_token_reserve: 10000000000000.0,
        constant_product_k: 1000000000000000000.0,
        circulating_supply: 10000000000000.0,
        total_burned: 0.0,
        volume_24h: 0.0,
        updated_at: now,
      });
    } else {
      await knex('market_coins').where({ symbol: 'STACK' }).update({
        name: 'NEON STACK Coin',
        game_id: 'neonstacking',
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('hub_game_settings').where({ game_id: 'neonstacking' }).update({ status: 'hidden' });
}
