import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Route to disqualify user from quiz
router.post('/disqualify', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Check if the requesting user matches the user being disqualified
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    await db.none('UPDATE users SET is_disqualified = true WHERE id = $1', [userId]);
    res.json({ message: 'User disqualified successfully' });
  } catch (error) {
    console.error('Error disqualifying user:', error);
    res.status(500).json({ error: 'Could not disqualify user' });
  }
});

// Start a new qualification quiz attempt
router.post('/start-qualification', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Find the active qualification round
    const qualificationRound = await db.oneOrNone(
      `SELECT id, minimum_score_percentage 
       FROM seasons 
       WHERE is_qualification_round = true 
       AND is_active = true 
       AND start_date <= NOW() 
       AND end_date >= NOW() 
       ORDER BY start_date DESC 
       LIMIT 1`
    );

    if (!qualificationRound) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active qualification round found' 
      });
    }

    // Check if user already has an active attempt
    const activeAttempt = await db.oneOrNone(
      `SELECT id FROM user_quiz_attempts 
       WHERE user_id = $1 
       AND season_id = $2 
       AND completed = false 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId, qualificationRound.id]
    );

    if (activeAttempt) {
      // Return the existing attempt
      return res.json({ 
        success: true, 
        attemptId: activeAttempt.id,
        message: 'Resuming existing qualification attempt' 
      });
    }

    // Get questions for the qualification round
    const questions = await db.any(
      `SELECT id, question, options, correct_answer, category, difficulty, time_limit 
       FROM questions 
       WHERE season_id = $1 
       ORDER BY RANDOM() 
       LIMIT 15`, // Or your desired question count
      [qualificationRound.id]
    );

    if (questions.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No questions found for qualification round' 
      });
    }

    // Create a new quiz attempt
    const attemptId = uuidv4();
    await db.none(
      `INSERT INTO user_quiz_attempts 
       (id, user_id, season_id, started_at, total_questions_in_attempt) 
       VALUES ($1, $2, $3, NOW(), $4)`,
      [attemptId, userId, qualificationRound.id, questions.length]
    );

    // Return the questions and attempt ID
    res.json({
      success: true,
      attemptId,
      questions: questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
        category: q.category,
        difficulty: q.difficulty,
        timeLimit: q.time_limit || 30
      })),
      totalQuestions: questions.length,
      minimumScorePercentage: qualificationRound.minimum_score_percentage
    });

  } catch (error) {
    console.error('Error starting qualification attempt:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start qualification attempt',
      error: error.message 
    });
  }
});

export default router;
