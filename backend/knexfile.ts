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

const config: { [key: string]: Knex.Config } = {
  development: {
    client: clientName,
    connection: connectionConfig,
    useNullAsDefault: !isPostgres,
    migrations: {
      directory: path.join(__dirname, './src/database/migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, './src/database/seeds'),
    },
    pool: isPostgres ? { min: 2, max: 20 } : {
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
      directory: path.join(__dirname, './src/database/migrations'),
      extension: 'js',
    },
    pool: isPostgres ? { min: 2, max: 50 } : undefined,
  }
};

export default config;
