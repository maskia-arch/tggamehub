import type { Knex } from 'knex';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the root or local folder
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL || 'sqlite://./local.db';
const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

let connectionConfig: any;
let clientName: string;

if (isPostgres) {
  clientName = 'pg';
  connectionConfig = {
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
} else {
  clientName = 'sqlite3';
  // Strip sqlite:// prefix if present
  const filePath = databaseUrl.replace(/^sqlite:\/\//, '');
  connectionConfig = {
    filename: path.resolve(__dirname, filePath),
  };
}

import * as fs from 'fs';

// Check which migration directory exists (dist in production vs src in dev)
const distMigrations = path.join(__dirname, './dist/database/migrations');
const srcMigrations = path.join(__dirname, './src/database/migrations');
const migrationDir = fs.existsSync(distMigrations) && process.env.NODE_ENV === 'production' ? distMigrations : srcMigrations;
const migrationExt = migrationDir === distMigrations ? 'js' : 'ts';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: clientName,
    connection: connectionConfig,
    useNullAsDefault: !isPostgres,
    migrations: {
      directory: srcMigrations,
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, './src/database/seeds'),
    },
    pool: isPostgres ? { min: 2, max: 20, idleTimeoutMillis: 30000, acquireTimeoutMillis: 30000 } : {
      afterCreate: (conn: any, cb: any) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
      }
    }
  },
  production: {
    client: clientName,
    connection: connectionConfig,
    useNullAsDefault: !isPostgres,
    migrations: {
      directory: migrationDir,
      extension: migrationExt,
    },
    pool: isPostgres ? { min: 2, max: 50, idleTimeoutMillis: 30000, acquireTimeoutMillis: 30000 } : undefined,
  }
};


export default config;
