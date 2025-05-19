import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// POST /api/disqualify
router.post('/', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    await db.none('UPDATE users SET status = $1 WHERE id = $2', ['disqualified', userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
