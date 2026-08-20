import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Admin authentication middleware.
 * In development mode, access is unrestricted.
 * In production, requires Basic Auth with the ADMIN_PASSWORD env var.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const env = (config.nodeEnv || 'development').trim().toLowerCase();
  // Always allow in development mode, when dev simulation is enabled, or when non-production
  if (env === 'development' || env !== 'production' || config.enableDevSimulation) {
    return next();
  }

  const adminPassword = process.env.ADMIN_PASSWORD;

  // If no password is set in production, deny all access
  if (!adminPassword) {
    return res.status(503).json({ error: 'Admin access is not configured on this server.' });
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="TG Game Hub Admin"');
    return res.status(401).send('Unauthorized');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [, password] = credentials.split(':');

  if (password !== adminPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="TG Game Hub Admin"');
    return res.status(401).send('Invalid credentials');
  }

  return next();
}
