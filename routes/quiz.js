import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

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
    await db.none('UPDATE users SET disqualified = true WHERE id = $1', [userId]);
    res.json({ message: 'User disqualified successfully' });
  } catch (error) {
    console.error('Error disqualifying user:', error);
    res.status(500).json({ error: 'Could not disqualify user' });
  }
});

export default router;
