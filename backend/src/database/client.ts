import knex from 'knex';
// Load knex config dynamically to avoid rootDir inclusion issues (TS6059)
const knexConfig = require('../../knexfile').default;
import { config } from '../config';

// Automatically parse PostgreSQL NUMERIC (1700) and BIGINT (20) columns as native JavaScript numbers
try {
  const pg = require('pg');
  if (pg && pg.types) {
    pg.types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));
    pg.types.setTypeParser(20, (val: string) => (val === null ? null : parseInt(val, 10)));
  }
} catch (e) {
  // pg optional require fallback
}


const environment = config.nodeEnv === 'production' ? 'production' : 'development';
const db = knex(knexConfig[environment]);

export default db;

