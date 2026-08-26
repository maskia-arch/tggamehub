import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('custom_emojis');
  if (!hasTable) {
    await knex.schema.createTable('custom_emojis', (table) => {
      table.string('emoji_key', 64).primary();
      table.string('custom_emoji_id', 64).notNullable().index();
      table.string('file_id', 255).nullable();
      table.string('emoji_char', 16).notNullable().defaultTo('🪙');
      table.string('category', 32).notNullable().defaultTo('general');
      table.timestamps(true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custom_emojis');
}
