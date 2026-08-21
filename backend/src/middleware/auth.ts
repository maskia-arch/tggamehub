import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { config } from '../config';

// Interface extending Express Request to append the authenticated user details
export interface AuthenticatedRequest extends Request {
  telegramUser?: {
    id: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    [key: string]: any;
  };
}

/**
 * Validates the raw initData string sent from the Telegram Mini App.
 * Verification logic matches official Telegram API specifications:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData: string, botToken: string): { isValid: boolean; user?: any } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { isValid: false };

    // Collect all parameters except hash, sort alphabetically
    const keys = Array.from(params.keys()).filter((k) => k !== 'hash');
    keys.sort();

    const dataCheckString = keys
      .map((key) => `${key}=${params.get(key)}`)
      .join('\n');

    // Step 1: HMAC-SHA256 of "WebAppData" with bot token as key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Step 2: HMAC-SHA256 of dataCheckString with the secretKey
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Step 3: Compare calculated hash with the hash from client
    if (calculatedHash !== hash) {
      return { isValid: false };
    }

    // Step 4: Validate auth date freshness (prevent replay attacks, e.g., max 24 hours age)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const maximumAge = 86400; // 24 hours in seconds
    
    if (now - authDate > maximumAge) {
      return { isValid: false }; // Stale token
    }

    // Parse user object
    const userJson = params.get('user');
    const user = userJson ? JSON.parse(userJson) : null;

    return { isValid: true, user };
  } catch (err) {
    console.error('Error validating Telegram initData:', err);
    return { isValid: false };
  }
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token format must be Bearer <initData>' });
  }

  const initData = parts[1];

  const isLocalRequest =
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1' ||
    req.ip === '127.0.0.1' ||
    req.ip === '::1' ||
    req.ip === '::ffff:127.0.0.1';

  // Dev mode mock login fallback (e.g. dev_999999 or dev_1234)
  if ((config.nodeEnv === 'development' || isLocalRequest) && (initData.startsWith('dev_') || !initData)) {
    const devParts = (initData || 'dev_999999').split('_ref_');
    const rawId = devParts[0].startsWith('dev_') ? devParts[0].substring(4) : devParts[0];
    const userId = rawId || '999999';
    const startParam = devParts[1] || undefined;
    req.telegramUser = {
      id: userId,
      username: 'coincade_dev',
      first_name: 'CoinCade',
      last_name: 'Dev',
      startParam: startParam,
      isGuest: false,
    };
    return next();
  }

  // Web Guest Account (Ephemaral browser session without Telegram WebApp context)
  if (initData.startsWith('guest_')) {
    const guestId = initData.trim();
    req.telegramUser = {
      id: guestId,
      username: `guest_${guestId.substring(6, 12)}`,
      first_name: 'Guest Player',
      last_name: '(Web)',
      isGuest: true,
    };
    return next();
  }

  // Production HMAC verification
  const verification = verifyTelegramInitData(initData, config.telegramBotToken);

  if (!verification.isValid || !verification.user || !verification.user.id) {
    if (config.nodeEnv === 'development' || isLocalRequest) {
      req.telegramUser = {
        id: '999999',
        username: 'coincade_dev',
        first_name: 'CoinCade',
        last_name: 'Dev',
      };
      return next();
    }
    return res.status(403).json({ error: 'Invalid or expired Telegram signature' });
  }

  // Parse start_param from Telegram query string
  const params = new URLSearchParams(initData);
  const startParam = params.get('start_param') || undefined;

  // Telegram user IDs are numbers, cast them to string for database safety and consistency
  req.telegramUser = {
    id: verification.user.id.toString(),
    username: verification.user.username,
    first_name: verification.user.first_name,
    last_name: verification.user.last_name,
    startParam: startParam,
  };

  next();
}
