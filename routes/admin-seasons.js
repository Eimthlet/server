import express from 'express';
import { authenticateUser, isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Activate a season (deactivates all others)
router.put('/:id/activate', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Start a transaction
    await db.tx(async t => {
      // First deactivate all seasons
      await t.none('UPDATE seasons SET is_active = false');
      
      // Then activate the selected season
      const result = await t.oneOrNone(
        'UPDATE seasons SET is_active = true WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (!result) {
        throw new Error('Season not found');
      }
      
      return result;
    });
    
    // Fetch the updated season with all its data
    const updatedSeason = await db.one(
      `SELECT s.*, 
              COUNT(DISTINCT q.id) as question_count,
              COUNT(DISTINCT uqa.id) as attempts_count,
              COUNT(DISTINCT CASE WHEN uqa.qualifies_for_next_round = true THEN uqa.user_id END) as qualified_users_count
       FROM seasons s
       LEFT JOIN questions q ON s.id = q.season_id
       LEFT JOIN user_quiz_attempts uqa ON s.id = uqa.season_id
       WHERE s.id = $1
       GROUP BY s.id`,
      [id]
    );
    
    res.json(updatedSeason);
  } catch (error) {
    console.error('Error activating season:', error);
    throw error;
  }
}));

// Get all seasons
router.get('/', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const seasons = await db.any(`
      SELECT * FROM seasons ORDER BY created_at DESC
    `);

    res.json(seasons);
  } catch (error) {
    console.error('Error fetching seasons:', error);
    throw error;
  }
}));

// Get a specific season by ID
router.get('/:id', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const season = await db.oneOrNone(`
      SELECT 
        s.*,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT uqa.id) as attempts_count,
        COUNT(DISTINCT CASE WHEN uqa.qualifies_for_next_round = true THEN uqa.user_id END) as qualified_users_count
      FROM 
        seasons s
      LEFT JOIN 
        questions q ON s.id = q.season_id
      LEFT JOIN 
        user_quiz_attempts uqa ON s.id = uqa.season_id
      WHERE 
        s.id = $1
      GROUP BY 
        s.id
    `, [id]);
    
    if (!season) {
      return res.status(404).json({ message: 'Season not found' });
    }
    
    res.json(season);
  } catch (error) {
    console.error('Error fetching season:', error);
    throw error;
  }
}));

// Create a new season
router.post('/', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    // Log raw request body and headers
    console.log('=== New Season Creation Request ===');
    console.log('Raw request body type:', typeof req.body);
    console.log('Raw request body:', req.body);
    console.log('Request headers:', req.headers);
    
    // Check if body is empty
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('Request body is empty or undefined');
      return res.status(400).json({ 
        message: 'Request body is empty',
        received: req.body
      });
    }
    
    // Log each field separately
    console.log('Request body fields:', {
      name: req.body.name,
      start_date: req.body.start_date,
      end_date: req.body.end_date,
      is_active: req.body.is_active,
      is_qualification_round: req.body.is_qualification_round,
      minimum_score_percentage: req.body.minimum_score_percentage
    });
    
    const { 
      name, 
      start_date, 
      end_date, 
      is_active, 
      is_qualification_round,
      minimum_score_percentage 
    } = req.body;
    
    console.log('Parsed values:', {
      name,
      start_date,
      end_date,
      is_active,
      is_qualification_round,
      minimum_score_percentage
    });
    
    // Validate required fields
    if (!name || !start_date || !end_date) {
      console.log('Validation failed - missing required fields');
      return res.status(400).json({ 
        message: 'Name, start date, and end date are required',
        received: { name, start_date, end_date }
      });
    }
    
    // If setting this season as active, deactivate all other seasons
    if (is_active) {
      await db.none(`UPDATE seasons SET is_active = false WHERE is_active = true`);
    }
    
    // Create the new season
    const newSeason = await db.one(`
      INSERT INTO seasons 
        (name, start_date, end_date, is_active, is_qualification_round, minimum_score_percentage)
      VALUES 
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      name, 
      start_date, 
      end_date, 
      is_active || false, 
      is_qualification_round || false,
      minimum_score_percentage || 50
    ]);
    
    res.status(201).json(newSeason);
  } catch (error) {
    console.error('Error creating season:', error);
    throw error;
  }
}));

// Update a season
router.put('/:id', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      start_date, 
      end_date, 
      is_active, 
      is_qualification_round,
      minimum_score_percentage 
    } = req.body;
    
    // Check if season exists
    const existingSeason = await db.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
    if (!existingSeason) {
      return res.status(404).json({ message: 'Season not found' });
    }
    
    // If setting this season as active, deactivate all other seasons
    if (is_active) {
      await db.none(`UPDATE seasons SET is_active = false WHERE id != $1`, [id]);
    }
    
    // Update the season
    const updatedSeason = await db.one(`
      UPDATE seasons 
      SET 
        name = COALESCE($1, name),
        start_date = COALESCE($2, start_date),
        end_date = COALESCE($3, end_date),
        is_active = COALESCE($4, is_active),
        is_qualification_round = COALESCE($5, is_qualification_round),
        minimum_score_percentage = COALESCE($6, minimum_score_percentage),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [
      name, 
      start_date, 
      end_date, 
      is_active, 
      is_qualification_round,
      minimum_score_percentage,
      id
    ]);
    
    res.json(updatedSeason);
  } catch (error) {
    console.error('Error updating season:', error);
    throw error;
  }
}));

// Activate a season
router.put('/:id/activate', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Deactivate all other seasons first to ensure only one is active
    await db.tx(async t => {
      await t.none('UPDATE seasons SET is_active = false WHERE is_active = true');
      await t.none('UPDATE seasons SET is_active = true WHERE id = $1', [id]);
    });

    const activatedSeason = await db.one('SELECT * FROM seasons WHERE id = $1', [id]);
    
    res.json(activatedSeason);
  } catch (error) {
    console.error('Error activating season:', error);
    throw error;
  }
}));

// Delete a season
router.delete('/:id', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if season exists
    const existingSeason = await db.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
    if (!existingSeason) {
      return res.status(404).json({ message: 'Season not found' });
    }
    
    // Check if there are any questions or attempts associated with this season
    const associations = await db.one(`
      SELECT 
        (SELECT COUNT(*) FROM questions WHERE season_id = $1) as question_count,
        (SELECT COUNT(*) FROM user_quiz_attempts WHERE season_id = $1) as attempt_count
    `, [id]);
    
    if (associations.question_count > 0 || associations.attempt_count > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete season with associated questions or attempts',
        associations
      });
    }
    
    // Delete the season
    await db.none('DELETE FROM seasons WHERE id = $1', [id]);
    
    res.json({ message: 'Season deleted successfully' });
  } catch (error) {
    console.error('Error deleting season:', error);
    throw error;
  }
}));

// Get qualified users for a specific season
router.get('/:id/qualified-users', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const qualifiedUsers = await db.any(`
      SELECT 
        u.id,
        u.username,
        u.email,
        uqa.score,
        uqa.percentage_score,
        uqa.completed_at
      FROM 
        users u
      JOIN 
        user_quiz_attempts uqa ON u.id = uqa.user_id
      WHERE 
        uqa.season_id = $1 AND
        uqa.qualifies_for_next_round = true
      ORDER BY 
        uqa.score DESC, uqa.completed_at ASC
    `, [id]);
    
    res.json(qualifiedUsers);
  } catch (error) {
    console.error('Error fetching qualified users:', error);
    throw error;
  }
}));

// Add questions to a season
router.post('/:id/questions', authenticateUser, isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { questions } = req.body;
    
    // Check if season exists
    const existingSeason = await db.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
    if (!existingSeason) {
      return res.status(404).json({ message: 'Season not found' });
    }
    
    // Validate questions array
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Questions array is required' });
    }
    
    // Add questions to the season
    const addedQuestions = [];
    for (const question of questions) {
      const { question_text, options, correct_answer, category, difficulty } = question;
      
      // Validate required fields
      if (!question_text || !options || !correct_answer) {
        continue; // Skip invalid questions
      }
      
      // Insert the question
      const newQuestion = await db.one(`
        INSERT INTO questions 
          (question, options, correct_answer, category, difficulty, season_id)
        VALUES 
          ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        question_text,
        options,
        correct_answer,
        category || 'General',
        difficulty || 'Medium',
        id
      ]);
      
      addedQuestions.push(newQuestion);
    }
    
    res.status(201).json({
      message: `${addedQuestions.length} questions added to season successfully`,
      questions: addedQuestions
    });
  } catch (error) {
    console.error('Error adding questions to season:', error);
    throw error;
  }
}));

export default router;
