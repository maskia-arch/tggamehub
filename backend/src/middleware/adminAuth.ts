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
 * - In production online environments: strictly rejects non-localhost requests with 404 (completely invisible).
 * - Locally: allows seamless execution and access on localhost.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const env = (config.nodeEnv || 'development').trim().toLowerCase();

  // In production, block all external/public internet traffic to admin routes
  if (env === 'production' && !isLocalhostRequest(req)) {
    return res.status(404).send('Not Found');
  }

  // If ADMIN_PASSWORD is set and request is authenticated via Basic Auth, verify it; otherwise allow local dev
  const adminPassword = process.env.ADMIN_PASSWORD;
  const authHeader = req.headers['authorization'];

  if (adminPassword && authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [, password] = credentials.split(':');
    if (password !== adminPassword) {
      res.setHeader('WWW-Authenticate', 'Basic realm="CoinCade Admin"');
      return res.status(401).send('Invalid credentials');
    }
  }

  return next();
}

