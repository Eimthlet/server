import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get user's qualification status
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user has completed the quiz
    const attempt = await db.oneOrNone(
      `SELECT 
        id, 
        score, 
        qualifies_for_next_round,
        percentage_score,
        (SELECT COUNT(*) FROM questions) as total_questions
      FROM 
        user_quiz_attempts
      WHERE 
        user_id = $1 AND completed = true
      ORDER BY 
        completed_at DESC
      LIMIT 1`,
      [userId]
    );

    if (!attempt) {
      // User has not taken the quiz yet
      return res.json({
        hasAttempted: false,
        isQualified: false,
        message: 'You have not attempted the quiz yet.'
      });
    }

    // Calculate minimum score required (50%)
    const minimumRequired = Math.ceil(attempt.total_questions / 2);
    
    return res.json({
      hasAttempted: true,
      isQualified: attempt.qualifies_for_next_round,
      score: attempt.score,
      totalQuestions: attempt.total_questions,
      percentageScore: attempt.percentage_score,
      minimumRequired,
      message: attempt.qualifies_for_next_round 
        ? 'Congratulations! You have qualified for the next round.' 
        : `You did not meet the minimum score requirement of ${minimumRequired} points (50%).`
    });
    
  } catch (error) {
    console.error('Error checking qualification status:', error);
    res.status(500).json({ message: 'Server error while checking qualification status' });
  }
});

export default router;
