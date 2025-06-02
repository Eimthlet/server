import express from 'express';
import db from '../config/database.js';
import { authenticateUser, isAdmin } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Route to run the total_questions migration
router.post('/run-total-questions-migration', authenticateUser, isAdmin, async (req, res) => {
  try {
    console.log('Running total_questions migration');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'add_total_questions_column.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
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
      res.json({ 
        success: true, 
        message: 'Migration completed successfully. The total_questions column has been added to user_quiz_attempts table.' 
      });
    } else {
      console.error('Migration failed: column not found after migration');
      res.status(500).json({ 
        success: false, 
        error: 'Migration failed: column not found after migration' 
      });
    }
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Migration failed', 
      details: error.message || 'Unknown error' 
    });
  }
});

export default router;
