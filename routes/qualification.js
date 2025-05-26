import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get user's qualification status
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if tables exist
    const tablesExist = await db.oneOrNone(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'questions'
      ) as questions_exist,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'quiz_sessions'
      ) as sessions_exist`
    );

    if (!tablesExist.questions_exist || !tablesExist.sessions_exist) {
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'Quiz not yet available.'
      });
    }

    // First, get total number of questions
    const totalQuestions = await db.oneOrNone(
      'SELECT COUNT(*) as count FROM questions'
    );
    
    if (!totalQuestions || !totalQuestions.count) {
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'No questions available yet.'
      });
    }
    
    try {
      // Check if user has completed the quiz
      const attempt = await db.oneOrNone(
        `SELECT 
          id, 
          score, 
          qualifies_for_next_round,
          percentage_score,
          $1 as total_questions
        FROM 
          quiz_sessions
        WHERE 
          user_id = $2 AND completed = true
        ORDER BY 
          completed_at DESC
        LIMIT 1`,
        [totalQuestions.count, userId]
      );
      
      // If no completed attempt, check for any attempt
      if (!attempt) {
        const anyAttempt = await db.oneOrNone(
          `SELECT 
            id, 
            score,
            $1 as total_questions
          FROM 
            quiz_sessions
          WHERE 
            user_id = $2
          ORDER BY 
            created_at DESC
          LIMIT 1`,
          [totalQuestions.count, userId]
        );
        
        if (anyAttempt) {
          return res.json({
            hasAttempted: true,
            isQualified: false,
            score: anyAttempt.score,
            totalQuestions: anyAttempt.total_questions,
            percentageScore: 0,
            minimumRequired: Math.ceil(anyAttempt.total_questions * 0.5),
            message: 'You have an incomplete attempt. Please complete the quiz to see if you qualify.'
          });
        }
      }

      if (!attempt) {
        // User has not taken the quiz yet
        return res.json({
          hasAttempted: false,
          isQualified: false,
          message: 'You have not attempted the quiz yet.'
        });
      }

      // Calculate minimum score required (50%)
      const minimumRequired = Math.ceil(attempt.total_questions * 0.5);
      const percentageScore = attempt.percentage_score || 
        (attempt.score / attempt.total_questions) * 100;
      const isQualified = percentageScore >= 50;
      
      return res.json({
        hasAttempted: true,
        isQualified,
        score: attempt.score,
        totalQuestions: attempt.total_questions,
        percentageScore: percentageScore.toFixed(2),
        minimumRequired,
        message: isQualified
          ? 'Congratulations! You have qualified for the next round.' 
          : `You did not meet the minimum score requirement of ${minimumRequired} points (50%).`
      });
    } catch (dbError) {
      console.error('Database error in qualification endpoint:', dbError);
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'Quiz data not yet available.'
      });
    }
  } catch (error) {
    console.error('Error in qualification endpoint:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: error.message 
    });
  }
});

export default router;
