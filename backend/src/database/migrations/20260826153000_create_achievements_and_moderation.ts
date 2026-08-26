import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Achievements Table
  const hasAchievements = await knex.schema.hasTable('achievements');
  if (!hasAchievements) {
    await knex.schema.createTable('achievements', (table) => {
      table.string('id', 64).primary();
      table.string('category', 32).notNullable(); // 'og', 'game_jump', 'game_bird', 'game_crossy', 'market', 'season', 'community'
      table.string('title', 128).notNullable();
      table.string('description', 255).notNullable();
      table.string('badge_icon', 64).notNullable(); // Emoji or icon identifier
      table.string('badge_rarity', 32).notNullable().defaultTo('BRONZE'); // 'OG', 'GOLD', 'SILVER', 'BRONZE', 'DIAMOND'
      table.integer('sort_order').defaultTo(0);
      table.timestamps(true, true);
    });
  }

  // 2. User Achievements Table
  const hasUserAchievements = await knex.schema.hasTable('user_achievements');
  if (!hasUserAchievements) {
    await knex.schema.createTable('user_achievements', (table) => {
      table.increments('id').primary();
      table.string('user_id', 255).notNullable().index();
      table.string('achievement_id', 64).notNullable().index();
      table.timestamp('unlocked_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'achievement_id']);
    });
  }

  // 3. Moderation columns on users table
  const hasFrozen = await knex.schema.hasColumn('users', 'is_frozen');
  if (!hasFrozen) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('is_frozen').defaultTo(false);
      table.string('frozen_reason', 255).nullable();
      table.boolean('is_banned').defaultTo(false);
      table.string('ban_reason', 255).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_achievements');
  await knex.schema.dropTableIfExists('achievements');
}
