import db from '../database/client';
import { getCurrentSeason } from './seasonService';

export interface AchievementItem {
  id: string;
  category: 'og' | 'game_jump' | 'game_bird' | 'game_crossy' | 'market' | 'season' | 'community';
  title: string;
  description: string;
  badge_icon: string;
  badge_rarity: 'OG' | 'GOLD' | 'SILVER' | 'BRONZE' | 'DIAMOND';
  sort_order: number;
}

export const ACHIEVEMENTS_CATALOG: AchievementItem[] = [
  // ── 1. Golden OG Badge (Hour 1 Pioneer) ───────────────────────────────────
  {
    id: 'og_pioneer',
    category: 'og',
    title: '🌟 OG Stunde 1',
    description: 'Vor dem Start von Season 1 registriert. Echter Pionier der CoinCade Arcade!',
    badge_icon: '🌟',
    badge_rarity: 'OG',
    sort_order: 1,
  },

  // ── 2. Neon Jump ($DOODLE) Achievements ──────────────────────────────────
  {
    id: 'jump_novice',
    category: 'game_jump',
    title: '🟢 Sprung-Novize',
    description: 'Erreiche 100 Punkte in Neon Jump',
    badge_icon: '🟢',
    badge_rarity: 'BRONZE',
    sort_order: 10,
  },
  {
    id: 'jump_pro',
    category: 'game_jump',
    title: '🟢 Star Jumper',
    description: 'Erreiche 1.000 Punkte in Neon Jump',
    badge_icon: '🟢',
    badge_rarity: 'SILVER',
    sort_order: 11,
  },
  {
    id: 'jump_master',
    category: 'game_jump',
    title: '🟢 Neon Ascendant',
    description: 'Erreiche 5.000 Punkte in Neon Jump',
    badge_icon: '🟢',
    badge_rarity: 'GOLD',
    sort_order: 12,
  },
  {
    id: 'jump_legend',
    category: 'game_jump',
    title: '🟢 Quantum Leaper',
    description: 'Erreiche 15.000 Punkte in Neon Jump',
    badge_icon: '🟢',
    badge_rarity: 'DIAMOND',
    sort_order: 13,
  },
  {
    id: 'jump_veteran',
    category: 'game_jump',
    title: '🟢 Jump Veteran',
    description: 'Spiele 50 Runden Neon Jump',
    badge_icon: '🎮',
    badge_rarity: 'SILVER',
    sort_order: 14,
  },

  // ── 3. Neon Bird ($FLAPPY) Achievements ───────────────────────────────────
  {
    id: 'bird_fledgling',
    category: 'game_bird',
    title: '🟡 Erstflug',
    description: 'Überwinde 5 Rohre in Neon Bird',
    badge_icon: '🟡',
    badge_rarity: 'BRONZE',
    sort_order: 20,
  },
  {
    id: 'bird_aviator',
    category: 'game_bird',
    title: '🟡 Cyber Wing',
    description: 'Überwinde 20 Rohre in Neon Bird',
    badge_icon: '🟡',
    badge_rarity: 'SILVER',
    sort_order: 21,
  },
  {
    id: 'bird_ace',
    category: 'game_bird',
    title: '🟡 Supersonic Flapper',
    description: 'Überwinde 50 Rohre in Neon Bird',
    badge_icon: '🟡',
    badge_rarity: 'GOLD',
    sort_order: 22,
  },
  {
    id: 'bird_god',
    category: 'game_bird',
    title: '🟡 Matrix Flieger',
    description: 'Überwinde 100 Rohre in Neon Bird',
    badge_icon: '🟡',
    badge_rarity: 'DIAMOND',
    sort_order: 23,
  },
  {
    id: 'bird_veteran',
    category: 'game_bird',
    title: '🟡 Aviator Veteran',
    description: 'Spiele 50 Runden Neon Bird',
    badge_icon: '🎮',
    badge_rarity: 'SILVER',
    sort_order: 24,
  },

  // ── 4. Crossy Neon Road ($CROSSY) Achievements ────────────────────────────
  {
    id: 'crossy_walker',
    category: 'game_crossy',
    title: '🔵 Strassen-Entdecker',
    description: 'Überquere 25 Meter in Crossy Neon Road',
    badge_icon: '🔵',
    badge_rarity: 'BRONZE',
    sort_order: 30,
  },
  {
    id: 'crossy_runner',
    category: 'game_crossy',
    title: '🔵 Neon Sprinter',
    description: 'Überquere 75 Meter in Crossy Neon Road',
    badge_icon: '🔵',
    badge_rarity: 'SILVER',
    sort_order: 31,
  },
  {
    id: 'crossy_master',
    category: 'game_crossy',
    title: '🔵 Traffic Dodger',
    description: 'Überquere 150 Meter in Crossy Neon Road',
    badge_icon: '🔵',
    badge_rarity: 'GOLD',
    sort_order: 32,
  },
  {
    id: 'crossy_god',
    category: 'game_crossy',
    title: '🔵 Cyber Highway Legende',
    description: 'Überquere 300 Meter in Crossy Neon Road',
    badge_icon: '🔵',
    badge_rarity: 'DIAMOND',
    sort_order: 33,
  },
  {
    id: 'crossy_veteran',
    category: 'game_crossy',
    title: '🔵 Crossy Veteran',
    description: 'Spiele 50 Runden Crossy Neon Road',
    badge_icon: '🎮',
    badge_rarity: 'SILVER',
    sort_order: 34,
  },

  // ── 5. Leaderboard Ranking Badges ──────────────────────────────────────────
  {
    id: 'rank_champion',
    category: 'season',
    title: '👑 Season Champion',
    description: 'Erreiche Platz 1 auf dem Season Leaderboard',
    badge_icon: '👑',
    badge_rarity: 'GOLD',
    sort_order: 40,
  },
  {
    id: 'rank_podium',
    category: 'season',
    title: '🥈 Podium Finisher',
    description: 'Erreiche die Top 3 auf dem Season Leaderboard',
    badge_icon: '🥈',
    badge_rarity: 'SILVER',
    sort_order: 41,
  },
  {
    id: 'rank_top10',
    category: 'season',
    title: '🥉 Elite Top 10',
    description: 'Erreiche die Top 10 auf dem Season Leaderboard',
    badge_icon: '🥉',
    badge_rarity: 'BRONZE',
    sort_order: 42,
  },
  {
    id: 'rank_top50',
    category: 'season',
    title: '🎖️ Top 50 Veteran',
    description: 'Erreiche die Top 50 auf dem Season Leaderboard',
    badge_icon: '🎖️',
    badge_rarity: 'BRONZE',
    sort_order: 43,
  },

  // ── 6. Börse, VIP & Community ──────────────────────────────────────────────
  {
    id: 'vip_member',
    category: 'community',
    title: '🛡️ VIP Member',
    description: 'Besitzer eines VIP Season Passes',
    badge_icon: '🛡️',
    badge_rarity: 'GOLD',
    sort_order: 50,
  },
  {
    id: 'market_first_trade',
    category: 'market',
    title: '📈 Krypto Händler',
    description: 'Tätige deinen ersten Trade an der AMM Börse',
    badge_icon: '📈',
    badge_rarity: 'BRONZE',
    sort_order: 51,
  },
  {
    id: 'market_whale',
    category: 'market',
    title: '💎 Börsen Wal',
    description: 'Erziele über 1.000 $ kumuliertes Handelsvolumen',
    badge_icon: '💎',
    badge_rarity: 'DIAMOND',
    sort_order: 52,
  },
  {
    id: 'referral_recruiter',
    category: 'community',
    title: '👥 Community Builder',
    description: 'Lade mindestens 5 Freunde zu CoinCade ein',
    badge_icon: '👥',
    badge_rarity: 'SILVER',
    sort_order: 53,
  },
  {
    id: 'airdrop_hunter',
    category: 'community',
    title: '🎁 Airdrop Jäger',
    description: 'Löse einen AI-Community-Kanal Bonus erfolgreich ein',
    badge_icon: '🎁',
    badge_rarity: 'BRONZE',
    sort_order: 54,
  },
];

/**
 * Ensures the achievements catalog is seeded in the database
 */
export async function seedAchievementsCatalog(): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable('achievements');
    if (!hasTable) return;

    for (const a of ACHIEVEMENTS_CATALOG) {
      await db('achievements')
        .insert({
          id: a.id,
          category: a.category,
          title: a.title,
          description: a.description,
          badge_icon: a.badge_icon,
          badge_rarity: a.badge_rarity,
          sort_order: a.sort_order,
          updated_at: new Date()
        })
        .onConflict('id')
        .merge({
          category: a.category,
          title: a.title,
          description: a.description,
          badge_icon: a.badge_icon,
          badge_rarity: a.badge_rarity,
          sort_order: a.sort_order,
          updated_at: new Date()
        });
    }
  } catch (err: any) {
    console.warn('[Achievements]: Note seeding catalog:', err.message);
  }
}

/**
 * Checks if a user is eligible for the Golden OG Badge.
 * Rule: User registered before Season 1 started (e.g. during Season 0 / Preparing phase).
 */
export async function isEligibleForOgBadge(user: any): Promise<boolean> {
  if (!user || !user.created_at) return false;

  const season1 = await db('seasons').where({ season_number: 1 }).first();
  if (!season1 || !season1.start_date) {
    // Season 1 has not started yet -> all currently registered players are OG Pioneers!
    return true;
  }

  const season1Start = new Date(season1.start_date);
  const userCreated = new Date(user.created_at);
  return userCreated.getTime() < season1Start.getTime();
}

/**
 * Awards an achievement to a user if not already unlocked
 */
export async function unlockAchievement(userId: string, achievementId: string): Promise<boolean> {
  try {
    const existing = await db('user_achievements')
      .where({ user_id: userId, achievement_id: achievementId })
      .first();

    if (existing) return false;

    await db('user_achievements').insert({
      user_id: userId,
      achievement_id: achievementId,
      unlocked_at: new Date(),
    });

    console.log(`[Achievements]: User ${userId} unlocked achievement "${achievementId}"!`);
    return true;
  } catch (err: any) {
    // Unique constraint violation or concurrency
    return false;
  }
}

/**
 * Evaluates and awards all earned achievements for a given user
 */
export async function checkAndAwardAchievements(userId: string): Promise<{ newlyUnlocked: string[] }> {
  const newlyUnlocked: string[] = [];

  try {
    const user = await db('users').where({ id: userId }).first();
    if (!user) return { newlyUnlocked: [] };

    // 1. Golden OG Badge Check
    if (await isEligibleForOgBadge(user)) {
      if (await unlockAchievement(userId, 'og_pioneer')) {
        newlyUnlocked.push('og_pioneer');
      }
    }

    // 2. VIP Member Check
    if (user.season_pass_type === 'VIP') {
      if (await unlockAchievement(userId, 'vip_member')) {
        newlyUnlocked.push('vip_member');
      }
    }

    // 3. Referral Builder Check
    const refCountRow = await db('users').where({ referred_by: userId }).count('id as count').first();
    const refCount = refCountRow ? parseInt(refCountRow.count as string, 10) : 0;
    if (refCount >= 5) {
      if (await unlockAchievement(userId, 'referral_recruiter')) {
        newlyUnlocked.push('referral_recruiter');
      }
    }

    // 4. AI Community Bonus Claim Check
    const claimCountRow = await db('ai_reward_claims').where({ user_id: userId }).count('id as count').first();
    const claimCount = claimCountRow ? parseInt(claimCountRow.count as string, 10) : 0;
    if (claimCount >= 1) {
      if (await unlockAchievement(userId, 'airdrop_hunter')) {
        newlyUnlocked.push('airdrop_hunter');
      }
    }

    // 5. Game Highscores & Round Counts Check
    const scores = await db('scores').where({ user_id: userId });

    // Neon Jump (doodlejump)
    const jumpScores = scores.filter(s => s.game_id === 'doodlejump' || s.game_id === 'doodle');
    const maxJump = jumpScores.reduce((max, s) => Math.max(max, Number(s.score) || 0), 0);
    const jumpRounds = jumpScores.length;

    if (maxJump >= 100 && await unlockAchievement(userId, 'jump_novice')) newlyUnlocked.push('jump_novice');
    if (maxJump >= 1000 && await unlockAchievement(userId, 'jump_pro')) newlyUnlocked.push('jump_pro');
    if (maxJump >= 5000 && await unlockAchievement(userId, 'jump_master')) newlyUnlocked.push('jump_master');
    if (maxJump >= 15000 && await unlockAchievement(userId, 'jump_legend')) newlyUnlocked.push('jump_legend');
    if (jumpRounds >= 50 && await unlockAchievement(userId, 'jump_veteran')) newlyUnlocked.push('jump_veteran');

    // Neon Bird (neonbird / flappy)
    const birdScores = scores.filter(s => s.game_id === 'neonbird' || s.game_id === 'flappy');
    const maxBird = birdScores.reduce((max, s) => Math.max(max, Number(s.score) || 0), 0);
    const birdRounds = birdScores.length;

    if (maxBird >= 5 && await unlockAchievement(userId, 'bird_fledgling')) newlyUnlocked.push('bird_fledgling');
    if (maxBird >= 20 && await unlockAchievement(userId, 'bird_aviator')) newlyUnlocked.push('bird_aviator');
    if (maxBird >= 50 && await unlockAchievement(userId, 'bird_ace')) newlyUnlocked.push('bird_ace');
    if (maxBird >= 100 && await unlockAchievement(userId, 'bird_god')) newlyUnlocked.push('bird_god');
    if (birdRounds >= 50 && await unlockAchievement(userId, 'bird_veteran')) newlyUnlocked.push('bird_veteran');

    // Crossy Neon Road (crossyroad / crossy)
    const crossyScores = scores.filter(s => s.game_id === 'crossyroad' || s.game_id === 'crossy');
    const maxCrossy = crossyScores.reduce((max, s) => Math.max(max, Number(s.score) || 0), 0);
    const crossyRounds = crossyScores.length;

    if (maxCrossy >= 25 && await unlockAchievement(userId, 'crossy_walker')) newlyUnlocked.push('crossy_walker');
    if (maxCrossy >= 75 && await unlockAchievement(userId, 'crossy_runner')) newlyUnlocked.push('crossy_runner');
    if (maxCrossy >= 150 && await unlockAchievement(userId, 'crossy_master')) newlyUnlocked.push('crossy_master');
    if (maxCrossy >= 300 && await unlockAchievement(userId, 'crossy_god')) newlyUnlocked.push('crossy_god');
    if (crossyRounds >= 50 && await unlockAchievement(userId, 'crossy_veteran')) newlyUnlocked.push('crossy_veteran');

    // 6. Market Trade & Whale Check
    if (await db.schema.hasTable('market_transactions')) {
      const trades = await db('market_transactions').where({ user_id: userId });
      if (trades.length > 0) {
        if (await unlockAchievement(userId, 'market_first_trade')) newlyUnlocked.push('market_first_trade');
        const totalVolume = trades.reduce((sum: number, t: any) => sum + (Number(t.total_game_cash) || 0), 0);
        if (totalVolume >= 1000 && await unlockAchievement(userId, 'market_whale')) newlyUnlocked.push('market_whale');
      }
    } else if (await db.schema.hasTable('user_portfolios')) {
      const ports = await db('user_portfolios').where({ user_id: userId });
      if (ports.length > 0) {
        if (await unlockAchievement(userId, 'market_first_trade')) newlyUnlocked.push('market_first_trade');
      }
    }

    // 7. Season Leaderboard Placement Check
    const currentSeason = await getCurrentSeason();
    if (currentSeason && currentSeason.id) {
      const topRows = await db('scores')
        .select('user_id', db.raw('SUM(score) as total_profit'))
        .groupBy('user_id')
        .orderBy('total_profit', 'desc')
        .limit(50);

      const userRankIndex = topRows.findIndex(r => r.user_id === userId);
      if (userRankIndex !== -1) {
        const rank = userRankIndex + 1;
        if (rank === 1 && await unlockAchievement(userId, 'rank_champion')) newlyUnlocked.push('rank_champion');
        if (rank <= 3 && await unlockAchievement(userId, 'rank_podium')) newlyUnlocked.push('rank_podium');
        if (rank <= 10 && await unlockAchievement(userId, 'rank_top10')) newlyUnlocked.push('rank_top10');
        if (rank <= 50 && await unlockAchievement(userId, 'rank_top50')) newlyUnlocked.push('rank_top50');
      }
    }
  } catch (err: any) {
    console.error('[Achievements Evaluation Error]:', err.message);
  }

  return { newlyUnlocked };
}

/**
 * Returns all achievements for a user, including unlocked status and timestamp
 */
export async function getUserAchievements(userId: string): Promise<any[]> {
  await seedAchievementsCatalog();

  const userUnlocked = await db('user_achievements')
    .where({ user_id: userId })
    .select('achievement_id', 'unlocked_at');

  const unlockedMap = new Map<string, string>();
  userUnlocked.forEach(u => unlockedMap.set(u.achievement_id, u.unlocked_at));

  return ACHIEVEMENTS_CATALOG.map(a => {
    const isUnlocked = unlockedMap.has(a.id);
    return {
      ...a,
      is_unlocked: isUnlocked,
      unlocked_at: unlockedMap.get(a.id) || null,
    };
  });
}

/**
 * Generates the full Public Profile Card data for any player
 */
export async function getPublicProfileData(targetUserId: string): Promise<any> {
  const user = await db('users').where({ id: targetUserId }).first();
  if (!user) {
    return null;
  }

  // Trigger achievement check to ensure latest state
  await checkAndAwardAchievements(targetUserId);

  const achievements = await getUserAchievements(targetUserId);
  const unlockedBadges = achievements.filter(a => a.is_unlocked);
  const isOg = await isEligibleForOgBadge(user);

  // Highscores across all games
  const gamesCatalog = [
    { id: 'doodlejump', title: 'Neon Jump', icon: '🟢', scoreUnit: 'pts' },
    { id: 'neonbird', title: 'Neon Bird', icon: '🟡', scoreUnit: 'pts' },
    { id: 'crossyroad', title: 'Crossy Neon Road', icon: '🔵', scoreUnit: 'm' },
  ];

  const gameStats: any[] = [];

  for (const game of gamesCatalog) {
    const gameScores = await db('scores')
      .where({ user_id: targetUserId })
      .andWhere((qb) => {
        if (game.id === 'doodlejump') qb.whereIn('game_id', ['doodlejump', 'doodle']);
        else if (game.id === 'neonbird') qb.whereIn('game_id', ['neonbird', 'flappy']);
        else if (game.id === 'crossyroad') qb.whereIn('game_id', ['crossyroad', 'crossy']);
        else qb.where({ game_id: game.id });
      });

    const maxScore = gameScores.reduce((max, s) => Math.max(max, Number(s.score) || 0), 0);
    const totalRounds = gameScores.length;

    // Calculate game rank
    let rank = '—';
    if (maxScore > 0) {
      const betterCount = await db('scores')
        .whereIn('game_id', game.id === 'doodlejump' ? ['doodlejump', 'doodle'] : (game.id === 'neonbird' ? ['neonbird', 'flappy'] : ['crossyroad', 'crossy']))
        .andWhere('score', '>', maxScore)
        .countDistinct('user_id as count')
        .first();

      const rankNum = (Number(betterCount?.count) || 0) + 1;
      rank = `#${rankNum}`;
    }

    gameStats.push({
      gameId: game.id,
      title: game.title,
      icon: game.icon,
      scoreUnit: game.scoreUnit,
      highScore: maxScore,
      totalRounds,
      rank,
    });
  }

  // Referral stats
  const refCountRow = await db('users').where({ referred_by: targetUserId }).count('id as count').first();
  const referralsCount = refCountRow ? parseInt(refCountRow.count as string, 10) : 0;

  return {
    userId: user.id,
    displayName: user.display_name || user.first_name || 'Spieler',
    username: user.username || null,
    avatarId: user.avatar_id || 'avatar_1',
    createdAt: user.created_at,
    seasonPassType: user.season_pass_type || 'NONE',
    isVip: user.season_pass_type === 'VIP',
    isOgPlayer: isOg,
    isFrozen: Boolean(user.is_frozen),
    isBanned: Boolean(user.is_banned),
    referralsCount,
    gameStats,
    unlockedBadgesCount: unlockedBadges.length,
    totalBadgesCount: achievements.length,
    badges: unlockedBadges,
    allAchievements: achievements,
  };
}
