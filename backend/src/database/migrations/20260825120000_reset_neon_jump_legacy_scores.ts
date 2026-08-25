import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Completely delete all legacy scores for Neon Jump (doodlejump) ONCE
  const hasScores = await knex.schema.hasTable('scores');
  if (hasScores) {
    const count = await knex('scores').where({ game_id: 'doodlejump' }).del();
    console.log(`[MIGRATION]: Purged ${count} legacy scores for Neon Jump (doodlejump) ONCE.`);
  }

  // Also clear Redis/in-memory leaderboard caches once
  try {
    const { resetGameLeaderboardAndScores } = require('../../services/gameLeaderboardService');
    await resetGameLeaderboardAndScores('doodlejump');
  } catch {}
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible clean reset
}
