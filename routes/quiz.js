import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import jwt from 'jsonwebtoken';

const router = express.Router();
const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Route to disqualify user from quiz
router.post('/disqualify', verifyToken, (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Check if the requesting user matches the user being disqualified
  if (req.user.id !== userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  db.run('UPDATE users SET disqualified = 1 WHERE id = ?', [userId], (err) => {
    if (err) {
      console.error('Error disqualifying user:', err);
      return res.status(500).json({ error: 'Could not disqualify user' });
    }

    res.json({ message: 'User disqualified successfully' });
  });
});

export default router;
