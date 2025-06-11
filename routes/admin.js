import express from 'express';
import jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import path from 'path';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import bcrypt from 'bcryptjs';

// Ensure all routes that require admin access use the middleware

const router = express.Router();
const DISQUALIFIED_USERS_PATH = path.join(process.cwd(), 'disqualified_users.json');

// Get all users with their quiz attempts and scores
router.get('/users', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));


// Route for admin to get a specific user's details including attempts and qualifications
router.get('/user/:id', isAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const userPromise = db.oneOrNone('SELECT id, username, email, phone, is_disqualified, role, created_at, last_login FROM users WHERE id = $1', [id]);
        
        const attemptsPromise = db.any(`
            SELECT 
                qa.id,
                qa.score,
                qa.total_questions, 
                qa.completed,
                qa.started_at,
                qa.completed_at,
                qa.season_id,
                s.name as season_name,
                s.minimum_score_percentage, 
                qa.round_id,
                r.name as round_name,
                (CASE 
                    WHEN qa.total_questions IS NOT NULL AND qa.total_questions > 0 THEN (qa.score * 100.0 / qa.total_questions) 
                    ELSE 0 
                END) as percentage_score
            FROM user_quiz_attempts qa
            LEFT JOIN seasons s ON qa.season_id = s.id
            LEFT JOIN rounds r ON qa.round_id = r.id
            WHERE qa.user_id = $1
            ORDER BY qa.completed_at DESC
        `, [id]);

        const [user, attemptsData] = await Promise.all([userPromise, attemptsPromise]);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const qualifications = attemptsData
            .filter(attempt => attempt.completed && attempt.season_id && typeof attempt.minimum_score_percentage === 'number' && attempt.percentage_score >= attempt.minimum_score_percentage)
            .map(attempt => ({
                id: attempt.id, 
                score: attempt.score,
                completed_at: attempt.completed_at,
                season_id: attempt.season_id,
                season_name: attempt.season_name,
                round_id: attempt.round_id,
                round_name: attempt.round_name,
                minimum_score_percentage: attempt.minimum_score_percentage,
                percentage_score: attempt.percentage_score
            }));
        
        const attempts = attemptsData.map(({ minimum_score_percentage, ...rest }) => rest);

        res.json({ 
            success: true, 
            user: {
                ...user,
                attempts,
                qualifications
            } 
        });

    } catch (error) {
        console.error(`Error fetching detailed user data for ${id}:`, error);
        res.status(500).json({ success: false, error: 'Failed to get detailed user data', details: error.message });
    }
}));

// Route for admin to update a specific user's details
router.put('/user/:id', isAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { username, email, phone, is_disqualified, role } = req.body; 

    if (typeof username === 'undefined' || typeof email === 'undefined' || typeof phone === 'undefined' || typeof is_disqualified === 'undefined' || typeof role === 'undefined') {
        return res.status(400).json({ success: false, error: 'Missing one or more required fields: username, email, phone, is_disqualified, role' });
    }
    
    try {
        const updatedUser = await db.one(
            'UPDATE users SET username = $1, email = $2, phone = $3, is_disqualified = $4, role = $5 WHERE id = $6 RETURNING id, username, email, phone, is_disqualified, role, created_at, last_login',
            [username, email, phone, is_disqualified, role, id]
        );
        res.json({ success: true, message: 'User updated successfully', user: updatedUser });
    } catch (error) {
        console.error(`Error updating user ${id}:`, error);
        if (error.code === '23505') { // Unique violation (e.g. for email)
             return res.status(409).json({ success: false, error: 'Failed to update user. Email or username may already exist.', details: error.message });
        }
        res.status(500).json({ success: false, error: 'Failed to update user', details: error.message });
    }
}));

// Route for admin to delete a user
router.delete('/user/:id', isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    // Optional: Check if user exists before attempting delete, though DB will handle it
    const user = await db.oneOrNone('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    await db.none('DELETE FROM users WHERE id = $1', [id]);
    // Consider also deleting related data e.g., quiz attempts, refresh tokens, etc.
    // For now, just deleting the user record.
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error(`Error deleting user ${id}:`, error);
    res.status(500).json({ success: false, error: 'Failed to delete user', details: error.message });
  }
}));

// Route for admin to reset a user's password
router.post('/user/:id/reset-password', isAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long.' });
    }

    try {
        // It's good practice to ensure the user exists before trying to update
        const userExists = await db.oneOrNone('SELECT id FROM users WHERE id = $1', [id]);
        if (!userExists) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        const saltRounds = 10; // Consider making this an environment variable
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        await db.none('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, id]);
        
        // Security consideration: Invalidate user's existing sessions/tokens here if possible/needed.
        // This might involve clearing refresh tokens from the database for this user.

        res.json({ success: true, message: 'Password reset successfully.' });
    } catch (error) {
        console.error(`Error resetting password for user ${id}:`, error);
        res.status(500).json({ success: false, error: 'Failed to reset password.', details: error.message });
    }
}));

// Get disqualified users
router.get('/disqualified-users', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Get detailed stats for a specific user
router.get('/stats/:userId', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Get dashboard statistics
router.get('/stats', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Get comprehensive insights and statistics
router.get('/insights-stats', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Get all questions
router.get('/questions', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Add a new question
router.post('/questions', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Update a question
router.put('/questions/:id', isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { question, options, correctAnswer, category, difficulty, timeLimit, seasonId } = req.body;
  const userId = req.user.id;

  const updates = [];
  const values = [];
  let paramCount = 1;

  if (question !== undefined) {
    updates.push(`question = $${paramCount++}`);
    values.push(question);
  }
  if (options !== undefined) {
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, error: 'Options must be an array with at least two items.' });
    }
    updates.push(`options = $${paramCount++}`);
    values.push(JSON.stringify(options));
  }
  if (correctAnswer !== undefined) {
    if (options && !options.includes(correctAnswer)) {
         return res.status(400).json({ success: false, error: 'Correct answer must be one of the provided options.' });
    }
    updates.push(`correct_answer = $${paramCount++}`);
    values.push(correctAnswer);
  }
  if (category !== undefined) {
    updates.push(`category = $${paramCount++}`);
    values.push(category);
  }
  if (difficulty !== undefined) {
    updates.push(`difficulty = $${paramCount++}`);
    values.push(difficulty);
  }
  if (timeLimit !== undefined) {
    updates.push(`time_limit = $${paramCount++}`);
    values.push(timeLimit);
  }
  if (seasonId !== undefined) {
    updates.push(`season_id = $${paramCount++}`);
    values.push(seasonId === '' ? null : seasonId);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, error: 'No update fields provided.' });
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  updates.push(`updated_by = $${paramCount++}`);
  values.push(userId);
  values.push(id);

  const query = `
    UPDATE questions 
    SET ${updates.join(', ')}
    WHERE id = $${paramCount} 
    RETURNING id, question, options, correct_answer AS "correctAnswer", category, difficulty, time_limit AS "timeLimit", season_id AS "seasonId", updated_at, updated_by;
  `;

  try {
    const updatedQuestion = await db.oneOrNone(query, values);
    if (!updatedQuestion) {
      return res.status(404).json({ success: false, error: 'Question not found or no changes made.' });
    }
    if (typeof updatedQuestion.options === 'string') {
        updatedQuestion.options = JSON.parse(updatedQuestion.options);
    }
    res.json({ success: true, question: updatedQuestion });
  } catch (error) {
    console.error('Error updating question:', error);
    if (error.code === '23503') { 
        return res.status(400).json({ success: false, error: 'Invalid season_id provided.', details: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to update question', details: error.message });
  }
}));





// Create a new round
router.post('/rounds', isAdmin, asyncHandler(async (req, res) => {
  const { name, startDate, endDate, seasonId, roundNumber } = req.body;
  
  if (!name || !startDate || !endDate || !seasonId || !roundNumber) {
    return res.status(400).json({ error: 'Name, start date, end date, season ID, and round number are required' });
  }

  const query = `
    INSERT INTO rounds (name, start_date, end_date, season_id, round_number, is_active)
    VALUES ($1, $2, $3, $4, $5, false)
    RETURNING id
  `;

  try {
    const result = await db.one(query, [name, startDate, endDate, seasonId, roundNumber]);
    const round = await db.one('SELECT * FROM rounds WHERE id = $1', [result.id]);
    res.json(round);
  } catch (error) {
    console.error('Error creating round:', error);
    throw error;
  }
}));

// Update a round
router.put('/rounds/:id', isAdmin, asyncHandler(async (req, res) => {
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
    throw error;
  }
}));

// Questions management endpoints
router.get('/questions', isAdmin, asyncHandler(async (req, res) => {
  try {
    const questions = await db.any('SELECT * FROM questions ORDER BY id DESC');
    
    // Format the questions for the frontend
    const formattedQuestions = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      correctAnswer: q.correct_answer,
      category: q.category,
      difficulty: q.difficulty,
      seasonId: q.season_id
    }));
    
    res.json(formattedQuestions);
  } catch (error) {
    console.error('Error fetching admin questions:', error);
    res.status(500).json({
      error: 'Failed to fetch questions',
      message: 'An error occurred while retrieving questions',
      code: 'ADMIN_QUESTIONS_ERROR'
    });
  }
}));

// Delete a question
router.delete('/questions/:id', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if question exists
    const question = await db.oneOrNone('SELECT * FROM questions WHERE id = $1', [id]);
    
    if (!question) {
      return res.status(404).json({
        error: 'Question not found',
        message: 'The requested question does not exist',
        code: 'QUESTION_NOT_FOUND'
      });
    }
    
    // Delete the question
    await db.none('DELETE FROM questions WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: 'Question deleted successfully',
      id: parseInt(id)
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      error: 'Failed to delete question',
      message: 'An error occurred while deleting the question',
      code: 'QUESTION_DELETE_ERROR'
    });
  }
}));

// Add a new question
router.post('/questions', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { question, options, correctAnswer, category, difficulty, seasonId } = req.body;
    
    // Validate required fields
    if (!question || !options || !correctAnswer || !category || !difficulty || !seasonId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'All fields are required to create a question',
        code: 'MISSING_FIELDS'
      });
    }
    
    // Insert the new question
    const result = await db.one(
      'INSERT INTO questions(question, options, correct_answer, category, difficulty, season_id) VALUES($1, $2, $3, $4, $5, $6) RETURNING id',
      [question, JSON.stringify(options), correctAnswer, category, difficulty, seasonId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Question created successfully',
      id: result.id,
      question: {
        id: result.id,
        question,
        options,
        correctAnswer,
        category,
        difficulty,
        seasonId
      }
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({
      error: 'Failed to create question',
      message: 'An error occurred while creating the question',
      code: 'QUESTION_CREATE_ERROR'
    });
  }
}));

// Update an existing question
router.put('/questions/:id', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { question, options, correctAnswer, category, difficulty, seasonId } = req.body;
    
    // Check if question exists
    const existingQuestion = await db.oneOrNone('SELECT * FROM questions WHERE id = $1', [id]);
    
    if (!existingQuestion) {
      return res.status(404).json({
        error: 'Question not found',
        message: 'The requested question does not exist',
        code: 'QUESTION_NOT_FOUND'
      });
    }
    
    // Update the question
    await db.none(
      'UPDATE questions SET question = $1, options = $2, correct_answer = $3, category = $4, difficulty = $5, season_id = $6 WHERE id = $7',
      [question, JSON.stringify(options), correctAnswer, category, difficulty, seasonId, id]
    );
    
    res.json({
      success: true,
      message: 'Question updated successfully',
      id: parseInt(id),
      question: {
        id: parseInt(id),
        question,
        options,
        correctAnswer,
        category,
        difficulty,
        seasonId
      }
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({
      error: 'Failed to update question',
      message: 'An error occurred while updating the question',
      code: 'QUESTION_UPDATE_ERROR'
    });
  }
}));

// Add dashboard statistics endpoint
router.get('/dashboard-stats', isAdmin, asyncHandler(async (req, res) => {
  try {
    // Get total users count
    const totalUsersResult = await db.one('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(totalUsersResult.count, 10);
    
    // Get total questions count
    const totalQuestionsResult = await db.one('SELECT COUNT(*) as count FROM questions');
    const totalQuestions = parseInt(totalQuestionsResult.count, 10);
    
    // Get total quiz attempts
    const totalAttemptsResult = await db.one('SELECT COUNT(*) as count FROM user_quiz_attempts');
    const totalAttempts = parseInt(totalAttemptsResult.count, 10);
    
    // Get average score
    const avgScoreResult = await db.oneOrNone('SELECT AVG(score) as avg_score FROM user_quiz_attempts WHERE completed = true');
    const avgScore = avgScoreResult ? parseFloat(avgScoreResult.avg_score) || 0 : 0;
    
    // Get count of users by registration date (last 7 days)
    const usersByDateResult = await db.any(`
      SELECT 
        DATE(created_at) as date, 
        COUNT(*) as count 
      FROM users 
      WHERE created_at >= NOW() - INTERVAL '7 days' 
      GROUP BY DATE(created_at) 
      ORDER BY date ASC
    `);
    
    // Get count of quiz attempts by date (last 7 days)
    const attemptsByDateResult = await db.any(`
      SELECT 
        DATE(started_at) as date, 
        COUNT(*) as count 
      FROM user_quiz_attempts 
      WHERE started_at >= NOW() - INTERVAL '7 days' 
      GROUP BY DATE(started_at) 
      ORDER BY date ASC
    `);
    
    // Return all statistics
    res.json({
      totalUsers,
      totalQuestions,
      totalAttempts,
      avgScore,
      usersByDate: usersByDateResult,
      attemptsByDate: attemptsByDateResult,
      // Add default data if any of the queries returned empty results
      ...(usersByDateResult.length === 0 && { 
        usersByDate: Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (6 - i));
          return { date: date.toISOString().split('T')[0], count: 0 };
        })
      }),
      ...(attemptsByDateResult.length === 0 && { 
        attemptsByDate: Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - (6 - i));
          return { date: date.toISOString().split('T')[0], count: 0 };
        })
      })
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      message: 'An error occurred while retrieving dashboard data',
      code: 'DASHBOARD_STATS_ERROR'
    });
  }
}));

// Season management endpoints

// Get all seasons
router.get('/seasons', asyncHandler(async (req, res) => {
  try {
    const seasons = await db.any('SELECT * FROM seasons ORDER BY start_date DESC');
    res.json(seasons);
  } catch (error) {
    console.error('Error fetching seasons:', error);
    res.status(500).json({
      error: 'Failed to fetch seasons',
      message: 'An error occurred while retrieving seasons',
      code: 'SEASONS_FETCH_ERROR'
    });
  }
}));

// Get a specific season
router.get('/seasons/:id', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const season = await db.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
    
    if (!season) {
      return res.status(404).json({
        error: 'Season not found',
        message: 'The requested season does not exist',
        code: 'SEASON_NOT_FOUND'
      });
    }
    
    res.json(season);
  } catch (error) {
    console.error('Error fetching season:', error);
    res.status(500).json({
      error: 'Failed to fetch season',
      message: 'An error occurred while retrieving the season',
      code: 'SEASON_FETCH_ERROR'
    });
  }
}));

// Create a new season
router.post('/seasons', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { name, startDate, endDate, isQualificationRound, minimumScorePercentage, isActive } = req.body;
    
    // Validate required fields
    if (!name || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Name, start date, and end date are required',
        code: 'MISSING_FIELDS'
      });
    }
    
    // If setting this season as active, deactivate all other seasons
    if (isActive) {
      await db.none('UPDATE seasons SET is_active = false WHERE is_active = true');
    }
    
    // Insert the new season
    const result = await db.one(
      `INSERT INTO seasons(
        name, start_date, end_date, is_qualification_round, 
        minimum_score_percentage, is_active
      ) VALUES($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        name, 
        startDate, 
        endDate, 
        isQualificationRound || false, 
        minimumScorePercentage || 60, 
        isActive || false
      ]
    );
    
    res.status(201).json({
      success: true,
      message: 'Season created successfully',
      id: result.id,
      season: {
        id: result.id,
        name,
        startDate,
        endDate,
        isQualificationRound: isQualificationRound || false,
        minimumScorePercentage: minimumScorePercentage || 60,
        isActive: isActive || false
      }
    });
  } catch (error) {
    console.error('Error creating season:', error);
    res.status(500).json({
      error: 'Failed to create season',
      message: 'An error occurred while creating the season',
      code: 'SEASON_CREATE_ERROR'
    });
  }
}));

// Update a season
router.put('/seasons/:id', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, isQualificationRound, minimumScorePercentage, isActive } = req.body;
    
    // Check if season exists
    const existingSeason = await db.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
    
    if (!existingSeason) {
      return res.status(404).json({
        error: 'Season not found',
        message: 'The requested season does not exist',
        code: 'SEASON_NOT_FOUND'
      });
    }
    
    // If setting this season as active, deactivate all other seasons
    if (isActive) {
      await db.none('UPDATE seasons SET is_active = false WHERE id != $1', [id]);
    }
    
    // Update the season
    await db.none(
      `UPDATE seasons SET 
        name = $1, 
        start_date = $2, 
        end_date = $3, 
        is_qualification_round = $4, 
        minimum_score_percentage = $5, 
        is_active = $6 
      WHERE id = $7`,
      [
        name, 
        startDate, 
        endDate, 
        isQualificationRound, 
        minimumScorePercentage, 
        isActive, 
        id
      ]
    );
    
    res.json({
      success: true,
      message: 'Season updated successfully',
      id: parseInt(id),
      season: {
        id: parseInt(id),
        name,
        startDate,
        endDate,
        isQualificationRound,
        minimumScorePercentage,
        isActive
      }
    });
  } catch (error) {
    console.error('Error updating season:', error);
    res.status(500).json({
      error: 'Failed to update season',
      message: 'An error occurred while updating the season',
      code: 'SEASON_UPDATE_ERROR'
    });
  }
}));

// Delete a season
router.delete('/seasons/:id', isAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if season exists
    const season = await db.oneOrNone('SELECT * FROM seasons WHERE id = $1', [id]);
    
    if (!season) {
      return res.status(404).json({
        error: 'Season not found',
        message: 'The requested season does not exist',
        code: 'SEASON_NOT_FOUND'
      });
    }
    
    // Check if there are questions associated with this season
    const questionCount = await db.one('SELECT COUNT(*) as count FROM questions WHERE season_id = $1', [id]);
    
    if (parseInt(questionCount.count) > 0) {
      return res.status(400).json({
        error: 'Season has questions',
        message: 'Cannot delete a season that has questions. Delete the questions first or reassign them to another season.',
        code: 'SEASON_HAS_QUESTIONS'
      });
    }
    
    // Delete the season
    await db.none('DELETE FROM seasons WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: 'Season deleted successfully',
      id: parseInt(id)
    });
  } catch (error) {
    console.error('Error deleting season:', error);
    res.status(500).json({
      error: 'Failed to delete season',
      message: 'An error occurred while deleting the season',
      code: 'SEASON_DELETE_ERROR'
    });
  }
}));

export default router;
