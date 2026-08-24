import fs from 'fs';
import path from 'path';
import db from '../database/client';

export type GameStatus = 'active' | 'maintenance' | 'hidden' | 'coming_soon';

export interface HubGameConfig {
  id: string;
  title: string;
  genre: string;
  icon: string;
  path: string;
  preview?: string;
  description?: string;
  scoreUnit: string;
  targetScore: number;
  coinSymbol: string;
  status: GameStatus;
  maintenanceMessage?: string | null;
  hidden?: boolean;
}

export const BASE_HUB_GAMES: Omit<HubGameConfig, 'status' | 'maintenanceMessage'>[] = [
  {
    id: 'doodlejump',
    title: 'Neon Jump',
    genre: 'Arcade / Jump',
    icon: '👾',
    path: '/games/doodlejump/index.html',
    preview: '/images/neon_jump_preview.png',
    description: 'Springe hoch, weiche Hindernissen aus. Tastatur & Touch.',
    scoreUnit: 'm',
    targetScore: 1500,
    coinSymbol: 'DOODLE',
    hidden: false,
  },
  {
    id: 'neonbird',
    title: 'Neon Bird',
    genre: 'Arcade / Flappy',
    icon: '🐦',
    path: '/games/neonbird/index.html',
    preview: '/images/neon_bird_preview.png',
    description: 'Fliege durch die Neon-Rohre und weiche Hindernissen aus. Leertaste & Touch.',
    scoreUnit: 'pts',
    targetScore: 25,
    coinSymbol: 'FLAPPY',
    hidden: false,
  },
  {
    id: 'crossyneonroad',
    title: 'Crossy Neon Road',
    genre: 'Arcade / Casual',
    icon: '🐔',
    path: '/games/crossyneonroad/index.html',
    preview: '/images/crossy_neon_road_preview.png',
    description: 'Hilf dem Neon-Huhn, die Strassen und Fluesse zu ueberqueren. Sammle Leben & weiche Hindernissen aus!',
    scoreUnit: 'm',
    targetScore: 40,
    coinSymbol: 'CROSSY',
    hidden: true,
  },
  {
    id: 'neonstacking',
    title: 'Neon Stacking',
    genre: 'Arcade / Stacking',
    icon: '🧱',
    path: '/games/neonstacking/index.html',
    preview: '/images/neon_stacking_preview.png',
    description: 'Stapele die Neon-Bloecke so praezise wie moeglich! Schneide ueberstehende Kanten ab. Touch-optimiert.',
    scoreUnit: 'pts',
    targetScore: 15,
    coinSymbol: 'STACK',
    hidden: true,
  },
];

export const HUB_GAMES: HubGameConfig[] = BASE_HUB_GAMES.map((g) => ({
  ...g,
  status: g.hidden ? 'hidden' : 'active',
  maintenanceMessage: null,
}));

/**
 * Scans filesystem for any newly added games in frontend/public/games
 */
function discoverFilesystemGames(): Omit<HubGameConfig, 'status' | 'maintenanceMessage'>[] {
  const discovered: Omit<HubGameConfig, 'status' | 'maintenanceMessage'>[] = [...BASE_HUB_GAMES];
  const knownIds = new Set(BASE_HUB_GAMES.map((g) => g.id.toLowerCase()));

  const possiblePaths = [
    path.join(__dirname, '../../../frontend/public/games'),
    path.join(process.cwd(), 'frontend/public/games'),
    path.join(__dirname, '../../frontend/public/games'),
    path.join(process.cwd(), 'public/games'),
  ];

  const gamesDir = possiblePaths.find((p) => fs.existsSync(p));
  if (gamesDir) {
    try {
      const items = fs.readdirSync(gamesDir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const dirName = item.name.toLowerCase();
          if (!knownIds.has(dirName)) {
            const formattedTitle = item.name
              .replace(/[-_]/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());

            discovered.push({
              id: dirName,
              title: formattedTitle,
              genre: 'Arcade / Custom',
              icon: '🕹️',
              path: `/games/${dirName}/index.html`,
              preview: `/images/${dirName}_preview.png`,
              description: `Spiele ${formattedTitle} im CoinCade Hub!`,
              scoreUnit: 'pts',
              targetScore: 100,
              coinSymbol: dirName.substring(0, 5).toUpperCase(),
              hidden: true,
            });
            knownIds.add(dirName);
          }
        }
      }
    } catch (e) {
      console.warn('[GAMES AUTO-DISCOVERY] Scan note:', e);
    }
  }

  return discovered;
}

/**
 * Returns all hub games with their latest live database statuses and maintenance messages
 */
export async function getDynamicGamesList(): Promise<HubGameConfig[]> {
  const allBaseGames = discoverFilesystemGames();

  try {
    const hasTable = await db.schema.hasTable('hub_game_settings');
    if (!hasTable) {
      return allBaseGames.map((g) => ({
        ...g,
        status: g.hidden ? 'hidden' : 'active',
        maintenanceMessage: null,
      }));
    }

    const settingsRows = await db('hub_game_settings').select('*');
    const settingsMap = new Map(settingsRows.map((r: any) => [r.game_id, r]));

    return allBaseGames.map((base) => {
      const dbSetting = settingsMap.get(base.id);
      const status: GameStatus = dbSetting?.status || (base.hidden ? 'hidden' : 'active');
      const maintenanceMessage = dbSetting?.maintenance_message || null;
      const targetScore = dbSetting?.target_score || base.targetScore;

      return {
        ...base,
        targetScore,
        status,
        maintenanceMessage,
        hidden: status === 'hidden',
      };
    });
  } catch (err) {
    console.warn('[GAMES CONFIG] Database query note:', err);
    return allBaseGames.map((g) => ({
      ...g,
      status: g.hidden ? 'hidden' : 'active',
      maintenanceMessage: null,
    }));
  }
}

/**
 * Returns a specific game by ID with live database status
 */
export async function getDynamicGame(gameId: string): Promise<HubGameConfig | undefined> {
  const all = await getDynamicGamesList();
  return all.find((g) => g.id.toLowerCase() === gameId.toLowerCase());
}

/**
 * Returns only actively playable / visible games (active or maintenance)
 */
export async function getActivePlayableGames(): Promise<HubGameConfig[]> {
  const all = await getDynamicGamesList();
  return all.filter((g) => g.status === 'active' || g.status === 'maintenance');
}

/**
 * Updates game status, maintenance message, and target score in database
 */
export async function updateGameSettingsInDb(
  gameId: string,
  status: GameStatus,
  maintenanceMessage?: string | null,
  targetScore?: number
): Promise<HubGameConfig> {
  const gId = gameId.toLowerCase();
  const now = new Date().toISOString();

  const existing = await db('hub_game_settings').where({ game_id: gId }).first();
  if (existing) {
    const updateData: any = {
      status,
      updated_at: now,
    };
    if (maintenanceMessage !== undefined) updateData.maintenance_message = maintenanceMessage;
    if (targetScore !== undefined) updateData.target_score = targetScore;

    await db('hub_game_settings').where({ game_id: gId }).update(updateData);
  } else {
    await db('hub_game_settings').insert({
      game_id: gId,
      status,
      maintenance_message: maintenanceMessage || null,
      target_score: targetScore || 100,
      created_at: now,
      updated_at: now,
    });
  }

  const updated = await getDynamicGame(gId);
  return updated || {
    id: gId,
    title: gId,
    genre: 'Arcade',
    icon: '🎮',
    path: `/games/${gId}/index.html`,
    scoreUnit: 'pts',
    targetScore: targetScore || 100,
    coinSymbol: gId.toUpperCase(),
    status,
    maintenanceMessage,
  };
}

export function getRegisteredGame(gameId: string): HubGameConfig | undefined {
  return HUB_GAMES.find((g) => g.id.toLowerCase() === gameId.toLowerCase());
}

export function getVisibleGames(): HubGameConfig[] {
  return HUB_GAMES.filter((g) => !g.hidden && g.status !== 'hidden');
}
