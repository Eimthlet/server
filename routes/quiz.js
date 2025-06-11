import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { canAttemptQualification } from '../middleware/seasonAccess.js';
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
router.post('/start-qualification', 
  authenticateUser, 
  canAttemptQualification,
  async (req, res) => {
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
       ORDER BY started_at DESC 
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
    const newAttempt = await db.one(
      `INSERT INTO user_quiz_attempts 
       (user_id, season_id, started_at, total_questions_in_attempt) 
       VALUES ($1, $2, NOW(), $3)
       RETURNING id`,
      [userId, qualificationRound.id, questions.length]
    );
    const attemptId = newAttempt.id;

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

// Submit quiz answers
router.post('/submit', authenticateUser, async (req, res) => {
  const { attemptId, answers } = req.body;
  const userId = req.user.id;

  if (!attemptId || !answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    // Start a transaction
    await db.tx(async t => {
      // Verify the attempt exists and belongs to the user
      const attempt = await t.oneOrNone(
        `SELECT uqa.*, s.is_qualification_round, s.minimum_score_percentage 
         FROM user_quiz_attempts uqa
         LEFT JOIN seasons s ON uqa.season_id = s.id
         WHERE uqa.id = $1 AND uqa.user_id = $2
         FOR UPDATE`,
        [attemptId, userId]
      );

      if (!attempt) {
        throw { status: 404, message: 'Quiz attempt not found' };
      }

      if (attempt.completed) {
        throw { status: 400, message: 'This quiz attempt has already been submitted' };
      }

      // Calculate score
      let score = 0;
      const questionIds = answers.map(a => a.questionId);
      
      const questions = await t.any(
        'SELECT id, correct_answer FROM questions WHERE id = ANY($1)',
        [questionIds]
      );

      const questionMap = new Map(questions.map(q => [q.id, q.correct_answer]));
      
      answers.forEach(answer => {
        if (questionMap.get(answer.questionId) === answer.answer) {
          score++;
        }
      });

      const percentageScore = (score / questionIds.length) * 100;
      const passed = percentageScore >= (attempt.minimum_score_percentage || 70);

      // Update the attempt
      await t.none(
        `UPDATE user_quiz_attempts 
         SET completed = true, 
             score = $1, 
             percentage_score = $2,
             qualifies_for_next_round = $3,
             completed_at = NOW()
         WHERE id = $4`,
        [score, percentageScore, passed, attemptId]
      );

      // If this was a qualification attempt, update user's qualification status
      if (attempt.is_qualification_round) {
        await t.none(
          `UPDATE users 
           SET has_passed_qualification = $1,
               last_qualification_attempt = NOW()
           WHERE id = $2`,
          [passed, userId]
        );
      }

      return { score, totalQuestions: questionIds.length, percentageScore, passed };
    })
    .then(({ score, totalQuestions, percentageScore, passed }) => {
      res.json({
        success: true,
        score,
        totalQuestions,
        percentageScore: parseFloat(percentageScore.toFixed(2)),
        passed,
        isQualificationRound: attempt.is_qualification_round
      });
    });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    const status = error.status || 500;
    const message = error.message || 'Failed to submit quiz';
    res.status(status).json({ 
      success: false,
      error: message,
      code: error.code
    });
  }
});

// Check if user needs to complete qualification
router.get('/check-qualification', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Check if user has already passed qualification
    const user = await db.oneOrNone(
      'SELECT has_passed_qualification, last_qualification_attempt FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // If user already passed qualification
    if (user.has_passed_qualification) {
      return res.json({
        needsQualification: false,
        hasPassed: true,
        lastAttempt: user.last_qualification_attempt
      });
    }

    // Check if there's an active qualification round
    const qualificationRound = await db.oneOrNone(
      `SELECT id, name, start_date, end_date, minimum_score_percentage 
       FROM seasons 
       WHERE is_qualification_round = true 
       AND is_active = true 
       AND start_date <= NOW() 
       AND end_date >= NOW()
       ORDER BY start_date DESC 
       LIMIT 1`
    );

    if (!qualificationRound) {
      return res.json({
        needsQualification: false,
        hasPassed: false,
        message: 'No active qualification round',
        canProceed: true // Allow access if no qualification round is active
      });
    }

    // Check if user has any completed qualification attempts for current round
    const hasAttempted = await db.oneOrNone(
      `SELECT 1 FROM user_quiz_attempts 
       WHERE user_id = $1 
       AND season_id = $2 
       AND completed = true
       LIMIT 1`,
      [userId, qualificationRound.id]
    );

    res.json({
      needsQualification: true,
      hasPassed: false,
      qualificationRound: {
        id: qualificationRound.id,
        name: qualificationRound.name,
        startDate: qualificationRound.start_date,
        endDate: qualificationRound.end_date,
        minimumScorePercentage: qualificationRound.minimum_score_percentage
      },
      hasAttempted: !!hasAttempted,
      lastAttempt: user.last_qualification_attempt
    });

  } catch (error) {
    console.error('Error checking qualification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check qualification status',
      error: error.message,
      code: 'QUALIFICATION_CHECK_ERROR'
    });
  }
});

export default router;
