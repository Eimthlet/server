import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Start or continue a quiz attempt
router.post('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    // Handle both formats: {questionId, answer} or {userId, score, total}
    const { questionId, answer, score, total } = req.body;
    
    console.log('Progress POST request received:', {
      userId,
      requestBody: req.body,
      questionId,
      answer,
      score,
      total
    });

    // Handle quiz completion (from App.tsx)
    if (score !== undefined && total !== undefined) {
      // Check if the user already has an attempt
      let attempt = await db.oneOrNone(
        'SELECT * FROM user_quiz_attempts WHERE user_id = $1',
        [userId]
      );

      if (!attempt) {
        // Create a new attempt if none exists
        attempt = await db.one(
          `INSERT INTO user_quiz_attempts 
           (user_id, score, completed, completed_at, qualifies_for_next_round, percentage_score) 
           VALUES ($1, $2, true, CURRENT_TIMESTAMP, $3, $4) 
           RETURNING *`,
          [userId, score, score >= Math.ceil(total / 2), Math.round((score / total) * 100)]
        );
      } else {
        // Update existing attempt
        await db.none(
          `UPDATE user_quiz_attempts 
           SET score = $1, completed = true, completed_at = CURRENT_TIMESTAMP,
           qualifies_for_next_round = $2, percentage_score = $3
           WHERE id = $4`,
          [score, score >= Math.ceil(total / 2), Math.round((score / total) * 100), attempt.id]
        );
      }

      // Calculate if user qualifies for next round (50% minimum score)
      const qualifiesForNextRound = score >= Math.ceil(total / 2);
      
      return res.json({
        message: 'Quiz completed successfully',
        score,
        total,
        qualifiesForNextRound,
        minimumScoreRequired: Math.ceil(total / 2),
        percentageScore: Math.round((score / total) * 100)
      });
    }

    // Handle individual question answer (original flow)
    if (!questionId) {
      console.log('Error: Missing questionId in request');
      return res.status(400).json({ error: 'Question ID is required' });
    }

    // Check if the user already has a completed attempt
    const existingCompletedAttempt = await db.oneOrNone(
      'SELECT * FROM user_quiz_attempts WHERE user_id = $1 AND completed = true',
      [userId]
    );

    if (existingCompletedAttempt) {
      return res.status(403).json({ 
        error: 'You have already completed the quiz. Only one attempt is allowed per season.',
        attemptId: existingCompletedAttempt.id,
        completed: true,
        score: existingCompletedAttempt.score,
        totalQuestions: existingCompletedAttempt.total_questions || 0,
        percentageScore: existingCompletedAttempt.percentage_score || 0
      });
    }

    // Get or create the user's quiz attempt
    let attempt = await db.oneOrNone(
      'SELECT * FROM user_quiz_attempts WHERE user_id = $1',
      [userId]
    );

    if (!attempt) {
      // Get total questions count for this season
      const totalQuestions = await db.one(
        'SELECT COUNT(*) FROM questions WHERE season_id = (SELECT id FROM seasons WHERE is_active = true LIMIT 1)',
        [],
        count => parseInt(count.count)
      );
      
      // Create a new attempt if none exists
      attempt = await db.one(
        'INSERT INTO user_quiz_attempts (user_id, total_questions) VALUES ($1, $2) RETURNING *',
        [userId, totalQuestions]
      );
      console.log('Created new quiz attempt with total questions:', attempt);
    }

    // Get the question to check the answer
    const question = await db.oneOrNone(
      'SELECT * FROM questions WHERE id = $1',
      [questionId]
    );

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Check if this question has already been answered in this attempt
    const existingProgress = await db.oneOrNone(
      'SELECT * FROM quiz_progress WHERE attempt_id = $1 AND question_id = $2',
      [attempt.id, questionId]
    );

    if (existingProgress) {
      return res.status(400).json({ 
        error: 'This question has already been answered',
        progress: existingProgress
      });
    }

    // Check if the answer is correct
    const isCorrect = answer && answer === question.correct_answer;

    // Record the progress
    const progress = await db.one(
      `INSERT INTO quiz_progress 
       (attempt_id, question_id, user_answer, is_correct) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [attempt.id, questionId, answer, isCorrect]
    );

    // Get total questions count from the attempt record or query if not available
    let totalQuestions = attempt.total_questions;
    if (!totalQuestions) {
      totalQuestions = await db.one(
        'SELECT COUNT(*) FROM questions WHERE season_id = (SELECT id FROM seasons WHERE is_active = true LIMIT 1)',
        [],
        count => parseInt(count.count)
      );
      
      // Update the attempt with the total questions count if it wasn't set
      await db.none(
        'UPDATE user_quiz_attempts SET total_questions = $1 WHERE id = $2',
        [totalQuestions, attempt.id]
      );
    }

    // Get answered questions count for this attempt
    const answeredCount = await db.one(
      'SELECT COUNT(*) FROM quiz_progress WHERE attempt_id = $1',
      [attempt.id],
      count => parseInt(count.count)
    );

    // Get correct answers count for this attempt
    const correctCount = await db.one(
      'SELECT COUNT(*) FROM quiz_progress WHERE attempt_id = $1 AND is_correct = true',
      [attempt.id],
      count => parseInt(count.count)
    );

    // Check if all questions have been answered
    if (answeredCount >= totalQuestions) {
      // Calculate if user qualifies for next round (50% minimum score)
      const qualifiesForNextRound = correctCount >= Math.ceil(totalQuestions / 2);
      const percentageScore = Math.round((correctCount / totalQuestions) * 100);
      
      // Update the attempt as completed with qualification status
      await db.none(
        `UPDATE user_quiz_attempts 
         SET completed = true, score = $1, completed_at = CURRENT_TIMESTAMP,
         qualifies_for_next_round = $2, percentage_score = $3
         WHERE id = $4`,
        [correctCount, qualifiesForNextRound, percentageScore, attempt.id]
      );

      // Return the final result
      return res.json({
        message: 'Quiz completed!',
        attemptId: attempt.id,
        completed: true,
        score: correctCount,
        totalQuestions,
        qualifiesForNextRound,
        minimumScoreRequired: Math.ceil(totalQuestions / 2),
        percentageScore,
        progress
      });
    }

    // Return the progress
    res.json({
      attemptId: attempt.id,
      completed: false,
      answeredCount,
      totalQuestions,
      correctCount,
      progress
    });
  } catch (error) {
    console.error('Error recording quiz progress:', error);
    res.status(500).json({ 
      error: 'Could not record quiz progress',
      details: error.message || 'Unknown error'
    });
  }
});

// Get user's quiz progress
router.get('/', authenticateUser, async (req, res) => {
  const userId = req.user.id;

  try {
    // Get the user's attempt
    const attempt = await db.oneOrNone(
      'SELECT * FROM user_quiz_attempts WHERE user_id = $1',
      [userId]
    );

    if (!attempt) {
      return res.json({
        hasAttempt: false,
        message: 'No quiz attempt found for this user'
      });
    }

    // Get total questions count from the attempt record or query if not available
    let totalQuestions = attempt.total_questions;
    if (!totalQuestions) {
      totalQuestions = await db.one(
        'SELECT COUNT(*) FROM questions WHERE season_id = (SELECT id FROM seasons WHERE is_active = true LIMIT 1)',
        [],
        count => parseInt(count.count)
      );
      
      // Update the attempt with the total questions count if it wasn't set
      await db.none(
        'UPDATE user_quiz_attempts SET total_questions = $1 WHERE id = $2',
        [totalQuestions, attempt.id]
      );
    }

    // Get progress details
    const progress = await db.any(
      `SELECT qp.*, q.question, q.options, q.correct_answer 
       FROM quiz_progress qp
       JOIN questions q ON qp.question_id = q.id
       WHERE qp.attempt_id = $1
       ORDER BY qp.answered_at`,
      [attempt.id]
    );

    // Get answered questions count
    const answeredCount = progress.length;

    // Get correct answers count
    const correctCount = progress.filter(p => p.is_correct).length;

    res.json({
      hasAttempt: true,
      attemptId: attempt.id,
      completed: attempt.completed,
      score: attempt.score,
      startedAt: attempt.started_at,
      completedAt: attempt.completed_at,
      answeredCount,
      totalQuestions,
      correctCount,
      progress
    });
  } catch (error) {
    console.error('Error fetching quiz progress:', error);
    res.status(500).json({ error: 'Could not fetch quiz progress' });
  }
});

export default router;
