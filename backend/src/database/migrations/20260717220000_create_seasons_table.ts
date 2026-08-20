import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('seasons'))) {
    await knex.schema.createTable('seasons', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.timestamp('start_date').notNullable();
      table.timestamp('end_date').notNullable();
      table.decimal('initial_pot_amount', 10, 2).defaultTo(0.00);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('seasons');
}
