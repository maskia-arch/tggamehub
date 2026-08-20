import knex from 'knex';
// Load knex config dynamically to avoid rootDir inclusion issues (TS6059)
const knexConfig = require('../../knexfile').default;
import { config } from '../config';

const environment = config.nodeEnv === 'production' ? 'production' : 'development';
const db = knex(knexConfig[environment]);

export default db;
