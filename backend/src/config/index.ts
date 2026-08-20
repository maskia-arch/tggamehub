import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env files in hierarchical order
dotenv.config({ path: path.join(__dirname, '../../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: (process.env.NODE_ENV || 'development').trim(),
  telegramBotToken: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
  databaseUrl: (process.env.DATABASE_URL || 'sqlite://./local.db').trim(),
  redisUrl: (process.env.REDIS_URL || '').trim(),
  jwtSecret: (process.env.JWT_SECRET || 'local_development_only_secret_key_12345').trim(),
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').trim(),
  isPostgres: (process.env.DATABASE_URL || '').trim().startsWith('postgresql://') || (process.env.DATABASE_URL || '').trim().startsWith('postgres://'),
  // Recharge interval in seconds (1 hour = 3600 seconds)
  energyRechargeInterval: parseInt(process.env.ENERGY_RECHARGE_INTERVAL || '3600', 10),
  maxEnergy: parseInt(process.env.MAX_ENERGY || '5', 10),
  referralEnergyBonus: parseInt(process.env.REFERRAL_ENERGY_BONUS || '5', 10),
  shopWebhookSecret: (process.env.SHOP_WEBHOOK_SECRET || 'local_shop_webhook_secret_key_12345').trim(),
  adminApiKey: (process.env.ADMIN_API_KEY || process.env.ADMIN_PASSWORD || 'coincade_admin_secret_key_99').trim(),
};

// Validate critical values
if (!config.telegramBotToken) {
  console.warn('[CONFIG WARNING]: TELEGRAM_BOT_TOKEN is not set. Bot features will not function.');
}
