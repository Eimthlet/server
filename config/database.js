import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise();

// Use DATABASE_URL if provided, otherwise use individual parameters
const dbConfig = process.env.DATABASE_URL || {
  host: process.env.DATABASE_HOST || 'dpg-d0lhrbpr0fns738ddi80-a.oregon-postgres.render.com',
  port: process.env.DATABASE_PORT || 5432,
  database: process.env.DATABASE_NAME || 'postgres_tqud',
  user: process.env.DATABASE_USER || 'postgres_tqud_user',
  password: process.env.DATABASE_PASSWORD || 'nVBVefqkPY2640tlnd7ULqpQ30LzyMhB',
  ssl: { rejectUnauthorized: false }
};

const db = pgp(dbConfig);

export default db;
