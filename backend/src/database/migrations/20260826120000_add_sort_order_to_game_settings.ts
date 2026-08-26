import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('hub_game_settings');
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn('hub_game_settings', 'sort_order');
    if (!hasColumn) {
      await knex.schema.alterTable('hub_game_settings', (table) => {
        table.integer('sort_order').defaultTo(999);
      });
    }

    // Set initial sort orders based on canonical order
    await knex('hub_game_settings').where({ game_id: 'doodlejump' }).update({ sort_order: 0 });
    await knex('hub_game_settings').where({ game_id: 'neonbird' }).update({ sort_order: 1 });
    await knex('hub_game_settings').where({ game_id: 'crossyneonroad' }).update({ sort_order: 2 });
    await knex('hub_game_settings').where({ game_id: 'neonstacking' }).update({ sort_order: 3 });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('hub_game_settings');
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn('hub_game_settings', 'sort_order');
    if (hasColumn) {
      await knex.schema.alterTable('hub_game_settings', (table) => {
        table.dropColumn('sort_order');
      });
    }
  }
}
