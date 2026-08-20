import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {

  // 1. Upgrade / Create Seasons Table
  const hasSeasons = await knex.schema.hasTable('seasons');
  if (hasSeasons) {
    // Check missing columns
    const hasStatus = await knex.schema.hasColumn('seasons', 'status');
    const hasTargetAmount = await knex.schema.hasColumn('seasons', 'target_amount');
    const hasCurrentPot = await knex.schema.hasColumn('seasons', 'current_pot');
    const hasRevenueShare = await knex.schema.hasColumn('seasons', 'revenue_share_percent');
    const hasSeasonNumber = await knex.schema.hasColumn('seasons', 'season_number');

    const hasDurationDays = await knex.schema.hasColumn('seasons', 'duration_days');
    const hasTop10Share = await knex.schema.hasColumn('seasons', 'top10_share_percent');
    const hasActive20Share = await knex.schema.hasColumn('seasons', 'active20_share_percent');
    const hasRandomShare = await knex.schema.hasColumn('seasons', 'random_share_percent');
    const hasStartedAt = await knex.schema.hasColumn('seasons', 'started_at');
    const hasSettledAt = await knex.schema.hasColumn('seasons', 'settled_at');
    const hasUpdatedAt = await knex.schema.hasColumn('seasons', 'updated_at');

    await knex.schema.alterTable('seasons', (table) => {
      if (!hasSeasonNumber) table.integer('season_number').defaultTo(0);
      if (!hasStatus) table.string('status').defaultTo('preparing'); // 'preparing', 'active', 'ended', 'settled'
      if (!hasTargetAmount) table.decimal('target_amount', 10, 2).defaultTo(1000.00);
      if (!hasCurrentPot) table.decimal('current_pot', 10, 2).defaultTo(0.00);
      if (!hasRevenueShare) table.decimal('revenue_share_percent', 5, 2).defaultTo(30.00);
      if (!hasDurationDays) table.integer('duration_days').defaultTo(30);
      if (!hasTop10Share) table.decimal('top10_share_percent', 5, 2).defaultTo(60.00);
      if (!hasActive20Share) table.decimal('active20_share_percent', 5, 2).defaultTo(20.00);
      if (!hasRandomShare) table.decimal('random_share_percent', 5, 2).defaultTo(20.00);
      if (!hasStartedAt) table.timestamp('started_at').nullable();
      if (!hasSettledAt) table.timestamp('settled_at').nullable();
      if (!hasUpdatedAt) table.timestamp('updated_at').nullable();
    });
  } else {
    await knex.schema.createTable('seasons', (table) => {
      table.increments('id').primary();
      table.integer('season_number').defaultTo(0);
      table.string('name').notNullable();
      table.string('status').defaultTo('preparing');
      table.decimal('target_amount', 10, 2).defaultTo(1000.00);
      table.decimal('current_pot', 10, 2).defaultTo(0.00);
      table.decimal('revenue_share_percent', 5, 2).defaultTo(30.00);
      table.integer('duration_days').defaultTo(30);
      table.decimal('top10_share_percent', 5, 2).defaultTo(60.00);
      table.decimal('active20_share_percent', 5, 2).defaultTo(20.00);
      table.decimal('random_share_percent', 5, 2).defaultTo(20.00);
      table.timestamp('start_date').nullable();
      table.timestamp('end_date').nullable();
      table.boolean('is_active').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('started_at').nullable();
      table.timestamp('settled_at').nullable();
      table.timestamp('updated_at').nullable();
    });
  }

  // 2. Create Season User Stats Table
  const hasSeasonUserStats = await knex.schema.hasTable('season_user_stats');
  if (!hasSeasonUserStats) {
    await knex.schema.createTable('season_user_stats', (table) => {
      table.increments('id').primary();
      table.integer('season_id').notNullable().references('id').inTable('seasons').onDelete('CASCADE');
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('net_profit', 14, 4).defaultTo(0.0000); // Net profit won in games + market
      table.integer('total_rounds').defaultTo(0); // Activity round counter
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').nullable();

      table.unique(['season_id', 'user_id']);
      table.index(['season_id', 'net_profit']);
      table.index(['season_id', 'total_rounds']);
    });
  }

  // 3. Create Airdrop Payouts Log Table
  const hasAirdropPayouts = await knex.schema.hasTable('airdrop_payouts');
  if (!hasAirdropPayouts) {
    await knex.schema.createTable('airdrop_payouts', (table) => {
      table.increments('id').primary();
      table.integer('season_id').notNullable().references('id').inTable('seasons').onDelete('CASCADE');
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('category').notNullable(); // 'top10', 'active20', 'random'
      table.integer('rank').nullable();
      table.decimal('amount_eur', 10, 2).notNullable();
      table.timestamp('paid_at').defaultTo(knex.fn.now());

      table.index(['season_id']);
      table.index(['user_id']);
    });
  }

  // 4. Seed Season 0 if no season exists
  const existingSeason = await knex('seasons').first();
  const nowIso = new Date().toISOString();
  if (!existingSeason) {
    await knex('seasons').insert({
      season_number: 0,
      name: 'Season 0',
      status: 'preparing',
      target_amount: 1000.00,
      current_pot: 0.00,
      revenue_share_percent: 30.00,
      duration_days: 30,
      top10_share_percent: 60.00,
      active20_share_percent: 20.00,
      random_share_percent: 20.00,
      is_active: false,
      created_at: nowIso,
      updated_at: nowIso,
    });
  } else {
    await knex('seasons').where('id', existingSeason.id).update({
      season_number: existingSeason.season_number ?? 0,
      status: existingSeason.status || (existingSeason.is_active ? 'active' : 'preparing'),
      target_amount: existingSeason.target_amount || 1000.00,
      current_pot: existingSeason.current_pot || 0.00,
      revenue_share_percent: existingSeason.revenue_share_percent || 30.00,
      top10_share_percent: 60.00,
      active20_share_percent: 20.00,
      random_share_percent: 20.00,
      updated_at: nowIso,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('airdrop_payouts');
  await knex.schema.dropTableIfExists('season_user_stats');
}
