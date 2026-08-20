import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    // Display name (changeable 1x for free)
    table.string('display_name').nullable();
    table.boolean('display_name_changed').defaultTo(false);

    // Crypto payout addresses
    table.string('wallet_ltc').nullable();
    table.string('wallet_btc').nullable();

    // Account deletion scheduling (48h grace period)
    table.timestamp('deletion_scheduled_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('display_name');
    table.dropColumn('display_name_changed');
    table.dropColumn('wallet_ltc');
    table.dropColumn('wallet_btc');
    table.dropColumn('deletion_scheduled_at');
  });
}
