"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load environment variables from the root or local folder
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
const databaseUrl = process.env.DATABASE_URL || 'sqlite://./local.db';
const isPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');
let connectionConfig;
let clientName;
if (isPostgres) {
    clientName = 'pg';
    connectionConfig = {
        connectionString: databaseUrl,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
}
else {
    clientName = 'sqlite3';
    // Strip sqlite:// prefix if present
    const filePath = databaseUrl.replace(/^sqlite:\/\//, '');
    connectionConfig = {
        filename: path.resolve(__dirname, filePath),
    };
}
const fs = __importStar(require("fs"));
const distMigrations = path.join(__dirname, './dist/database/migrations');
const srcMigrations = path.join(__dirname, './src/database/migrations');
const migrationDir = fs.existsSync(distMigrations) && process.env.NODE_ENV === 'production' ? distMigrations : srcMigrations;
const migrationExt = migrationDir === distMigrations ? 'js' : 'ts';
const config = {
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
            afterCreate: (conn, cb) => {
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
exports.default = config;
