import express from 'express';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Get all seasons with question and user attempt counts
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

    const seasons = await Promise.race([db.any(query), timeout]);
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

// Get active season (including qualification rounds)
router.get('/active', asyncHandler(async (req, res) => {
  console.log('Fetching active season at:', new Date().toISOString());
  try {
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

    const season = await Promise.race([db.oneOrNone(query), timeout]);
    
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

// Get season by ID with detailed statistics
router.get('/:id', isAdmin, asyncHandler(async (req, res) => {
  console.log(`Fetching season with ID ${req.params.id} at:`, new Date().toISOString());
  try {
    const { id } = req.params;
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

    const season = await Promise.race([db.oneOrNone(query, [id]), timeout]);
    
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

// Create a new season
router.post('/seasons', isAdmin, asyncHandler(async (req, res) => {
  console.log('Creating new season at:', new Date().toISOString());
  try {
    const {
      name,
      description,
      start_date,
      end_date,
      is_active = false,
      is_qualification_round = false,
      minimum_score_percentage = 70
    } = req.body;

    // Validate required fields
    if (!name || !start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, start_date, and end_date are required' 
      });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid date format. Please use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)' 
      });
    }
    
    if (endDate <= startDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'End date must be after start date' 
      });
    }

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000);
    });
    
    // Use a transaction to ensure data consistency
    const result = await db.tx(async t => {
      // If this season is being set as active, deactivate all other seasons first
      if (is_active) {
        await t.none('UPDATE seasons SET is_active = false');
      }

      // Create the new season
      return await t.one(
        `INSERT INTO seasons (
          name, description, start_date, end_date, 
          is_active, is_qualification_round, minimum_score_percentage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *`,
        [name, description || null, start_date, end_date, 
         is_active, is_qualification_round, minimum_score_percentage]
      );
    });
    
    const createdSeason = await Promise.race([result, timeout]);
    res.status(201).json(createdSeason);
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

export default router;
