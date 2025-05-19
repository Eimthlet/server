import express from 'express';
import sqlite3 from 'sqlite3';

const router = express.Router();

// POST /api/disqualify
router.post('/', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  const db = new sqlite3.Database('quiz.db');
  db.run('UPDATE users SET status = $1 WHERE id = $2', ['disqualified', userId], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
    db.close();
  });
});

export default router;
