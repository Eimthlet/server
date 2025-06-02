import db from './config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('Running total_questions migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrations', 'add_total_questions_simple.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Migration SQL:', migrationSQL);
    
    // Execute the migration
    await db.none(migrationSQL);
    
    // Verify the migration was successful
    const columnExists = await db.oneOrNone(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user_quiz_attempts' AND column_name = 'total_questions'
    `);
    
    if (columnExists) {
      console.log('Migration successful: total_questions column added');
      
      // Update existing records
      const updatedCount = await db.result(`
        UPDATE user_quiz_attempts 
        SET total_questions = (
          SELECT COUNT(*) 
          FROM questions 
          WHERE season_id = (
            SELECT id 
            FROM seasons 
            WHERE is_active = true 
            LIMIT 1
          )
        )
        WHERE total_questions IS NULL OR total_questions = 0
      `);
      
      console.log(`Updated ${updatedCount.rowCount} existing quiz attempts with total_questions`);
    } else {
      console.error('Migration failed: column not found after migration');
    }
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    process.exit(0);
  }
}

runMigration();
