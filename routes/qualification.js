import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get user's qualification status
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // First, get total number of questions
    const totalQuestions = await db.oneOrNone(
      'SELECT COUNT(*) as count FROM questions'
    );
    
    if (!totalQuestions) {
      return res.status(500).json({ 
        error: 'Database error',
        details: 'Could not retrieve total number of questions' 
      });
    }
    
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
    
  } catch (error) {
    console.error('Error checking qualification status:', error);
    res.status(500).json({ message: 'Server error while checking qualification status' });
  }
});

export default router;
