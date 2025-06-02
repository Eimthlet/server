import db from '../config/database.js';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(fileURLToPath(import.meta.url), '..');
const migrationsDir = join(__dirname, 'postgres.sql');

async function runMigrations() {
  try {
    // Read the SQL file
    const sql = readFileSync(migrationsDir, 'utf8');
    
    // Split into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    // Run each statement
    for (const stmt of statements) {
      console.log(`Executing migration: ${stmt.trim().substring(0, 50)}...`);
      await db.none(stmt);
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

runMigrations();
