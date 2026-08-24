import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('hub_game_settings');
  if (!hasTable) {
    await knex.schema.createTable('hub_game_settings', (table) => {
      table.string('game_id').primary();
      table.string('status').notNullable().defaultTo('active'); // 'active', 'maintenance', 'hidden', 'coming_soon'
      table.text('maintenance_message').nullable();
      table.integer('target_score').defaultTo(100);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    // Seed default statuses for all existing games
    const now = new Date().toISOString();
    await knex('hub_game_settings').insert([
      {
        game_id: 'doodlejump',
        status: 'active',
        maintenance_message: null,
        target_score: 1500,
        created_at: now,
        updated_at: now,
      },
      {
        game_id: 'neonbird',
        status: 'active',
        maintenance_message: null,
        target_score: 25,
        created_at: now,
        updated_at: now,
      },
      {
        game_id: 'crossyneonroad',
        status: 'hidden',
        maintenance_message: 'Crossy Neon Road befindet sich aktuell im Feinschliff.',
        target_score: 40,
        created_at: now,
        updated_at: now,
      },
      {
        game_id: 'neonstacking',
        status: 'hidden',
        maintenance_message: 'Neon Stacking wird aktuell für Touch-Steuerung optimiert.',
        target_score: 15,
        created_at: now,
        updated_at: now,
      },
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hub_game_settings');
}
