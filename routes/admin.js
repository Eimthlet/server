import express from 'express';
import jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import path from 'path';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';

// Ensure all routes that require admin access use the middleware

const router = express.Router();
const DISQUALIFIED_USERS_PATH = path.join(process.cwd(), 'disqualified_users.json');

// Get all users with their quiz attempts and scores
router.get('/users', isAdmin, async (req, res) => {
  const query = `
    SELECT 
      u.id,
      u.username,
      u.email,
      u.created_at,
      u.is_disqualified,
      uqa.id as attempt_id,
      uqa.score,
      uqa.completed,
      uqa.started_at,
      uqa.completed_at,
      (SELECT COUNT(*) FROM quiz_progress WHERE attempt_id = uqa.id) as questions_answered,
      (SELECT COUNT(*) FROM questions) as total_questions
    FROM users u
    LEFT JOIN user_quiz_attempts uqa ON u.id = uqa.user_id
    ORDER BY uqa.score DESC NULLS LAST,
             uqa.completed_at ASC NULLS LAST;
  `;

  try {
    const users = await db.any(query);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get disqualified users
router.get('/disqualified-users', isAdmin, async (req, res) => {
  try {
    // Read disqualified users from file
    let disqualifiedUsers = [];
    try {
      const data = await fs.readFile(DISQUALIFIED_USERS_PATH, 'utf8');
      disqualifiedUsers = JSON.parse(data);
    } catch (readError) {
      // If file doesn't exist, return an empty array
      if (readError.code !== 'ENOENT') {
        throw readError;
      }
    }

    // Fetch additional user details for disqualified users
    const detailedDisqualifiedUsers = await Promise.all(
      disqualifiedUsers.map(async (disqUser) => {
        return new Promise((resolve, reject) => {
          db.get(
            'SELECT id, email, username FROM users WHERE id = ?', 
            [disqUser.id], 
            (err, userDetails) => {
              if (err) {
                console.error('Error fetching user details:', err);
                resolve({
                  ...disqUser,
                  email: 'Unknown',
                  username: 'Unknown'
                });
              } else {
                resolve({
                  ...disqUser,
                  email: userDetails?.email || 'Unknown',
                  username: userDetails?.username || 'Unknown'
                });
              }
            }
          );
        });
      })
    );

    res.json(detailedDisqualifiedUsers);
  } catch (error) {
    console.error('Error fetching disqualified users:', error);
    res.status(500).json({ error: 'Failed to fetch disqualified users' });
  }
});

// Get detailed stats for a specific user
router.get('/stats/:userId', isAdmin, async (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT 
      qr.score,
      qr.completed_at,
      r.name as round_name,
      r.round_number,
      r.min_score_to_qualify,
      s.name as season_name
    FROM quiz_results qr
    LEFT JOIN rounds r ON qr.round_id = r.id
    LEFT JOIN seasons s ON qr.season_id = s.id
    WHERE qr.user_id = $1
    ORDER BY qr.completed_at DESC
  `;

  try {
    const rows = await db.any(query, [userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get dashboard statistics
router.get('/stats', isAdmin, async (req, res) => {
  try {
    console.log('Fetching admin dashboard statistics...');
    
    const [
      totalUsers,
      activeUsers,
      quizStats,
      recentAttempts,
      topScorers
    ] = await Promise.all([
      // Total users
      db.one('SELECT COUNT(*) as count FROM users'),
      
      // Active users (taken quiz)
      db.one('SELECT COUNT(DISTINCT user_id) as count FROM quiz_sessions WHERE completed = true'),
      
      // Quiz statistics
      db.one(`
        SELECT 
          COUNT(*) as total_questions,
          COALESCE(AVG(score), 0) as average_score,
          COUNT(CASE WHEN completed = true THEN 1 END) as completed_attempts
        FROM quiz_sessions
      `),
      
      // Recent quiz attempts
      db.any(`
        SELECT 
          u.id as "userId",
          u.username,
          qs.score,
          qs.completed_at as "completedAt"
        FROM quiz_sessions qs
        JOIN users u ON u.id = qs.user_id
        WHERE qs.completed = true
        AND qs.completed_at >= NOW() - INTERVAL '7 days'
        ORDER BY qs.completed_at DESC
        LIMIT 5
      `),
      
      // Top scorers
      db.any(`
        SELECT 
          u.id as "userId",
          u.username,
          u.email,
          qs.score,
          qs.completed_at as "completedAt"
        FROM users u
        JOIN quiz_sessions qs ON u.id = qs.user_id
        WHERE qs.completed = true
        ORDER BY qs.score DESC, qs.completed_at DESC
        LIMIT 5
      `)
    ]);
    
    console.log('Successfully fetched dashboard statistics');
    res.json({
      users: {
        total: totalUsers.count,
        active: activeUsers.count
      },
      quizStats: {
        totalQuestions: quizStats.total_questions,
        averageScore: quizStats.average_score,
        completedAttempts: quizStats.completed_attempts
      },
      recentActivity: recentAttempts,
      topPerformers: topScorers
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      table: error.table,
      constraint: error.constraint
    });
    res.status(500).json({ 
      error: 'Failed to fetch dashboard statistics',
      message: error.message,
      code: error.code
    });
  }
});

// Get comprehensive insights and statistics
router.get('/insights-stats', isAdmin, async (req, res) => {
  try {
    // Get total users
    const [totalUsers] = await db.any('SELECT COUNT(*) as count FROM users');
    
    // Get active users (users who have started at least one quiz)
    const [activeUsers] = await db.any(
      'SELECT COUNT(DISTINCT user_id) as count FROM quiz_sessions'
    );
    
    // Get quiz completion statistics
    const quizStats = await db.any(
      `SELECT 
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN completed = true THEN 1 END) as completed_attempts,
        AVG(score) as average_score
      FROM quiz_sessions`
    );
    
    // Get recent activity
    const recentActivity = await db.any(
      `SELECT 
        qs.user_id,
        u.username,
        qs.score,
        qs.completed_at
      FROM quiz_sessions qs
      JOIN users u ON u.id = qs.user_id
      WHERE qs.completed_at >= NOW() - INTERVAL '7 days'
      ORDER BY qs.completed_at DESC
      LIMIT 10`
    );

    // Get top performers
    const topPerformers = await db.any(
      `SELECT 
        u.id,
        u.username,
        u.email,
        qs.score,
        qs.completed_at
      FROM users u
      JOIN quiz_sessions qs ON u.id = qs.user_id
      WHERE qs.completed = true
      ORDER BY qs.score DESC
      LIMIT 5`
    );

    res.json({
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      quizStats: {
        totalAttempts: quizStats[0].total_attempts,
        completedAttempts: quizStats[0].completed_attempts,
        averageScore: quizStats[0].average_score
      },
      recentActivity,
      topPerformers
    });
  } catch (error) {
    console.error('Error fetching insights stats:', error);
    res.status(500).json({ error: 'Failed to fetch insights statistics' });
  }
});

// Get all questions
router.get('/questions', isAdmin, async (req, res) => {
  try {
    console.log('Fetching all questions...');
    const questions = await db.any(
      `SELECT 
        q.id,
        q.question,
        q.options,
        q.correct_answer as "correctAnswer",
        q.time_limit as "timeLimit",
        q.category,
        q.difficulty,
        (SELECT COUNT(*) FROM user_responses ur WHERE ur.question_id = q.id) as attempts,
        u.username as "createdBy",
        q.created_at as "createdAt"
      FROM questions q
      LEFT JOIN users u ON q.created_by = u.id
      ORDER BY q.id DESC`
    );
    
    console.log(`Found ${questions.length} questions`);
    
    // Return in the expected format
    res.json({
      data: { questions },
      message: 'Questions retrieved successfully'
    });
    
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch questions',
      details: error.message 
    });
  }
});

// Add a new question
router.post('/questions', isAdmin, async (req, res) => {
  const { 
    question, 
    options, 
    correctAnswer, 
    category, 
    difficulty, 
    timeLimit = 30 
  } = req.body;

  // Basic validation
  if (!question || !options || !correctAnswer || !category || !difficulty) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['question', 'options', 'correctAnswer', 'category', 'difficulty']
    });
  }

  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ 
      error: 'Options must be an array with at least 2 items' 
    });
  }

  if (!options.includes(correctAnswer)) {
    return res.status(400).json({ 
      error: 'Correct answer must be one of the provided options' 
    });
  }

  try {
    const newQuestion = await db.one(
      `INSERT INTO questions (
        question, 
        options, 
        correct_answer, 
        category, 
        difficulty, 
        time_limit,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING 
        id,
        question,
        options,
        correct_answer as "correctAnswer",
        time_limit as "timeLimit",
        category,
        difficulty,
        created_at as "createdAt"`,
      [
        question,
        options,
        correctAnswer,
        category,
        difficulty,
        timeLimit,
        req.user.id // created_by
      ]
    );

    res.status(201).json({
      message: 'Question added successfully',
      question: newQuestion
    });
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(500).json({ 
      error: 'Failed to add question',
      details: error.message 
    });
  }
});

// Get season statistics
router.get('/seasons', isAdmin, async (req, res) => {
  const query = `
    SELECT 
      s.id,
      s.name,
      COUNT(DISTINCT qr.user_id) as total_participants,
      AVG(qr.score) as average_score,
      COUNT(CASE WHEN qr.score >= r.min_score_to_qualify THEN 1 END) as qualified_users
    FROM seasons s
    LEFT JOIN quiz_results qr ON s.id = qr.season_id
    LEFT JOIN rounds r ON qr.round_id = r.id
    GROUP BY s.id
    ORDER BY s.start_date DESC
  `;

  try {
    const rows = await db.any(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching season stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new season
router.post('/seasons', isAdmin, async (req, res) => {
  const { name, startDate, endDate } = req.body;
  
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'Name, start date, and end date are required' });
  }

  const query = `
    INSERT INTO seasons (name, start_date, end_date, created_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id
  `;

  try {
    const result = await db.one(query, [name, startDate, endDate]);
    res.json({ id: result.id });
  } catch (error) {
    console.error('Error creating season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update a season
router.put('/seasons/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (startDate) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(startDate);
    }
    if (endDate) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(endDate);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    values.push(id);
    
    const query = `
      UPDATE seasons 
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *`;

    const result = await db.oneOrNone(query, values);
    
    if (!result) {
      return res.status(404).json({ error: 'Season not found' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error updating season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete a season
router.delete('/seasons/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    await db.none('DELETE FROM seasons WHERE id = $1', [id]);
    res.json({ message: 'Season deleted successfully' });
  } catch (error) {
    console.error('Error deleting season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Activate a season
router.put('/seasons/:id/activate', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.none('UPDATE seasons SET is_active = false');
    await db.none('UPDATE seasons SET is_active = true WHERE id = $1', [id]);
    const season = await db.one('SELECT * FROM seasons WHERE id = $1', [id]);
    res.json(season);
  } catch (error) {
    console.error('Error activating season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new round
router.post('/rounds', isAdmin, async (req, res) => {
  const { name, startDate, endDate, seasonId, roundNumber } = req.body;
  
  if (!name || !startDate || !endDate || !seasonId || !roundNumber) {
    return res.status(400).json({ error: 'Name, start date, end date, season ID, and round number are required' });
  }

  const query = `
    INSERT INTO rounds (name, start_date, end_date, season_id, round_number, is_active)
    VALUES ($1, $2, $3, $4, $5, 0)
    RETURNING id
  `;

  try {
    const result = await db.one(query, [name, startDate, endDate, seasonId, roundNumber]);
    const round = await db.one('SELECT * FROM rounds WHERE id = $1', [result.id]);
    res.json(round);
  } catch (error) {
    console.error('Error creating round:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update a round
router.put('/rounds/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate, roundNumber } = req.body;
  
  const updates = [];
  const values = [];
  
  if (name) {
    updates.push('name = $1');
    values.push(name);
  }
  if (startDate) {
    updates.push('start_date = $2');
    values.push(startDate);
  }
  if (endDate) {
    updates.push('end_date = $3');
    values.push(endDate);
  }
  if (roundNumber) {
    updates.push('round_number = $4');
    values.push(roundNumber);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }
  
  values.push(id);
  
  const query = `
    UPDATE rounds 
    SET ${updates.join(', ')}
    WHERE id = $${values.length}
    RETURNING *
  `;

  try {
    const round = await db.one('SELECT season_id FROM rounds WHERE id = $1', [id]);
    
    await db.none('UPDATE rounds SET is_active = 0 WHERE season_id = $1', [round.season_id]);
    await db.none('UPDATE rounds SET is_active = 1 WHERE id = $1', [id]);
    const activatedRound = await db.one('SELECT * FROM rounds WHERE id = $1', [id]);
    res.json(activatedRound);
  } catch (error) {
    console.error('Error activating round:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
