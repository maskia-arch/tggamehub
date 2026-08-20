import db from '../database/client';
import { config } from '../config';

export interface UserEnergyInfo {
  currentEnergy: number;
  maxEnergy: number;
  nextRechargeInSeconds: number;
  lastEnergyValue: number;
  lastEnergyUpdatedAt: Date;
  isTimeBoosterActive: boolean;
  timeBoosterSecondsLeft: number;
  seasonPassType: 'NONE' | 'SEASON' | 'VIP';
}

/**
 * Calculates current user energy based on DB state, elapsed time, and pass features.
 */
export function calculateEnergy(
  lastValue: number,
  lastUpdatedAt: Date,
  seasonPassType: 'NONE' | 'SEASON' | 'VIP' = 'NONE',
  timeBoosterUntil: Date | null = null,
  now: Date = new Date()
): UserEnergyInfo {
  const elapsedMs = now.getTime() - lastUpdatedAt.getTime();
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const cooldown = config.energyRechargeInterval;

  // Season Pass / VIP Pass increases max energy cap to 8 (otherwise 5)
  const maxEnergy = (seasonPassType === 'SEASON' || seasonPassType === 'VIP') ? 8 : config.maxEnergy;

  // Time booster check
  let isTimeBoosterActive = false;
  let timeBoosterSecondsLeft = 0;
  if (timeBoosterUntil && new Date(timeBoosterUntil).getTime() > now.getTime()) {
    isTimeBoosterActive = true;
    timeBoosterSecondsLeft = Math.max(0, Math.floor((new Date(timeBoosterUntil).getTime() - now.getTime()) / 1000));
  }

  if (lastValue >= maxEnergy) {
    return {
      currentEnergy: lastValue,
      maxEnergy,
      nextRechargeInSeconds: 0,
      lastEnergyValue: lastValue,
      lastEnergyUpdatedAt: lastUpdatedAt,
      isTimeBoosterActive,
      timeBoosterSecondsLeft,
      seasonPassType,
    };
  }

  const gainedEnergy = Math.floor(elapsedSeconds / cooldown);
  const currentEnergy = Math.min(maxEnergy, lastValue + gainedEnergy);

  let nextRechargeInSeconds = 0;
  let updatedUpdatedAt = lastUpdatedAt;

  if (currentEnergy < maxEnergy) {
    const remainderSeconds = elapsedSeconds % cooldown;
    nextRechargeInSeconds = cooldown - remainderSeconds;
    updatedUpdatedAt = new Date(now.getTime() - remainderSeconds * 1000);
  } else {
    updatedUpdatedAt = now;
  }

  return {
    currentEnergy,
    maxEnergy,
    nextRechargeInSeconds,
    lastEnergyValue: currentEnergy,
    lastEnergyUpdatedAt: updatedUpdatedAt,
    isTimeBoosterActive,
    timeBoosterSecondsLeft,
    seasonPassType,
  };
}

/**
 * Gets user energy details, updating the database if calculations show energy has recharged.
 */
export async function getAndUpdateUserEnergy(userId: string): Promise<UserEnergyInfo> {
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  const lastUpdatedAt = new Date(user.energy_updated_at || now);
  const passType: 'NONE' | 'SEASON' | 'VIP' = user.season_pass_type || 'NONE';
  const boosterUntil = user.time_booster_until ? new Date(user.time_booster_until) : null;

  const info = calculateEnergy(user.energy_value, lastUpdatedAt, passType, boosterUntil, now);

  // Write back to DB if energy was gained
  if (info.currentEnergy !== user.energy_value || info.lastEnergyUpdatedAt.getTime() !== lastUpdatedAt.getTime()) {
    await db('users')
      .where({ id: userId })
      .update({
        energy_value: info.currentEnergy,
        energy_updated_at: info.lastEnergyUpdatedAt,
      });
  }

  return info;
}

/**
 * Consumes exactly 1 energy point to start a game (or 0 energy if Time Booster is active).
 * Returns true if successful, false if insufficient energy.
 */
export async function consumeEnergy(userId: string): Promise<boolean> {
  return await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).forUpdate().first();
    if (!user) return false;

    const now = new Date();
    const lastUpdatedAt = new Date(user.energy_updated_at || now);
    const passType: 'NONE' | 'SEASON' | 'VIP' = user.season_pass_type || 'NONE';
    const boosterUntil = user.time_booster_until ? new Date(user.time_booster_until) : null;

    const info = calculateEnergy(user.energy_value, lastUpdatedAt, passType, boosterUntil, now);

    // If Time Booster is active, energy consumption is 0! Game starts free!
    if (info.isTimeBoosterActive) {
      return true;
    }

    if (info.currentEnergy < 1) {
      return false; // Insufficient energy
    }

    const newEnergy = info.currentEnergy - 1;
    const newUpdatedAt = newEnergy < info.maxEnergy ? info.lastEnergyUpdatedAt : now;

    await trx('users')
      .where({ id: userId })
      .update({
        energy_value: newEnergy,
        energy_updated_at: newUpdatedAt,
      });

    return true;
  });
}

/**
 * Adds energy to a user (e.g. from an ad reward or purchase).
 */
export async function addEnergy(userId: string, amount: number, allowExceedMax: boolean = true): Promise<UserEnergyInfo> {
  return await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).forUpdate().first();
    if (!user) throw new Error('User not found');

    const now = new Date();
    const lastUpdatedAt = new Date(user.energy_updated_at || now);
    const passType: 'NONE' | 'SEASON' | 'VIP' = user.season_pass_type || 'NONE';
    const boosterUntil = user.time_booster_until ? new Date(user.time_booster_until) : null;

    const info = calculateEnergy(user.energy_value, lastUpdatedAt, passType, boosterUntil, now);

    let newEnergy = info.currentEnergy + amount;
    if (!allowExceedMax) {
      newEnergy = Math.min(info.maxEnergy, newEnergy);
    }

    const newUpdatedAt = newEnergy < info.maxEnergy ? info.lastEnergyUpdatedAt : now;

    await trx('users')
      .where({ id: userId })
      .update({
        energy_value: newEnergy,
        energy_updated_at: newUpdatedAt,
      });

    return {
      ...info,
      currentEnergy: newEnergy,
      nextRechargeInSeconds: newEnergy < info.maxEnergy ? info.nextRechargeInSeconds : 0,
      lastEnergyValue: newEnergy,
      lastEnergyUpdatedAt: newUpdatedAt,
    };
  });
}
