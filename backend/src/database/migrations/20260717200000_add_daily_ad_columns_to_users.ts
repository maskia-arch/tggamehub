import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasAdCount = await knex.schema.hasColumn('users', 'daily_ad_count');
    const hasLastAdDate = await knex.schema.hasColumn('users', 'last_ad_date');
    await knex.schema.alterTable('users', (table) => {
      if (!hasAdCount) table.integer('daily_ad_count').defaultTo(0);
      if (!hasLastAdDate) table.string('last_ad_date').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('daily_ad_count');
    table.dropColumn('last_ad_date');
  });
}
