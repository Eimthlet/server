import express from 'express';
import jwt from 'jsonwebtoken';
import { promises as fs } from 'fs';
import path from 'path';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';

// Ensure all routes that require admin access use the middleware

const router = express.Router();
const DISQUALIFIED_USERS_PATH = path.join(process.cwd(), 'disqualified_users.json');

// Get all users with their latest quiz results
router.get('/users', isAdmin, async (req, res) => {
  const query = `
    SELECT 
      u.id,
      u.email,
      u.created_at,
      qr.score,
      qr.completed_at
    FROM users u
    LEFT JOIN quiz_results qr ON u.id = qr.user_id
    WHERE qr.id = (
      SELECT MAX(id) FROM quiz_results WHERE user_id = u.id
    )
    ORDER BY qr.score DESC NULLS LAST,
             qr.completed_at ASC NULLS LAST;
  `;

  try {
    const users = await db.any(query);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get disqualified users
router.get('/disqualified-users', isAdmin, async (req, res) => {
  try {
    // Read disqualified users from file
    let disqualifiedUsers = [];
    try {
      const data = await fs.readFile(DISQUALIFIED_USERS_PATH, 'utf8');
      disqualifiedUsers = JSON.parse(data);
    } catch (readError) {
      // If file doesn't exist, return an empty array
      if (readError.code !== 'ENOENT') {
        throw readError;
      }
    }

    // Fetch additional user details for disqualified users
    const detailedDisqualifiedUsers = await Promise.all(
      disqualifiedUsers.map(async (disqUser) => {
        return new Promise((resolve, reject) => {
          db.get(
            'SELECT id, email, username FROM users WHERE id = ?', 
            [disqUser.id], 
            (err, userDetails) => {
              if (err) {
                console.error('Error fetching user details:', err);
                resolve({
                  ...disqUser,
                  email: 'Unknown',
                  username: 'Unknown'
                });
              } else {
                resolve({
                  ...disqUser,
                  email: userDetails?.email || 'Unknown',
                  username: userDetails?.username || 'Unknown'
                });
              }
            }
          );
        });
      })
    );

    res.json(detailedDisqualifiedUsers);
  } catch (error) {
    console.error('Error fetching disqualified users:', error);
    res.status(500).json({ error: 'Failed to fetch disqualified users' });
  }
});

// Get detailed stats for a specific user
router.get('/stats/:userId', isAdmin, async (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT 
      qr.score,
      qr.completed_at,
      r.name as round_name,
      r.round_number,
      r.min_score_to_qualify,
      s.name as season_name
    FROM quiz_results qr
    LEFT JOIN rounds r ON qr.round_id = r.id
    LEFT JOIN seasons s ON qr.season_id = s.id
    WHERE qr.user_id = $1
    ORDER BY qr.completed_at DESC
  `;

  try {
    const rows = await db.any(query, [userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get season statistics
router.get('/seasons', isAdmin, async (req, res) => {
  const query = `
    SELECT 
      s.id,
      s.name,
      COUNT(DISTINCT qr.user_id) as total_participants,
      AVG(qr.score) as average_score,
      COUNT(CASE WHEN qr.score >= r.min_score_to_qualify THEN 1 END) as qualified_users
    FROM seasons s
    LEFT JOIN quiz_results qr ON s.id = qr.season_id
    LEFT JOIN rounds r ON qr.round_id = r.id
    GROUP BY s.id
    ORDER BY s.start_date DESC
  `;

  try {
    const rows = await db.any(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching season stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new season
router.post('/seasons', isAdmin, async (req, res) => {
  const { name, startDate, endDate } = req.body;
  
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'Name, start date, and end date are required' });
  }

  const query = `
    INSERT INTO seasons (name, start_date, end_date, created_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    RETURNING id
  `;

  try {
    const result = await db.one(query, [name, startDate, endDate]);
    res.json({ id: result.id });
  } catch (error) {
    console.error('Error creating season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update a season
router.put('/seasons/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate } = req.body;
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (startDate) {
      updates.push(`start_date = $${paramCount++}`);
      values.push(startDate);
    }
    if (endDate) {
      updates.push(`end_date = $${paramCount++}`);
      values.push(endDate);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    values.push(id);
    
    const query = `
      UPDATE seasons 
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *`;

    const result = await db.oneOrNone(query, values);
    
    if (!result) {
      return res.status(404).json({ error: 'Season not found' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error updating season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete a season
router.delete('/seasons/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    await db.none('DELETE FROM seasons WHERE id = $1', [id]);
    res.json({ message: 'Season deleted successfully' });
  } catch (error) {
    console.error('Error deleting season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Activate a season
router.put('/seasons/:id/activate', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.none('UPDATE seasons SET is_active = false');
    await db.none('UPDATE seasons SET is_active = true WHERE id = $1', [id]);
    const season = await db.one('SELECT * FROM seasons WHERE id = $1', [id]);
    res.json(season);
  } catch (error) {
    console.error('Error activating season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new round
router.post('/rounds', isAdmin, async (req, res) => {
  const { name, startDate, endDate, seasonId, roundNumber } = req.body;
  
  if (!name || !startDate || !endDate || !seasonId || !roundNumber) {
    return res.status(400).json({ error: 'Name, start date, end date, season ID, and round number are required' });
  }

  const query = `
    INSERT INTO rounds (name, start_date, end_date, season_id, round_number, is_active)
    VALUES ($1, $2, $3, $4, $5, 0)
    RETURNING id
  `;

  try {
    const result = await db.one(query, [name, startDate, endDate, seasonId, roundNumber]);
    const round = await db.one('SELECT * FROM rounds WHERE id = $1', [result.id]);
    res.json(round);
  } catch (error) {
    console.error('Error creating round:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update a round
router.put('/rounds/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate, roundNumber } = req.body;
  
  const updates = [];
  const values = [];
  
  if (name) {
    updates.push('name = $1');
    values.push(name);
  }
  if (startDate) {
    updates.push('start_date = $2');
    values.push(startDate);
  }
  if (endDate) {
    updates.push('end_date = $3');
    values.push(endDate);
  }
  if (roundNumber) {
    updates.push('round_number = $4');
    values.push(roundNumber);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }
  
  values.push(id);
  
  const query = `
    UPDATE rounds 
    SET ${updates.join(', ')}
    WHERE id = $${values.length}
    RETURNING *
  `;

  try {
    const round = await db.one('SELECT season_id FROM rounds WHERE id = $1', [id]);
    
    await db.none('UPDATE rounds SET is_active = 0 WHERE season_id = $1', [round.season_id]);
    await db.none('UPDATE rounds SET is_active = 1 WHERE id = $1', [id]);
    const activatedRound = await db.one('SELECT * FROM rounds WHERE id = $1', [id]);
    res.json(activatedRound);
  } catch (error) {
    console.error('Error activating round:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
