import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasTutorialStatus = await knex.schema.hasColumn('users', 'tutorial_status');
  if (!hasTutorialStatus) {
    await knex.schema.alterTable('users', (table) => {
      table.string('tutorial_status', 30).defaultTo('NOT_STARTED');
    });
  }

  const hasTutorialStep = await knex.schema.hasColumn('users', 'tutorial_step');
  if (!hasTutorialStep) {
    await knex.schema.alterTable('users', (table) => {
      table.integer('tutorial_step').defaultTo(1);
    });
  }

  const hasTutorialRewardClaimed = await knex.schema.hasColumn('users', 'tutorial_reward_claimed');
  if (!hasTutorialRewardClaimed) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('tutorial_reward_claimed').defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('tutorial_status');
    table.dropColumn('tutorial_step');
    table.dropColumn('tutorial_reward_claimed');
  });
}
