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
  } else {
    const hasSortOrder = await knex.schema.hasColumn('hub_game_settings', 'sort_order');
    if (!hasSortOrder) {
      await knex.schema.alterTable('hub_game_settings', (table) => {
        table.integer('sort_order').defaultTo(999);
      });
    }
  }

  // 2. Force activate crossyneonroad in hub_game_settings
  const crossyExists = await knex('hub_game_settings').where({ game_id: 'crossyneonroad' }).first();
  if (crossyExists) {
    await knex('hub_game_settings').where({ game_id: 'crossyneonroad' }).update({
      status: 'active',
      maintenance_message: null,
      target_score: 40,
      sort_order: 2,
      updated_at: now,
    });
  } else {
    await knex('hub_game_settings').insert({
      game_id: 'crossyneonroad',
      status: 'active',
      maintenance_message: null,
      target_score: 40,
      sort_order: 2,
      created_at: now,
      updated_at: now,
    });
  }

  // Ensure doodlejump and neonbird are active
  const doodleExists = await knex('hub_game_settings').where({ game_id: 'doodlejump' }).first();
  if (doodleExists) {
    await knex('hub_game_settings').where({ game_id: 'doodlejump' }).update({ sort_order: 0 });
  } else {
    await knex('hub_game_settings').insert({
      game_id: 'doodlejump',
      status: 'active',
      target_score: 1500,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    });
  }

  const birdExists = await knex('hub_game_settings').where({ game_id: 'neonbird' }).first();
  if (birdExists) {
    await knex('hub_game_settings').where({ game_id: 'neonbird' }).update({ sort_order: 1 });
  } else {
    await knex('hub_game_settings').insert({
      game_id: 'neonbird',
      status: 'active',
      target_score: 25,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    });
  }

  // 3. Ensure market_coins has $CROSSY initialized
  const hasMarketCoins = await knex.schema.hasTable('market_coins');
  if (hasMarketCoins) {
    const crossyCoin = await knex('market_coins').where({ symbol: 'CROSSY' }).first();
    if (!crossyCoin) {
      await knex('market_coins').insert({
        symbol: 'CROSSY',
        name: 'Crossy Neon Road Coin',
        game_id: 'crossyneonroad',
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
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert crossyneonroad to hidden if rolled back
  const hasGameSettings = await knex.schema.hasTable('hub_game_settings');
  if (hasGameSettings) {
    await knex('hub_game_settings').where({ game_id: 'crossyneonroad' }).update({ status: 'hidden' });
  }
}
