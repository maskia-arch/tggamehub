import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import db from '../database/client';
import { consumeEnergy } from '../services/energy';
import { recordUserGameActivity } from '../services/seasonService';
import { recordGameHighscore } from '../services/gameLeaderboardService';
import { processGameScoreAmmImpact, ensureAllGameCoinsInitialized } from '../services/marketEngine';
import { getDynamicGame, getDynamicGamesList, updateGameSettingsInDb, updateGamesOrderInDb, GameStatus } from '../config/games';

interface GameSessionPayload {
  userId: string;
  gameId: string;
  startedAt: number;
  sessionId?: string;
}

const consumedSessions = new Map<string, number>();

/**
 * Initiates a game session by deducting 1 energy point and issuing a signed JWT game token.
 */
export async function startGame(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    const { gameId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }
    if (!gameId) {
      return res.status(400).json({ error: 'gameId parameter is required' });
    }

    // Check live game status (Maintenance, Coming Soon, Hidden)
    const gameConfig = await getDynamicGame(gameId);
    if (!gameConfig) {
      return res.status(404).json({ error: 'game_not_found', message: 'Spiel wurde nicht gefunden.' });
    }
    if (gameConfig.status === 'maintenance') {
      return res.status(423).json({
        error: 'game_in_maintenance',
        message: gameConfig.maintenanceMessage || 'Dieses Spiel befindet sich derzeit im Wartungsmodus. Bitte versuche es später erneut.',
      });
    }
    if (gameConfig.status === 'hidden') {
      return res.status(403).json({ error: 'game_disabled', message: 'Dieses Spiel ist derzeit deaktiviert.' });
    }
    if (gameConfig.status === 'coming_soon') {
      return res.status(403).json({ error: 'game_coming_soon', message: 'Dieses Spiel befindet sich noch in der Entwicklung.' });
    }

    // Query authoritative personal highscore for this game from database
    let personalHighscore = 0;
    try {
      const userBest = await db('scores')
        .where({ game_id: gameConfig.id, user_id: userId })
        .max('score as max_score')
        .first();
      personalHighscore = userBest?.max_score ? parseInt(userBest.max_score, 10) : 0;
    } catch (err) {
      console.warn('[GAME START] Could not query user highscore:', err);
    }

    // Guest users start immediately with a signed session token
    if (req.telegramUser?.isGuest) {
      const payload: GameSessionPayload = {
        userId,
        gameId,
        startedAt: Date.now(),
      };
      const gameSessionToken = jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });
      return res.json({
        success: true,
        gameSessionToken,
        highscore: personalHighscore,
        message: 'Guest session started.',
      });
    }

    // Deduct energy for real users
    const success = await consumeEnergy(userId);
    if (!success) {
      return res.status(403).json({ 
        error: 'insufficient_energy', 
        message: 'You do not have enough energy to start a game. Wait for recharge or watch an ad.' 
      });
    }

    // Issue signed game session token (valid for 15 minutes)
    const payload: GameSessionPayload = {
      userId,
      gameId,
      startedAt: Date.now(),
    };

    const gameSessionToken = jwt.sign(payload, config.jwtSecret, { expiresIn: '15m' });

    return res.json({
      success: true,
      gameSessionToken,
      highscore: personalHighscore,
      message: 'Energy deducted. Session started.',
    });
  } catch (error) {
    console.error('Error starting game:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Validates and submits a game score.
 * Verifies JWT token signatures and checks for client manipulation (e.g. unrealistic score velocity).
 */
export async function submitScore(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    const { gameSessionToken, gameId, score, validationPayload } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }
    if (!gameSessionToken || !gameId || score === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: gameSessionToken, gameId, score' });
    }

    // Ensure score is a positive integer
    const parsedScore = parseInt(score, 10);
    if (isNaN(parsedScore) || parsedScore < 0) {
      return res.status(400).json({ error: 'Score must be a positive integer' });
    }

    // Verify JWT game session token
    let decoded: GameSessionPayload;
    try {
      decoded = jwt.verify(gameSessionToken, config.jwtSecret) as GameSessionPayload;
    } catch (err) {
      return res.status(403).json({ error: 'invalid_session_token', message: 'Game session expired or invalid.' });
    }

    // Validate token integrity
    if (decoded.userId !== userId) {
      return res.status(403).json({ error: 'tampered_session', message: 'User ID does not match session owner.' });
    }
    if (decoded.gameId !== gameId) {
      return res.status(403).json({ error: 'tampered_session', message: 'Game ID does not match session game.' });
    }

    // Guard against duplicate/double submission of the same game session
    const sessionFingerprint = `${decoded.userId}_${decoded.sessionId || decoded.startedAt}_${decoded.gameId}`;
    if (consumedSessions.has(sessionFingerprint)) {
      const user = await db('users').where({ id: userId }).first();
      return res.json({
        success: true,
        score: parsedScore,
        earnedCash: 0,
        totalCash: Number(user?.game_cash || 0.0),
        message: 'Score already processed.',
      });
    }
    consumedSessions.set(sessionFingerprint, Date.now());

    // Clean up old consumed session tokens older than 20 minutes
    if (consumedSessions.size > 5000) {
      const cutoff = Date.now() - 20 * 60 * 1000;
      for (const [k, ts] of consumedSessions.entries()) {
        if (ts < cutoff) consumedSessions.delete(k);
      }
    }

    // Check session duration to detect speed hacking/direct submission bypass
    const now = Date.now();
    const elapsedSeconds = (now - decoded.startedAt) / 1000;

    if (elapsedSeconds < 1.5) {
      return res.status(400).json({ 
        error: 'cheating_detected', 
        message: 'Game session completed too fast. Manipulation suspected.' 
      });
    }

    // Anti-cheat: Score Velocity Check (Max points per second)
    // Clicker: max 100 points/sec. Neon Jump: max 25 points/sec (platform jumps). Crossy: max 25. Neon Stacking: max 4.
    let maxVelocity = 150;
    if (gameId === 'clicker') {
      maxVelocity = 100;
    } else if (gameId === 'doodlejump') {
      maxVelocity = 25;
    } else if (gameId === 'crossyneonroad') {
      maxVelocity = 25;
    } else if (gameId === 'neonstacking') {
      maxVelocity = 8; // Accommodates +2 points on rapid perfect combos
    }

    const scoreVelocity = parsedScore / elapsedSeconds;
    if (scoreVelocity > maxVelocity && parsedScore > 50) {
      return res.status(400).json({ 
        error: 'cheating_detected', 
        message: 'Score growth rate exceeds safe threshold. Score rejected.' 
      });
    }

    // Save score to persistent history log (records all rounds including test/guest rounds for dynamic averages)
    await db('scores').insert({
      user_id: userId,
      game_id: gameId,
      score: parsedScore,
      validation_payload: validationPayload ? JSON.stringify(validationPayload) : null,
    });

    // Web Guest Accounts: Return instant feedback without polluting AMM Market or Leaderboards
    if (userId.startsWith('guest_') || req.telegramUser?.isGuest) {
      return res.json({
        success: true,
        score: parsedScore,
        earnedCash: 0,
        totalCash: 0,
        isGuest: true,
        message: 'Gast-Runde abgeschlossen! Registriere dich in Telegram, um deinen Spielstand zu sichern.',
        marketImpact: {
          targetScore: parsedScore,
          zScore: 0,
          performanceRatio: 1,
          isPositiveImpact: true,
          isRecordBreak: false,
          burnedTokens: 0,
          priceChangePercent: 0,
        },
      });
    }

    // Record score volume in Market Engine with Normalized Score Impact & AMM
    const marketResult = await processGameScoreAmmImpact(gameId, parsedScore, userId);
    let earnedCash = parseFloat(Number(marketResult.earnedCash || 0.0).toFixed(4));

    // Tutorial Bonus Guarantee for Step 2: Ensure user receives at least 0.10$ InGame$
    const currentUser = await db('users').where({ id: userId }).first();
    if (currentUser && (currentUser.tutorial_status === 'IN_PROGRESS' || currentUser.tutorial_status === 'NOT_STARTED') && Number(currentUser.tutorial_step || 1) <= 2) {
      if (earnedCash < 0.10) {
        earnedCash = 0.10;
      }
      if (currentUser.tutorial_status === 'IN_PROGRESS') {
        await db('users').where({ id: userId }).update({ tutorial_step: 3 });
      }
    }

    if (earnedCash > 0) {
      await db('users')
        .where({ id: userId })
        .increment('game_cash', earnedCash);
    }

    // Record game-specific Highscore across Daily, Weekly, Monthly, and All-Time leaderboards
    await recordGameHighscore(userId, gameId, parsedScore);

    // Record activity round & net profit for active season (only if season is currently active)
    await recordUserGameActivity(userId, earnedCash);

    // Check & award achievements
    const { checkAndAwardAchievements } = require('../services/achievementService');
    const achievementRes = await checkAndAwardAchievements(userId);

    const updatedUser = await db('users').where({ id: userId }).first();

    return res.json({
      success: true,
      score: parsedScore,
      earnedCash,
      totalCash: Number(updatedUser?.game_cash || 0.0),
      newlyUnlockedBadges: achievementRes.newlyUnlocked || [],
      marketImpact: {
        targetScore: marketResult.targetScore || 1000,
        zScore: marketResult.zScore || 0,
        performanceRatio: marketResult.performanceRatio || 0,
        isPositiveImpact: marketResult.isPositiveImpact ?? true,
        isRecordBreak: marketResult.isRecordBreak ?? false,
        burnedTokens: marketResult.burned || 0,
        priceChangePercent: marketResult.priceChangePercent || 0,
        newPrice: marketResult.newPrice,
      },
      message: earnedCash > 0
        ? `Score verbucht! Du hast +${earnedCash.toFixed(4)} Game$ erhalten!`
        : 'Score submitted successfully!',
    });
  } catch (error) {
    console.error('Error submitting score:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/game/benchmark/:gameId
 * Returns the live dynamically calculated average benchmark score derived from real SQL score history.
 */
export async function getGameBenchmark(req: AuthenticatedRequest, res: Response) {
  try {
    const { gameId } = req.params;
    if (!gameId) {
      return res.status(400).json({ error: 'gameId parameter is required' });
    }

    const { getDynamicGameBenchmark } = require('../services/marketEngine');
    const benchmark = await getDynamicGameBenchmark(gameId);
    return res.json({
      success: true,
      benchmark: {
        ...benchmark,
        targetScore: benchmark.targetScore ?? benchmark.benchmarkTarget ?? benchmark.mean,
        totalRoundsPlayed: benchmark.totalRoundsPlayed ?? benchmark.sampleSize ?? 0,
      }
    });
  } catch (error) {
    console.error('Error fetching game benchmark:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/game/benchmarks
 * Returns all game live benchmarks as a map for instant lobby display.
 */
export async function getAllGameBenchmarks(_req: AuthenticatedRequest, res: Response) {
  try {
    const { getDynamicGameBenchmark } = require('../services/marketEngine');
    const allGames = await getDynamicGamesList();
    const benchmarks: Record<string, { targetScore: number; totalRoundsPlayed: number }> = {};
    
    for (const game of allGames) {
      const gid = game.id;
      const bm = await getDynamicGameBenchmark(gid);
      benchmarks[gid] = {
        targetScore: bm.targetScore ?? bm.benchmarkTarget ?? bm.mean ?? 50,
        totalRoundsPlayed: bm.totalRoundsPlayed ?? bm.sampleSize ?? 0,
      };
    }

    return res.json({ success: true, benchmarks });
  } catch (error) {
    console.error('Error fetching all game benchmarks:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/games/catalog
 * Returns all games with live status, maintenance message, target score for frontend hub
 */
export async function getGamesCatalog(_req: Request, res: Response) {
  try {
    const games = await getDynamicGamesList();
    return res.json({
      success: true,
      games,
    });
  } catch (error) {
    console.error('Error fetching games catalog:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/dev/games/status
 * Updates game status (active, maintenance, hidden, coming_soon) & maintenance message
 */
export async function updateGameStatusHandler(req: Request, res: Response) {
  try {
    const { gameId, status, maintenanceMessage, targetScore } = req.body;
    if (!gameId || !status) {
      return res.status(400).json({ error: 'gameId and status are required' });
    }
    if (!['active', 'maintenance', 'hidden', 'coming_soon'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updated = await updateGameSettingsInDb(gameId, status as GameStatus, maintenanceMessage, targetScore);
    await ensureAllGameCoinsInitialized();
    return res.json({
      success: true,
      game: updated,
      message: `Spiel ${updated.title} Status erfolgreich auf ${status.toUpperCase()} geändert.`,
    });
  } catch (error) {
    console.error('Error updating game status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/dev/games/reorder
 * Reorders games based on an array of gameIds
 */
export async function reorderGamesHandler(req: Request, res: Response) {
  try {
    const { orderedGameIds } = req.body;
    if (!Array.isArray(orderedGameIds) || orderedGameIds.length === 0) {
      return res.status(400).json({ error: 'orderedGameIds array is required' });
    }

    const updated = await updateGamesOrderInDb(orderedGameIds);
    return res.json({
      success: true,
      games: updated,
      message: 'Reihenfolge der Spiele erfolgreich gespeichert.',
    });
  } catch (error) {
    console.error('Error reordering games:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/dev/game/sandbox-token
 * Generates an unrestricted dev/sandbox token for testing in the Game Dev Studio
 */
export async function createDevSandboxToken(req: Request, res: Response) {
  try {
    const { gameId } = req.body;
    if (!gameId) {
      return res.status(400).json({ error: 'gameId is required' });
    }

    const payload: GameSessionPayload = {
      userId: 'dev_sandbox_tester',
      gameId,
      startedAt: Date.now(),
      sessionId: `dev_${Date.now()}`,
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '4h' });

    let personalHighscore = 0;
    try {
      const userBest = await db('scores')
        .where({ game_id: gameId })
        .where('user_id', 'dev_sandbox_tester')
        .max('score as max_score')
        .first();
      personalHighscore = userBest?.max_score ? parseInt(userBest.max_score, 10) : 0;
    } catch (e) {}

    return res.json({
      success: true,
      gameSessionToken: token,
      gameId,
      highscore: personalHighscore,
      mode: 'sandbox_dev',
    });
  } catch (error) {
    console.error('Error generating dev sandbox token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

