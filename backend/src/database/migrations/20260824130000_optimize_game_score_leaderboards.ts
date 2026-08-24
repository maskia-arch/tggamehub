import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasScores = await knex.schema.hasTable('scores');
  if (hasScores) {
    try {
      await knex.schema.alterTable('scores', (table) => {
        // Indexes to ensure high-performance querying for time-filtered game highscores
        table.index(['game_id', 'created_at', 'score'], 'idx_scores_game_created_score');
        table.index(['user_id', 'game_id', 'score'], 'idx_scores_user_game_score');
        table.index(['created_at'], 'idx_scores_created_at');
      });
    } catch (err: any) {
      // Ignore if index already exists in some environments
      console.warn('[MIGRATION]: Index creation note:', err?.message);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasScores = await knex.schema.hasTable('scores');
  if (hasScores) {
    try {
      await knex.schema.alterTable('scores', (table) => {
        table.dropIndex(['game_id', 'created_at', 'score'], 'idx_scores_game_created_score');
        table.dropIndex(['user_id', 'game_id', 'score'], 'idx_scores_user_game_score');
        table.dropIndex(['created_at'], 'idx_scores_created_at');
      });
    } catch (err: any) {
      console.warn('[MIGRATION]: Index drop note:', err?.message);
    }
  }
}
