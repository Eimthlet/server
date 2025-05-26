import express from 'express';
import db from '../config/database.js';
import path from 'path';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Explicit route handlers
router.get('/', authenticateUser, async (req, res) => {
  console.log('Questions route accessed (GET /):', {
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
    method: req.method,
    userId: req.user?.id || 'Not authenticated'
  });

  try {
    // First check if there's an active season
    console.log('Checking for active seasons');
    const activeSeason = await db.oneOrNone(`
      SELECT id, name, is_qualification_round, minimum_score_percentage
      FROM seasons 
      WHERE is_active = true 
      AND start_date <= NOW() 
      AND end_date >= NOW()
      LIMIT 1
    `);

    if (!activeSeason) {
      console.log('No active season found');
      return res.status(200).json({
        questions: [],
        message: 'There is no active quiz season at the moment. Please check back later.',
        status: 'NO_ACTIVE_SEASON'
      });
    }

    console.log('Active season found:', activeSeason);

    // If there's a qualification round, check if the user is qualified
    if (activeSeason.is_qualification_round === false && req.user) {
      console.log('Checking if user is qualified for this season');
      
      // Check if user has qualified in a previous qualification round
      const userQualification = await db.oneOrNone(`
        SELECT * FROM quiz_results 
        WHERE user_id = $1 
        AND season_id = $2 
        AND score >= (
          SELECT COUNT(*) * (minimum_score_percentage / 100.0)
          FROM questions
          WHERE season_id = $2
        )
      `, [req.user.id, activeSeason.id]);

      if (!userQualification) {
        console.log('User is not qualified for this season');
        return res.status(200).json({
          questions: [],
          message: 'You did not qualify for this season. Please wait for the next qualification round.',
          status: 'NOT_QUALIFIED'
        });
      }
      
      console.log('User is qualified for this season');
    }

    // Fetch questions for the active season
    console.log('Fetching questions for active season');
    const questions = await db.any('SELECT * FROM questions WHERE season_id = $1', [activeSeason.id]);
    
    console.log(`Fetched ${questions.length} questions for season ${activeSeason.id}`, {
      questionIds: questions.map(q => q.id),
      questionDetails: questions.slice(0, 2) // Log first 2 questions for debugging
    });
    
    if (questions.length === 0) {
      console.warn('No questions found for the active season');
      return res.status(200).json({
        questions: [],
        message: 'No questions are available for the current season yet.',
        status: 'NO_QUESTIONS'
      });
    }

    const formattedQuestions = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      correctAnswer: q.correct_answer, // Note: Using correct_answer instead of correctAnswer
      category: q.category,
      difficulty: q.difficulty,
      seasonId: q.season_id
    }));

    console.log('Sending questions response', {
      questionCount: formattedQuestions.length,
      firstQuestionDetails: formattedQuestions[0] || 'No questions'
    });
    
    res.json({ 
      questions: formattedQuestions,
      season: {
        id: activeSeason.id,
        name: activeSeason.name,
        isQualificationRound: activeSeason.is_qualification_round,
        minimumScorePercentage: activeSeason.minimum_score_percentage
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to load questions', 
      message: error.message,
      details: 'An unexpected error occurred while fetching questions'
    });
  }
});

export default router;
