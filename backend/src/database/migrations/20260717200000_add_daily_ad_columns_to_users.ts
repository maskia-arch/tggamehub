import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.integer('daily_ad_count').defaultTo(0);
    table.string('last_ad_date').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('daily_ad_count');
    table.dropColumn('last_ad_date');
  });
}
