import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import db from '../database/client';
import * as crypto from 'crypto';
import { config } from '../config';
import { getCoinEurRate } from '../services/rates';
import { addEnergy } from '../services/energy';
import { recordShopRevenueContribution } from '../services/seasonService';

export interface ShopProduct {
  name: string;
  category: 'energy' | 'time_booster' | 'passes' | 'game_booster';
  description: string;
  priceEur: number;
  badge?: string;
  energyAmount?: number;
  boosterHours?: number;
  passType?: 'SEASON' | 'VIP';
}

// Shop Products definition
export const PRODUCTS: Record<string, ShopProduct> = {
  // Category 1: Energie Refills
  quick_refill: {
    name: 'Quick Refill',
    category: 'energy',
    description: '+5 Energie (Sofort-Auffüllung)',
    priceEur: 0.99,
    badge: 'Schnellstart',
    energyAmount: 5,
  },
  grinder_pack: {
    name: 'Grinder Pack',
    category: 'energy',
    description: '+15 Energie (Überfüllung des Caps erlaubt)',
    priceEur: 2.49,
    badge: 'Beliebt',
    energyAmount: 15,
  },
  whale_stack: {
    name: 'Whale Stack',
    category: 'energy',
    description: '+40 Energie',
    priceEur: 5.99,
    badge: 'Bester Wert (-40%)',
    energyAmount: 40,
  },

  // Category 2: Time Booster
  sprint_pass: {
    name: 'Sprint Pass',
    category: 'time_booster',
    description: '3 Stunden unbegrenzt spielen (0 ⚡ Verbrauch)',
    priceEur: 1.99,
    boosterHours: 3,
  },
  session_lock: {
    name: 'Session Lock',
    category: 'time_booster',
    description: '6 Stunden unbegrenzt spielen (0 ⚡ Verbrauch)',
    priceEur: 3.49,
    boosterHours: 6,
  },
  day_trader: {
    name: 'Day Trader',
    category: 'time_booster',
    description: '12 Stunden unbegrenzt spielen (0 ⚡ Verbrauch)',
    priceEur: 5.99,
    boosterHours: 12,
  },
  all_nighter: {
    name: 'All-Nighter',
    category: 'time_booster',
    description: '24 Stunden unbegrenzt spielen (0 ⚡ Verbrauch)',
    priceEur: 8.99,
    badge: '24h Non-Stop',
    boosterHours: 24,
  },

  // Category 3: Season Pässe
  season_pass: {
    name: 'Season Pass',
    category: 'passes',
    description: 'Permanentes Energie-Cap von 8 (statt 5), 15 tägliche Ads & 1x täglicher Free-Refill (+5 ⚡).',
    priceEur: 9.99,
    passType: 'SEASON',
    energyAmount: 5,
  },
  vip_airdrop_pass: {
    name: 'VIP Airdrop Pass',
    category: 'passes',
    description: 'Alle Season-Pass Vorteile + 1.25x Pkt-Multiplikator & exklusiver VIP-Badge.',
    priceEur: 19.99,
    badge: 'Max Rewards',
    passType: 'VIP',
    energyAmount: 5,
  },

  // Legacy fallback aliases
  booster_5: { name: 'Quick Refill', category: 'energy', description: '+5 Energie', priceEur: 0.99, energyAmount: 5 },
  booster_15: { name: 'Grinder Pack', category: 'energy', description: '+15 Energie', priceEur: 2.49, energyAmount: 15 },
  booster_50: { name: 'Whale Stack', category: 'energy', description: '+40 Energie', priceEur: 5.99, energyAmount: 40 },
};

/**
 * UTILITY: Fulfills a paid product order (credits energy, time booster, or season pass).
 */
export async function fulfillProductOrder(userId: string, productId: string, orderAmountEur: number) {
  const product = PRODUCTS[productId];
  if (!product) return;

  const now = new Date();

  if (product.category === 'energy' && product.energyAmount) {
    await addEnergy(userId, product.energyAmount, true);
    console.log(`[Shop Fulfill] Credited +${product.energyAmount} energy to user ${userId}`);
  } else if (product.category === 'time_booster' && product.boosterHours) {
    const user = await db('users').where({ id: userId }).first();
    if (user) {
      const currentUntil = user.time_booster_until ? new Date(user.time_booster_until) : null;
      let newUntilMs = now.getTime();
      if (currentUntil && currentUntil.getTime() > now.getTime()) {
        newUntilMs = currentUntil.getTime() + product.boosterHours * 3600 * 1000;
      } else {
        newUntilMs = now.getTime() + product.boosterHours * 3600 * 1000;
      }
      await db('users')
        .where({ id: userId })
        .update({ time_booster_until: new Date(newUntilMs) });
      console.log(`[Shop Fulfill] Activated Time Booster (${product.boosterHours}h) until ${new Date(newUntilMs).toISOString()} for user ${userId}`);
    }
  } else if (product.category === 'passes' && product.passType) {
    await db('users')
      .where({ id: userId })
      .update({ season_pass_type: product.passType });
    if (product.energyAmount) {
      await addEnergy(userId, product.energyAmount, true);
    }
    console.log(`[Shop Fulfill] Activated ${product.passType} Pass for user ${userId}`);
  }

  // Contribute 30% revenue to Season Airdrop Pot
  await recordShopRevenueContribution(Number(orderAmountEur));
}

/**
 * UTILITY: Helper to verify wallet-to-storefront HMAC signatures
 */
function verifyWalletSignature(req: Request): boolean {
  const signature = req.headers['x-pure-wallet-signature'] as string;
  if (!signature || typeof signature !== 'string') return false;

  const bodyStr = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', config.shopWebhookSecret)
    .update(bodyStr)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ============================================================================
// A. WEBAPP / USER SHOP ENDPOINTS
// ============================================================================

/**
 * GET /api/shop/products
 */
export async function getShopProducts(_req: Request, res: Response) {
  return res.json({
    products: Object.entries(PRODUCTS).map(([id, p]) => ({ id, ...p }))
  });
}

/**
 * POST /api/shop/checkout
 */
export async function createCheckout(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.telegramUser?.id;
    const { productId, coin = 'LTC' } = req.body;
    const coinCode = coin.toUpperCase();

    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }

    const product = PRODUCTS[productId];
    if (!product) {
      return res.status(400).json({ error: 'Invalid product selection' });
    }

    // Ensure user row exists in DB
    let user = await db('users').where({ id: userId }).first();
    if (!user) {
      await db('users').insert({
        id: userId,
        username: req.telegramUser?.username || null,
        first_name: req.telegramUser?.first_name || null,
        last_name: req.telegramUser?.last_name || null,
        energy_value: 5,
        energy_updated_at: new Date(),
      }).onConflict('id').ignore();
    }

    // Auto-recycle expired pending allocations
    const nowIso = new Date().toISOString();
    const expiredOrders = await db('shop_orders')
      .where('status', 'pending')
      .where('expires_at', '<', nowIso);

    for (const exp of expiredOrders) {
      await db('shop_orders').where({ id: exp.id }).update({ status: 'expired' });
      await db('wallet_address_pool').where({ address: exp.address }).update({ is_used: false });
    }

    // Allocate an unused address from the wallet pool for this coin
    const poolAddress = await db('wallet_address_pool')
      .where({ coin: coinCode, is_used: false })
      .orderBy('address_index', 'asc')
      .first();

    let allocatedAddress = poolAddress?.address;

    if (!allocatedAddress) {
      // Fallback to any address for that coin in pool or default HD address
      const anyAddress = await db('wallet_address_pool')
        .where({ coin: coinCode })
        .first();
      
      if (anyAddress) {
        allocatedAddress = anyAddress.address;
      } else {
        allocatedAddress = coinCode === 'BTC'
          ? 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
          : (coinCode === 'ETH'
            ? '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
            : (coinCode === 'SOL'
              ? 'BdqfbRJTPUke6uGLZ2zT9FkmZCMCdg7S8GckWjFz7Woc'
              : 'ltc1q9a2t2p33wlyjvevve5rld2zvevdvx05p73dlnq'));
      }
    } else {
      await db('wallet_address_pool')
        .where({ id: poolAddress.id })
        .update({ is_used: true });
    }

    // Fetch coin rates and calculate crypto amount
    const rate = await getCoinEurRate(coinCode);
    const decimals = coinCode === 'SOL' ? 6 : 8;
    const cryptoAmount = Math.round((product.priceEur / rate) * Math.pow(10, decimals)) / Math.pow(10, decimals);

    const orderId = 'order_' + crypto.randomBytes(8).toString('hex');
    const durationMins = 30;
    const expiresAt = new Date(Date.now() + durationMins * 60 * 1000).toISOString();

    await db('shop_orders').insert({
      id: orderId,
      user_id: userId,
      product_id: productId,
      amount_eur: product.priceEur,
      amount_crypto: cryptoAmount,
      coin: coinCode,
      address: allocatedAddress,
      status: 'pending',
      expires_at: expiresAt,
    });

    console.log(`[Shop] Order ${orderId} created. Linked address ${allocatedAddress} (${coinCode})`);

    return res.json({
      orderId,
      productId,
      name: product.name,
      address: allocatedAddress,
      amountCrypto: cryptoAmount,
      amountEur: product.priceEur,
      coin: coinCode,
      expiresAt,
    });
  } catch (error: any) {
    console.error('[SHOP CHECKOUT ERROR]:', error.message || error);
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
}

/**
 * GET/POST /api/adsgram/reward
 * Server-to-Server Webhook handler for Adsgram Rewarded Video ad completions.
 */
export async function handleAdsgramReward(req: Request, res: Response) {
  try {
    const rawUserId = (
      req.query.userid ||
      req.query.user_id ||
      req.query.userId ||
      req.body.userid ||
      req.body.user_id ||
      req.body.userId ||
      req.query.custom_data ||
      req.body.custom_data
    ) as string;
    
    if (rawUserId) {
      const cleanUserId = String(rawUserId).replace(/[\[\]]/g, '').trim();
      if (cleanUserId) {
        const { addEnergy } = require('../services/energy');
        await addEnergy(cleanUserId, 1, false);
        console.log(`[ADSGRAM REWARD S2S]: Credited +1 energy to user ${cleanUserId}`);
      }
    }
    
    return res.status(200).json({ success: true, message: 'Reward acknowledged' });
  } catch (err: any) {
    console.error('[ADSGRAM REWARD S2S ERROR]:', err.message);
    return res.status(200).json({ success: true });
  }
}


/**
 * GET /api/shop/order/status/:orderId
 */
export async function getOrderStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const { orderId } = req.params;
    const userId = req.telegramUser?.id;

    if (!userId) {
      return res.status(400).json({ error: 'User context not found' });
    }

    const order = await db('shop_orders').where({ id: orderId, user_id: userId }).first();
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({
      orderId: order.id,
      status: order.status,
      productId: order.product_id,
      amountEur: order.amount_eur,
      amountCrypto: order.amount_crypto,
      coin: order.coin,
      address: order.address,
      paid_at: order.paid_at,
    });
  } catch (error) {
    console.error('Error fetching order status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ============================================================================
// B. WALLET SYNC & WEBHOOK ENDPOINTS (SECURED VIA HMAC)
// ============================================================================

export async function getActivePayments(req: Request, res: Response) {
  try {
    const secret = req.headers.authorization?.replace('Bearer ', '') || '';
    if (secret !== config.shopWebhookSecret) {
      return res.status(403).json({ error: 'Unauthorized secret token' });
    }

    const activeOrders = await db('shop_orders')
      .whereIn('status', ['pending', 'partially_paid', 'detected']);

    const payments = activeOrders.map((o) => ({
      order_id: o.id,
      amount_eur: Number(o.amount_eur),
      amount_ltc: Number(o.amount_crypto),
      coin: o.coin,
      address: o.address,
      status: o.status,
      created_at: new Date(o.created_at).toISOString(),
      expires_at: new Date(o.expires_at).toISOString(),
    }));

    return res.json({ payments });
  } catch (error) {
    console.error('Error listing active payments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAddressPoolStatus(req: Request, res: Response) {
  try {
    const secret = req.headers.authorization?.replace('Bearer ', '') || '';
    if (secret !== config.shopWebhookSecret) {
      return res.status(403).json({ error: 'Unauthorized secret token' });
    }

    const coin = (req.query.coin as string || 'LTC').toUpperCase();

    const countRes = await db('wallet_address_pool')
      .where({ coin, is_used: false })
      .count('id as count')
      .first();
    const count = countRes ? parseInt(countRes.count as string, 10) : 0;

    const firstAddress = await db('wallet_address_pool')
      .where({ coin, is_used: false })
      .orderBy('address_index', 'asc')
      .first();

    return res.json({
      count,
      first_address: firstAddress?.address || null,
    });
  } catch (error) {
    console.error('Error fetching pool status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function pushAddressPool(req: Request, res: Response) {
  try {
    if (!verifyWalletSignature(req)) {
      return res.status(403).json({ error: 'Invalid HMAC signature validation' });
    }

    const { coin, addresses } = req.body;
    const coinCode = coin.toUpperCase();

    if (!Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses array is required' });
    }

    // Clear existing unused pool addresses for this coin so obsolete/seed addresses don't linger
    await db('wallet_address_pool')
      .where({ coin: coinCode, is_used: false })
      .delete();

    let added = 0;
    for (const addr of addresses) {
      if (!addr || !addr.address) continue;
      const addrIndex = typeof addr.index === 'number' ? addr.index : (typeof addr.address_index === 'number' ? addr.address_index : 0);
      try {
        await db('wallet_address_pool')
          .insert({
            coin: coinCode,
            address: addr.address,
            address_index: addrIndex,
            is_used: false,
          })
          .onConflict('address')
          .merge({
            address_index: addrIndex,
            is_used: false,
          });
        added++;
      } catch (err: any) {
        console.warn(`[Shop Pool Insert Warning] Failed to insert address ${addr.address}:`, err.message);
      }
    }

    console.log(`[Shop] Pool sync complete. Loaded ${added} active addresses for ${coinCode} (total sent: ${addresses.length}).`);

    return res.json({ success: true, count: addresses.length, added });
  } catch (error) {
    console.error('Error pushing addresses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function processWalletCallback(req: Request, res: Response) {
  try {
    if (!verifyWalletSignature(req)) {
      return res.status(403).json({ error: 'Invalid HMAC signature validation' });
    }

    const { order_id, status } = req.body;

    const order = await db('shop_orders').where({ id: order_id }).first();
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== status) {
      const isPaidTransition = status === 'paid' && order.status !== 'paid';

      await db('shop_orders')
        .where({ id: order_id })
        .update({
          status,
          paid_at: isPaidTransition ? new Date() : order.paid_at,
        });

      console.log(`[Shop] Order ${order_id} transitioned status: ${order.status} -> ${status}`);

      if (isPaidTransition) {
        await fulfillProductOrder(order.user_id, order.product_id, Number(order.amount_eur));
      }
      
      if (status === 'expired') {
        await db('wallet_address_pool')
          .where({ address: order.address })
          .update({ is_used: false });
        console.log(`[Shop] Released address ${order.address} back to pool (order expired)`);
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error processing wallet callback:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getSyncQueue(req: Request, res: Response) {
  const secret = req.headers.authorization?.replace('Bearer ', '') || '';
  if (secret !== config.shopWebhookSecret) {
    return res.status(403).json({ error: 'Unauthorized secret token' });
  }
  return res.json({ queue: [] });
}

export async function clearSyncQueue(req: Request, res: Response) {
  if (!verifyWalletSignature(req)) {
    return res.status(403).json({ error: 'Invalid HMAC signature validation' });
  }
  return res.json({ success: true });
}
