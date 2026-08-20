import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import db from '../database/client';
import { consumeEnergy } from '../services/energy';
import { submitScoreToLeaderboards } from '../services/redis';
import { recordUserGameActivity } from '../services/seasonService';

interface GameSessionPayload {
  userId: string;
  gameId: string;
  startedAt: number;
}

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

    // Deduct energy
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
    // Clicker: max 100 points/sec. Neon Jump: max 350 points/sec (fast climbs via spring boosts).
    let maxVelocity = 150;
    if (gameId === 'clicker') {
      maxVelocity = 100;
    } else if (gameId === 'doodlejump') {
      maxVelocity = 350;
    } else if (gameId === 'crossyneonroad') {
      maxVelocity = 25;
    } else if (gameId === 'neonstacking') {
      maxVelocity = 4; // Stacking blocks takes at least 0.25-0.5s per placement
    }

    const scoreVelocity = parsedScore / elapsedSeconds;
    if (scoreVelocity > maxVelocity && parsedScore > 50) {
      return res.status(400).json({ 
        error: 'cheating_detected', 
        message: 'Score growth rate exceeds safe threshold. Score rejected.' 
      });
    }

    // Save score to persistent history log
    await db('scores').insert({
      user_id: userId,
      game_id: gameId,
      score: parsedScore,
      validation_payload: validationPayload ? JSON.stringify(validationPayload) : null,
    });

    // Check if user has VIP Pass for 1.25x score multiplier
    const user = await db('users').where({ id: userId }).first();
    const isVip = user?.season_pass_type === 'VIP';
    const leaderboardScore = isVip ? Math.round(parsedScore * 1.25) : parsedScore;

    // Write to leaderboards (Redis or local memory fallback)
    await submitScoreToLeaderboards(userId, leaderboardScore);

    // Record score volume in Market Engine & award Game$ cash reward
    const { recordGameplayVolume } = require('../services/marketEngine');
    const marketResult = await recordGameplayVolume(gameId, parsedScore);
    const earnedCash = marketResult.earnedCash || 0.0;

    if (earnedCash > 0) {
      await db('users')
        .where({ id: userId })
        .increment('game_cash', earnedCash);
    }

    // Record activity round & net profit for active season
    await recordUserGameActivity(userId, earnedCash);

    const updatedUser = await db('users').where({ id: userId }).first();

    return res.json({
      success: true,
      score: parsedScore,
      earnedCash,
      totalCash: Number(updatedUser?.game_cash || 0.0),
      marketImpact: {
        targetScore: marketResult.targetScore || 1000,
        performanceRatio: marketResult.performanceRatio || 0,
        isPositiveImpact: marketResult.isPositiveImpact ?? true,
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
    return res.json({ success: true, benchmark });
  } catch (error) {
    console.error('Error fetching game benchmark:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
