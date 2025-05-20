import db from './config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('Running migrations...');
  
  try {
    // Read the quiz attempts migration file
    const attemptsPath = path.join(__dirname, 'migrations', '2025-05-20_add_quiz_attempts.sql');
    const attemptsSQL = fs.readFileSync(attemptsPath, 'utf8');
    
    // Execute the quiz attempts migration
    await db.none(attemptsSQL);
    console.log('Quiz attempts migration completed successfully!');
    
    // Read the qualification fields migration file
    const qualificationPath = path.join(__dirname, 'migrations', '2025-05-20_add_qualification_fields.sql');
    const qualificationSQL = fs.readFileSync(qualificationPath, 'utf8');
    
    // Execute the qualification fields migration
    await db.none(qualificationSQL);
    console.log('Qualification fields migration completed successfully!');
    
    // Execute each seasons migration step separately
    try {
      // Step 1: Create seasons table
      const createSeasonsPath = path.join(__dirname, 'migrations', '2025-05-20_create_seasons_table.sql');
      const createSeasonsSQL = fs.readFileSync(createSeasonsPath, 'utf8');
      await db.none(createSeasonsSQL);
      console.log('Created seasons table successfully!');
      
      // Step 2: Add default season
      const addDefaultSeasonPath = path.join(__dirname, 'migrations', '2025-05-20_add_default_season.sql');
      const addDefaultSeasonSQL = fs.readFileSync(addDefaultSeasonPath, 'utf8');
      await db.none(addDefaultSeasonSQL);
      console.log('Added default season successfully!');
      
      // Step 3: Add season references to tables
      const addReferencesPath = path.join(__dirname, 'migrations', '2025-05-20_add_season_references.sql');
      const addReferencesSQL = fs.readFileSync(addReferencesPath, 'utf8');
      await db.none(addReferencesSQL);
      console.log('Added season references successfully!');
      
      // Step 4: Update existing records with season references
      const updateReferencesPath = path.join(__dirname, 'migrations', '2025-05-20_update_season_references.sql');
      const updateReferencesSQL = fs.readFileSync(updateReferencesPath, 'utf8');
      await db.none(updateReferencesSQL);
      console.log('Updated season references successfully!');
      
      console.log('Seasons migration completed successfully!');
    } catch (seasonError) {
      console.error('Seasons migration failed:', seasonError);
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close the database connection
    db.$pool.end();
  }
}

runMigration();
