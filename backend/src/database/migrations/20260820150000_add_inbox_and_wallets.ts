import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Alter users table to add additional wallets if missing
  const hasSol = await knex.schema.hasColumn('users', 'wallet_sol');
  if (!hasSol) {
    await knex.schema.alterTable('users', (table) => {
      table.string('wallet_sol').nullable();
      table.string('wallet_eth').nullable();
    });
  }

  // Create user_inbox table
  const hasInbox = await knex.schema.hasTable('user_inbox');
  if (!hasInbox) {
    await knex.schema.createTable('user_inbox', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable().index();
      table.string('title').notNullable();
      table.text('message').notNullable();
      table.string('category').defaultTo('system');
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_inbox');
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('wallet_sol');
    table.dropColumn('wallet_eth');
  });
}
