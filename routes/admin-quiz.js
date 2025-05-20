import express from 'express';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get all quiz attempts with user details
router.get('/attempts', isAdmin, async (req, res) => {
  try {
    const attempts = await db.any(`
      SELECT 
        uqa.id as attempt_id,
        u.id as user_id,
        u.username,
        u.email,
        uqa.score,
        uqa.completed,
        uqa.started_at,
        uqa.completed_at,
        (SELECT COUNT(*) FROM quiz_progress WHERE attempt_id = uqa.id) as questions_answered,
        (SELECT COUNT(*) FROM questions) as total_questions
      FROM 
        user_quiz_attempts uqa
      JOIN 
        users u ON uqa.user_id = u.id
      ORDER BY 
        uqa.completed DESC,
        uqa.score DESC,
        uqa.completed_at ASC
    `);
    
    res.json(attempts);
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    res.status(500).json({ error: 'Could not fetch quiz attempts' });
  }
});

// Get detailed progress for a specific attempt
router.get('/attempts/:attemptId', isAdmin, async (req, res) => {
  const { attemptId } = req.params;
  
  try {
    // Get attempt details
    const attempt = await db.oneOrNone(`
      SELECT 
        uqa.*,
        u.username,
        u.email
      FROM 
        user_quiz_attempts uqa
      JOIN 
        users u ON uqa.user_id = u.id
      WHERE 
        uqa.id = $1
    `, [attemptId]);
    
    if (!attempt) {
      return res.status(404).json({ error: 'Quiz attempt not found' });
    }
    
    // Get progress details
    const progress = await db.any(`
      SELECT 
        qp.*,
        q.question,
        q.options,
        q.correct_answer
      FROM 
        quiz_progress qp
      JOIN 
        questions q ON qp.question_id = q.id
      WHERE 
        qp.attempt_id = $1
      ORDER BY 
        qp.answered_at
    `, [attemptId]);
    
    res.json({
      attempt,
      progress,
      totalQuestions: await db.one('SELECT COUNT(*) FROM questions', [], count => parseInt(count.count))
    });
  } catch (error) {
    console.error('Error fetching attempt details:', error);
    res.status(500).json({ error: 'Could not fetch attempt details' });
  }
});

// Reset a user's quiz attempt (admin only)
router.delete('/attempts/:attemptId', isAdmin, async (req, res) => {
  const { attemptId } = req.params;
  
  try {
    // Start a transaction
    await db.tx(async t => {
      // Delete progress first (due to foreign key constraint)
      await t.none('DELETE FROM quiz_progress WHERE attempt_id = $1', [attemptId]);
      
      // Then delete the attempt
      const result = await t.result('DELETE FROM user_quiz_attempts WHERE id = $1', [attemptId]);
      
      if (result.rowCount === 0) {
        throw new Error('Quiz attempt not found');
      }
    });
    
    res.json({ message: 'Quiz attempt reset successfully' });
  } catch (error) {
    console.error('Error resetting quiz attempt:', error);
    res.status(500).json({ error: 'Could not reset quiz attempt' });
  }
});

// Get quiz statistics
router.get('/statistics', isAdmin, async (req, res) => {
  try {
    const stats = await db.one(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM user_quiz_attempts) as total_attempts,
        (SELECT COUNT(*) FROM user_quiz_attempts WHERE completed = true) as completed_attempts,
        (SELECT AVG(score) FROM user_quiz_attempts WHERE completed = true) as average_score,
        (SELECT MAX(score) FROM user_quiz_attempts) as highest_score,
        (SELECT COUNT(*) FROM questions) as total_questions,
        (SELECT COUNT(*) FROM quiz_progress) as total_answers,
        (SELECT COUNT(*) FROM quiz_progress WHERE is_correct = true) as correct_answers
    `);
    
    // Calculate percentage of correct answers
    stats.correct_answer_percentage = stats.total_answers > 0 
      ? Math.round((stats.correct_answers / stats.total_answers) * 100) 
      : 0;
    
    // Get most difficult questions (lowest correct answer percentage)
    const difficultQuestions = await db.any(`
      SELECT
        q.id,
        q.question,
        q.correct_answer,
        COUNT(qp.id) as total_attempts,
        SUM(CASE WHEN qp.is_correct THEN 1 ELSE 0 END) as correct_count,
        ROUND(SUM(CASE WHEN qp.is_correct THEN 1 ELSE 0 END)::numeric / COUNT(qp.id) * 100, 2) as correct_percentage
      FROM
        questions q
      LEFT JOIN
        quiz_progress qp ON q.id = qp.question_id
      GROUP BY
        q.id, q.question, q.correct_answer
      HAVING
        COUNT(qp.id) > 0
      ORDER BY
        correct_percentage ASC
      LIMIT 5
    `);
    
    res.json({
      ...stats,
      difficultQuestions
    });
  } catch (error) {
    console.error('Error fetching quiz statistics:', error);
    res.status(500).json({ error: 'Could not fetch quiz statistics' });
  }
});

export default router;
