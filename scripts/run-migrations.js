import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        run_on TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE(name)
      );
    `);
    
    // Get list of applied migrations
    const { rows: appliedMigrations } = await client.query('SELECT name FROM migrations ORDER BY id');
    const appliedMigrationNames = new Set(appliedMigrations.map(m => m.name));
    
    // Read migration files
    const files = await fs.readdir(MIGRATIONS_DIR);
    const migrationFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    console.log(`Found ${migrationFiles.length} migration files`);
    
    let migrationsRun = 0;
    
    for (const file of migrationFiles) {
      if (!appliedMigrationNames.has(file)) {
        console.log(`Running migration: ${file}`);
        const migrationSQL = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        
        // Execute the entire migration as a single statement
        try {
          await client.query(migrationSQL);
        } catch (error) {
          console.error(`Error executing migration ${file}:`, error.message);
          throw error;
        }
        
        // Record the migration
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        migrationsRun++;
        console.log(`Successfully applied migration: ${file}`);
      } else {
        console.log(`Skipping already applied migration: ${file}`);
      }
    }
    
    await client.query('COMMIT');
    console.log(`Migrations complete. ${migrationsRun} new migrations were applied.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
