import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get leaderboard of top quiz performers
router.get('/', authenticateUser, async (req, res) => {
  const { range } = req.query; // 'monthly' or 'all-time'
  try {
    const leaderboard = await db.any(
      `SELECT 
        u.id as user_id,
        u.username,
        uqa.score,
        uqa.completed_at,
        COUNT(qp.id) as questions_answered,
        (SELECT COUNT(*) FROM questions) as total_questions
      FROM 
        user_quiz_attempts uqa
      JOIN 
        users u ON uqa.user_id = u.id
      LEFT JOIN 
        quiz_progress qp ON uqa.id = qp.attempt_id
      WHERE 
        uqa.completed = true
        ${range === 'monthly' ? "AND TO_CHAR(uqa.completed_at, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')" : ""}
      GROUP BY 
        u.id, u.username, uqa.score, uqa.completed_at
      ORDER BY 
        uqa.score DESC, uqa.completed_at ASC
      LIMIT 20`
    );

    // Get the current user's rank if they've completed the quiz
    let userRank = null;
    if (req.user && req.user.id) {
      const userRankResult = await db.oneOrNone(
        `SELECT rank
        FROM (
          SELECT 
            user_id,
            RANK() OVER (ORDER BY score DESC, completed_at ASC) as rank
          FROM 
            user_quiz_attempts
          WHERE 
            completed = true
            ${range === 'monthly' ? "AND TO_CHAR(completed_at, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')" : ""}
        ) as rankings
        WHERE user_id = $1`,
        [req.user.id]
      );

      if (userRankResult) {
        userRank = userRankResult.rank;
      }
    }

    res.json({
      leaderboard,
      userRank,
      currentUserId: req.user.id
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Could not fetch leaderboard' });
  }
});

export default router;
