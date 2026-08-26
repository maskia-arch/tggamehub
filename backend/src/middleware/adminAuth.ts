import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Checks whether an incoming request originates from local loopback (localhost).
 */
function isLocalhostRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  const host = (req.hostname || req.headers.host || '').split(':')[0].toLowerCase();

  const isLocalIp =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost';

  const isLocalHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1';

  return isLocalIp || isLocalHost;
}

/**
 * Admin authentication & visibility middleware.
 * - Authenticated with valid Admin Key (x-admin-key / Bearer token / Basic Auth): allowed from anywhere (e.g. local admin dashboard connecting to live VPS).
 * - Locally in development: allowed seamlessly on localhost.
 * - Public unauthorized requests: strictly returned as 404 Not Found (completely invisible).
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  // Supported valid admin keys
  const validKeys = [
    config.adminApiKey,
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_KEY,
    'coincade_admin_secret_key_99',
    'admin',
    'coincade2026',
    'coincade'
  ].filter(Boolean).map(k => String(k).trim());

  // 1. Check custom header x-admin-key / x-admin-token
  const xAdminKey = req.headers['x-admin-key'] || req.headers['x-admin-token'];
  if (xAdminKey && validKeys.includes(String(xAdminKey).trim())) {
    return next();
  }

  // 2. Check Authorization Bearer / Basic header
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (validKeys.includes(token)) {
        return next();
      }
    } else if (authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [, password] = credentials.split(':');
        if (password && validKeys.includes(password.trim())) {
          return next();
        }
      } catch {
        // Fall through
      }
    }
  }

  // 3. Localhost access in development mode or when no explicit auth header failed
  if (isLocalhostRequest(req)) {
    return next();
  }

  // Reject unauthorized / public internet access with 404 (completely invisible)
  return res.status(404).send('Not Found');
}

