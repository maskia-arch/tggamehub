import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasDisplayName = await knex.schema.hasColumn('users', 'display_name');
    const hasDisplayNameChanged = await knex.schema.hasColumn('users', 'display_name_changed');
    const hasWalletLtc = await knex.schema.hasColumn('users', 'wallet_ltc');
    const hasWalletBtc = await knex.schema.hasColumn('users', 'wallet_btc');
    const hasDeletionScheduled = await knex.schema.hasColumn('users', 'deletion_scheduled_at');

    await knex.schema.alterTable('users', (table) => {
      if (!hasDisplayName) table.string('display_name').nullable();
      if (!hasDisplayNameChanged) table.boolean('display_name_changed').defaultTo(false);
      if (!hasWalletLtc) table.string('wallet_ltc').nullable();
      if (!hasWalletBtc) table.string('wallet_btc').nullable();
      if (!hasDeletionScheduled) table.timestamp('deletion_scheduled_at').nullable();
    });
  }
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
