import express from 'express';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get all seasons
router.get('/seasons', isAdmin, asyncHandler(async (req, res) => {
  console.log('Fetching all seasons at:', new Date().toISOString());
  try {
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const query = `
      SELECT 
        s.*,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT uqa.id) as attempts_count,
        COUNT(DISTINCT CASE WHEN uqa.qualifies_for_next_round = true THEN uqa.user_id END) as qualified_users_count
      FROM seasons s
      LEFT JOIN questions q ON s.id = q.season_id
      LEFT JOIN user_quiz_attempts uqa ON s.id = uqa.season_id
      GROUP BY s.id
      ORDER BY s.start_date DESC
    `;

    const seasonsPromise = db.any(query);
    const seasons = await Promise.race([seasonsPromise, timeout]);
    
    res.json(seasons);
  } catch (error) {
    console.error('Error fetching seasons:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Get active season
router.get('/active', asyncHandler(async (req, res) => {
  console.log('Fetching active season at:', new Date().toISOString());
  try {
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const query = `
      SELECT 
        s.*,
        COUNT(DISTINCT q.id) as question_count
      FROM seasons s
      LEFT JOIN questions q ON s.id = q.season_id
      WHERE s.is_active = true
        AND s.start_date <= NOW()
        AND s.end_date >= NOW()
      GROUP BY s.id
      ORDER BY s.is_qualification_round DESC, s.start_date DESC
      LIMIT 1
    `;

    const seasonPromise = db.oneOrNone(query);
    const season = await Promise.race([seasonPromise, timeout]);
    
    if (!season) {
      return res.status(404).json({ success: false, error: 'No active season found' });
    }
    res.json(season);
  } catch (error) {
    console.error('Error fetching active season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Get season by ID
router.get('/:id', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Fetching season with ID ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
    
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const query = `
      SELECT 
        s.*,
        COUNT(DISTINCT q.id) as question_count,
        COUNT(DISTINCT uqa.id) as attempts_count,
        COUNT(DISTINCT CASE WHEN uqa.qualifies_for_next_round = true THEN uqa.user_id END) as qualified_users_count
      FROM seasons s
      LEFT JOIN questions q ON s.id = q.season_id
      LEFT JOIN user_quiz_attempts uqa ON s.id = uqa.season_id
      WHERE s.id = $1
      GROUP BY s.id
    `;

    const seasonPromise = db.oneOrNone(query, [id]);
    const season = await Promise.race([seasonPromise, timeout]);
    
    if (!season) {
      return res.status(404).json({ success: false, error: 'Season not found' });
    }
    res.json(season);
  } catch (error) {
    console.error('Error fetching season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Create new season
router.post('/seasons', isAdmin, asyncHandler(async (req, res) => {
  console.log('Creating new season at:', new Date().toISOString());
  try {
    const {
=======
import sqlite3 from 'sqlite3';
import path from 'path';
import { isAdmin } from '../middlewares/auth.js';
import { validateAndFormatDate, validateDateRange } from '../utils/dateUtils.js';

const router = express.Router();
const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));

// Get all seasons
// Get all seasons
router.get('/seasons', isAdmin, asyncHandler(async (req, res) => {
  console.log('Fetching all seasons at:', new Date().toISOString());
  try {
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });

    const query = `
      SELECT 
        s.*,
        COUNT(DISTINCT q.id) as question_count,
      COUNT(DISTINCT qr.id) as attempts_count,
      COUNT(DISTINCT CASE WHEN qr.score >= s.minimum_score_percentage THEN qr.user_id END) as qualified_users_count
    FROM seasons s
    LEFT JOIN season_questions sq ON s.id = sq.season_id
    LEFT JOIN questions q ON sq.question_id = q.id
    LEFT JOIN quiz_results qr ON s.id = qr.season_id
    GROUP BY s.id
    ORDER BY s.start_date DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching seasons:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Get active season
router.get('/active', (req, res) => {
  const query = `
    SELECT 
      s.*,
      COUNT(DISTINCT q.id) as question_count
    FROM seasons s
    LEFT JOIN season_questions sq ON s.id = sq.season_id
    LEFT JOIN questions q ON sq.question_id = q.id
    WHERE s.is_active = 1
    GROUP BY s.id
  `;

  db.get(query, [], (err, row) => {
    if (err) {
      console.error('Error fetching active season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'No active season found' });
    }
    res.json(row);
  });
});

// Get season by ID
router.get('/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      s.*,
      COUNT(DISTINCT q.id) as question_count,
      COUNT(DISTINCT qr.id) as attempts_count,
      COUNT(DISTINCT CASE WHEN qr.score >= s.minimum_score_percentage THEN qr.user_id END) as qualified_users_count
    FROM seasons s
    LEFT JOIN season_questions sq ON s.id = sq.season_id
    LEFT JOIN questions q ON sq.question_id = q.id
    LEFT JOIN quiz_results qr ON s.id = qr.season_id
    WHERE s.id = ?
    GROUP BY s.id
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('Error fetching season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json(row);
  });
});

// Create new season
router.post('/seasons', isAdmin, async (req, res) => {
  const {
    name,
    description,
    start_date,
    end_date,
    is_active,
    is_qualification_round,
    minimum_score_percentage
  } = req.body;

  if (!name || !start_date || !end_date || minimum_score_percentage === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate dates
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (endDate <= startDate) {
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  // If this season is being set as active, deactivate all other seasons first
  if (is_active) {
    db.run('UPDATE seasons SET is_active = 0 WHERE id != ?', [-1], (err) => {
      if (err) {
        console.error('Error deactivating other seasons:', err);
        return res.status(500).json({ error: 'Database error' });
      }
    });
  }

  const query = `
    INSERT INTO seasons (
      name, description, start_date, end_date, 
      is_active, is_qualification_round, minimum_score_percentage,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;

  db.run(query, [
    name,
    description || null,
    start_date,
    end_date,
    is_active ? 1 : 0,
    is_qualification_round ? 1 : 0,
    minimum_score_percentage
  ], function(err) {
    if (err) {
      console.error('Error creating season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(201).json({ 
      id: this.lastID,
>>>>>>> e1a003cf8e9377eb786f85f708165d69f2e41808
      name,
      description,
      start_date,
      end_date,
      is_active,
      is_qualification_round,
      minimum_score_percentage
    } = req.body;

    // Validate required fields
    if (!name || !start_date || !end_date || minimum_score_percentage === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format' });
    }
    if (endDate <= startDate) {
      return res.status(400).json({ success: false, error: 'End date must be after start date' });
    }

    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    // Use a transaction to ensure data consistency
    const result = await db.tx(async t => {
      // If this season is being set as active, deactivate all other seasons first
      if (is_active) {
        await t.none('UPDATE seasons SET is_active = false WHERE id != $1', [-1]);
      }

      // Create the new season
      const newSeason = await t.one(`
        INSERT INTO seasons (
          name, description, start_date, end_date, 
          is_active, is_qualification_round, minimum_score_percentage,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        name,
        description || null,
        start_date,
        end_date,
        is_active || false,
        is_qualification_round || false,
        minimum_score_percentage
      ]);
      
      return newSeason;
    });
    
    const newSeason = await Promise.race([result, timeout]);
    res.status(201).json(newSeason);
  } catch (error) {
    console.error('Error creating season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Update season
router.put('/seasons/:id', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Updating season with ID ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
    const {
=======
    });
  });
});

// Update season
router.put('/seasons/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    start_date,
    end_date,
    is_active,
    is_qualification_round,
    minimum_score_percentage
  } = req.body;

  if (!name || !start_date || !end_date || minimum_score_percentage === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate dates
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (endDate <= startDate) {
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  // If this season is being set as active, deactivate all other seasons first
  if (is_active) {
    db.run('UPDATE seasons SET is_active = 0 WHERE id != ?', [id], (err) => {
      if (err) {
        console.error('Error deactivating other seasons:', err);
        return res.status(500).json({ error: 'Database error' });
      }
    });
  }

  const query = `
    UPDATE seasons 
    SET name = ?, 
        description = ?,
        start_date = ?,
        end_date = ?,
        is_active = ?,
        is_qualification_round = ?,
        minimum_score_percentage = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `;

  db.run(query, [
    name,
    description || null,
    start_date,
    end_date,
    is_active ? 1 : 0,
    is_qualification_round ? 1 : 0,
    minimum_score_percentage,
    id
  ], function(err) {
    if (err) {
      console.error('Error updating season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json({ 
      id,
      name,
      description,
      start_date,
      end_date,
      is_active,
      is_qualification_round,
      minimum_score_percentage
    } = req.body;

    // Validate dates if provided
    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date format' });
      }
      if (endDate <= startDate) {
        return res.status(400).json({ success: false, error: 'End date must be after start date' });
      }
    }

    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    // Use a transaction to ensure data consistency
    const result = await db.tx(async t => {
      // Check if season exists
      const existingSeason = await t.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
      if (!existingSeason) {
        return { notFound: true };
      }
      
      // If this season is being set as active, deactivate all other seasons first
      if (is_active) {
        await t.none('UPDATE seasons SET is_active = false WHERE id != $1', [id]);
      }

      // Update the season
      const updatedSeason = await t.one(`
        UPDATE seasons 
        SET name = COALESCE($1, name), 
            description = COALESCE($2, description),
            start_date = COALESCE($3, start_date),
            end_date = COALESCE($4, end_date),
            is_active = COALESCE($5, is_active),
            is_qualification_round = COALESCE($6, is_qualification_round),
            minimum_score_percentage = COALESCE($7, minimum_score_percentage),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *
      `, [name, description, start_date, end_date, is_active, is_qualification_round, minimum_score_percentage, id]);
      
      return updatedSeason;
    });
    
    const updatedResult = await Promise.race([result, timeout]);
    
    if (updatedResult.notFound) {
      return res.status(404).json({ success: false, error: 'Season not found' });
    }
    
    res.json(updatedResult);
  } catch (error) {
    console.error('Error updating season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Delete season
router.delete('/seasons/:id', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Deleting season with ID ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
    
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    // Use a transaction to ensure data consistency
    const result = await db.tx(async t => {
      // First check if the season exists
      const existingSeason = await t.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
      if (!existingSeason) {
        return { notFound: true };
      }

      // Check if there are any questions or attempts associated with this season
      const associations = await t.one(`
        SELECT 
          (SELECT COUNT(*) FROM questions WHERE season_id = $1) as question_count,
          (SELECT COUNT(*) FROM user_quiz_attempts WHERE season_id = $1) as attempt_count
      `, [id]);
      
      if (parseInt(associations.question_count) > 0 || parseInt(associations.attempt_count) > 0) {
        return { hasAssociations: true, associations };
      }
      
      // Delete the season
      await t.none('DELETE FROM seasons WHERE id = $1', [id]);
      return { deleted: true };
    });
    
    const deleteResult = await Promise.race([result, timeout]);
    
    if (deleteResult.notFound) {
      return res.status(404).json({ success: false, error: 'Season not found' });
    }
    
    if (deleteResult.hasAssociations) {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot delete season with associated questions or attempts',
        associations: deleteResult.associations
      });
    }
    
    res.json({ success: true, message: 'Season deleted successfully' });
  } catch (error) {
    console.error('Error deleting season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
router.get('/seasons/:id/questions', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Fetching questions for season ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
    
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    const query = `
      SELECT q.*
      FROM questions q
      WHERE q.season_id = $1
      ORDER BY q.created_at ASC
    `;

    const questionsPromise = db.any(query, [id]);
    const questions = await Promise.race([questionsPromise, timeout]);
    
    res.json(questions);
  } catch (error) {
    console.error('Error fetching season questions:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Add questions to a season
router.post('/seasons/:id/questions', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Adding questions to season ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, error: 'Questions array is required' });
    }

    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    // Use a transaction to ensure data consistency
    const result = await db.tx(async t => {
      // First verify the season exists
      const season = await t.oneOrNone('SELECT id FROM seasons WHERE id = $1', [id]);
      if (!season) {
        return { notFound: true };
      }
      
      // Add all questions to the season
      const insertedQuestions = [];
      
      for (const questionId of questions) {
        // Check if the question exists
        const questionExists = await t.oneOrNone('SELECT id FROM questions WHERE id = $1', [questionId]);
        if (!questionExists) {
          continue; // Skip non-existent question
        }
        
        // Check if question is already in the season
        const questionInSeason = await t.oneOrNone(
          'SELECT 1 FROM questions WHERE id = $1 AND season_id = $2', 
          [questionId, id]
        );
        
        if (!questionInSeason) {
          await t.none(
            'UPDATE questions SET season_id = $1 WHERE id = $2', 
            [id, questionId]
          );
          insertedQuestions.push(questionId);
        }
      }
      
      return { success: true, addedCount: insertedQuestions.length };
    });
    
    const addQuestionsResult = await Promise.race([result, timeout]);
    
    if (addQuestionsResult.notFound) {
      return res.status(404).json({ success: false, error: 'Season not found' });
    }
    
    res.json({ 
      success: true, 
      message: `${addQuestionsResult.addedCount} questions added successfully` 
    });
  } catch (error) {
    console.error('Error adding questions to season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Remove a question from a season
router.delete('/seasons/:seasonId/questions/:questionId', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Removing question ${req.params.questionId} from season ${req.params.seasonId} at:`, new Date().toISOString());
  try {
    const { seasonId, questionId } = req.params;
    
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    const result = await db.task(async t => {
      // First check if the question exists in the season
      const questionExists = await t.oneOrNone(
        'SELECT 1 FROM questions WHERE id = $1 AND season_id = $2',
        [questionId, seasonId]
      );
      
      if (!questionExists) {
        return { notFound: true };
      }
      
      // Set season_id to null instead of deleting the question
      await t.none('UPDATE questions SET season_id = NULL WHERE id = $1', [questionId]);
      return { success: true };
    });
    
    const removeResult = await Promise.race([result, timeout]);
    
    if (removeResult.notFound) {
      return res.status(404).json({ success: false, error: 'Question not found in season' });
    }
    
    res.json({ success: true, message: 'Question removed from season successfully' });
  } catch (error) {
    console.error('Error removing question from season:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    }
    throw error;
  }
}));

// Get qualified users for a season
router.get('/seasons/:id/qualified-users', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Fetching qualified users for season ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
    
    // Create a timeout promise to prevent hanging requests
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    const query = `
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
    `;

    const usersPromise = db.any(query, [id]);
    const users = await Promise.race([usersPromise, timeout]);
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching qualified users:', error);
    if (error.message === 'Database query timeout') {
      return res.status(503).json({
        success: false,
        error: 'Seasons service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'

  db.run('DELETE FROM seasons WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json({ message: 'Season deleted successfully' });
  });
});

// Get questions for a season
router.get('/seasons/:id/questions', isAdmin, async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT q.*
    FROM questions q
    JOIN season_questions sq ON q.id = sq.question_id
    WHERE sq.season_id = ?
    ORDER BY sq.created_at ASC
  `;

  db.all(query, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching season questions:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Add questions to a season
router.post('/seasons/:id/questions', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Questions array is required' });
  }

  // First verify the season exists
  db.get('SELECT id FROM seasons WHERE id = ?', [id], (err, season) => {
    if (err) {
      console.error('Error checking season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }

    // Prepare the insert query for multiple questions
    const placeholders = questions.map(() => '(?, ?, datetime(\'now\'))').join(',');
    const values = questions.reduce((acc, questionId) => {
      acc.push(id, questionId);
      return acc;
    }, []);

    const query = `
      INSERT INTO season_questions (season_id, question_id, created_at)
      VALUES ${placeholders}
    `;

    db.run(query, values, function(err) {
      if (err) {
        console.error('Error adding questions to season:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Questions added successfully' });
    });
  });
});

// Remove a question from a season
router.delete('/seasons/:seasonId/questions/:questionId', isAdmin, async (req, res) => {
  const { seasonId, questionId } = req.params;

  const query = 'DELETE FROM season_questions WHERE season_id = ? AND question_id = ?';

  db.run(query, [seasonId, questionId], function(err) {
    if (err) {
      console.error('Error removing question from season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Question not found in season' });
    }
    res.json({ message: 'Question removed from season successfully' });
  });
});

// Get qualified users for a season
router.get('/seasons/:id/qualified-users', isAdmin, async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      u.id,
      u.username,
      u.email,
      qr.score,
      ROUND(CAST(qr.score AS FLOAT) / 
        (SELECT COUNT(*) FROM season_questions WHERE season_id = ?) * 100, 2) as percentage_score,
      qr.completed_at
    FROM users u
    JOIN quiz_results qr ON u.id = qr.user_id
    WHERE qr.season_id = ? AND qr.score >= (
      SELECT minimum_score_percentage FROM seasons WHERE id = ?
    )
    ORDER BY qr.score DESC, qr.completed_at ASC
  `;

  db.all(query, [id, id, id], (err, rows) => {
    if (err) {
      console.error('Error fetching qualified users:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});
>>>>>>> e1a003cf8e9377eb786f85f708165d69f2e41808

export default router;
