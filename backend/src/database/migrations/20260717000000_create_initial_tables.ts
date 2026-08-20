import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create Users Table
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.string('id').primary(); // Telegram user ID as string
      table.string('username').nullable();
      table.string('first_name').nullable();
      table.string('last_name').nullable();
      table.integer('energy_value').defaultTo(5);
      table.timestamp('energy_updated_at').defaultTo(knex.fn.now());
      table.string('referred_by').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // Create Scores Table (for history/auditing)
  if (!(await knex.schema.hasTable('scores'))) {
    await knex.schema.createTable('scores', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable();
      table.string('game_id').notNullable();
      table.integer('score').notNullable();
      table.text('validation_payload').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      // Indexing for faster rank queries
      table.index(['game_id', 'score']);
      table.index(['user_id']);
    });
  }

  // Create Referrals Table
  if (!(await knex.schema.hasTable('referrals'))) {
    await knex.schema.createTable('referrals', (table) => {
      table.increments('id').primary();
      table.string('referrer_id').notNullable();
      table.string('referred_id').notNullable();
      table.boolean('bonus_processed').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['referrer_id', 'referred_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('referrals');
  await knex.schema.dropTableIfExists('scores');
  await knex.schema.dropTableIfExists('users');
}
