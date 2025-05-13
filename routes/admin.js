import express from 'express';
import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import path from 'path';
import { promises as fs } from 'fs';
import { isAdmin } from '../index.js';

// Ensure all routes that require admin access use the middleware

const router = express.Router();
const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
const DISQUALIFIED_USERS_PATH = path.join(process.cwd(), 'disqualified_users.json');

// Get all users with their latest quiz results
router.get('/users', isAdmin, (req, res) => {
  const query = `
    SELECT 
      u.id,
      u.email,
      u.created_at,
      qr.score,
      r.round_number,
      r.min_score_to_qualify,
      s.name as season_name,
      CASE 
        WHEN qr.score >= r.min_score_to_qualify THEN 1
        ELSE 0
      END as qualified
    FROM users u
    LEFT JOIN quiz_results qr ON u.id = qr.user_id
    LEFT JOIN rounds r ON qr.round_id = r.id
    LEFT JOIN seasons s ON qr.season_id = s.id
    ORDER BY u.created_at DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
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
router.get('/users/:userId', isAdmin, (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT 
      qr.score,
      qr.completed_at,
      r.round_number,
      r.min_score_to_qualify,
      s.name as season_name,
      CASE 
        WHEN qr.score >= r.min_score_to_qualify THEN 1
        ELSE 0
      END as qualified
    FROM quiz_results qr
    JOIN rounds r ON qr.round_id = r.id
    JOIN seasons s ON qr.season_id = s.id
    WHERE qr.user_id = ?
    ORDER BY qr.completed_at DESC
  `;

  db.all(query, [userId], (err, rows) => {
    if (err) {
      console.error('Error fetching user stats:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Get season statistics
router.get('/seasons', isAdmin, (req, res) => {
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

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching season stats:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Create a new season
router.post('/seasons', isAdmin, (req, res) => {
  const { name, startDate, endDate } = req.body;
  
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'Name, start date, and end date are required' });
  }

  const query = `
    INSERT INTO seasons (name, start_date, end_date, is_active)
    VALUES (?, ?, ?, 0)
  `;

  db.run(query, [name, startDate, endDate], function(err) {
    if (err) {
      console.error('Error creating season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Return the created season
    db.get(
      'SELECT * FROM seasons WHERE id = ?',
      [this.lastID],
      (err, season) => {
        if (err) {
          console.error('Error fetching created season:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(season);
      }
    );
  });
});

// Update a season
router.put('/seasons/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate } = req.body;
  
  const updates = [];
  const values = [];
  
  if (name) {
    updates.push('name = ?');
    values.push(name);
  }
  if (startDate) {
    updates.push('start_date = ?');
    values.push(startDate);
  }
  if (endDate) {
    updates.push('end_date = ?');
    values.push(endDate);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }
  
  values.push(id);
  
  const query = `
    UPDATE seasons 
    SET ${updates.join(', ')}
    WHERE id = ?
  `;

  db.run(query, values, function(err) {
    if (err) {
      console.error('Error updating season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Season not found' });
    }
    
    // Return the updated season
    db.get(
      'SELECT * FROM seasons WHERE id = ?',
      [id],
      (err, season) => {
        if (err) {
          console.error('Error fetching updated season:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(season);
      }
    );
  });
});

// Delete a season
router.delete('/seasons/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM seasons WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Season not found' });
    }
    
    res.json({ message: 'Season deleted successfully' });
  });
});

// Activate a season
router.post('/seasons/:id/activate', isAdmin, (req, res) => {
  const { id } = req.params;
  
  db.serialize(() => {
    // First, deactivate all seasons
    db.run('UPDATE seasons SET is_active = 0', [], (err) => {
      if (err) {
        console.error('Error deactivating seasons:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Then, activate the specified season
      db.run('UPDATE seasons SET is_active = 1 WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('Error activating season:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Season not found' });
        }
        
        // Return the activated season
        db.get(
          'SELECT * FROM seasons WHERE id = ?',
          [id],
          (err, season) => {
            if (err) {
              console.error('Error fetching activated season:', err);
              return res.status(500).json({ error: 'Database error' });
            }
            res.json(season);
          }
        );
      });
    });
  });
});

// Create a new round
router.post('/rounds', isAdmin, (req, res) => {
  const { name, startDate, endDate, seasonId, roundNumber } = req.body;
  
  if (!name || !startDate || !endDate || !seasonId || !roundNumber) {
    return res.status(400).json({ error: 'Name, start date, end date, season ID, and round number are required' });
  }

  const query = `
    INSERT INTO rounds (name, start_date, end_date, season_id, round_number, is_active)
    VALUES (?, ?, ?, ?, ?, 0)
  `;

  db.run(query, [name, startDate, endDate, seasonId, roundNumber], function(err) {
    if (err) {
      console.error('Error creating round:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // Return the created round
    db.get(
      'SELECT * FROM rounds WHERE id = ?',
      [this.lastID],
      (err, round) => {
        if (err) {
          console.error('Error fetching created round:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(round);
      }
    );
  });
});

// Update a round
router.put('/rounds/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate, roundNumber } = req.body;
  
  const updates = [];
  const values = [];
  
  if (name) {
    updates.push('name = ?');
    values.push(name);
  }
  if (startDate) {
    updates.push('start_date = ?');
    values.push(startDate);
  }
  if (endDate) {
    updates.push('end_date = ?');
    values.push(endDate);
  }
  if (roundNumber) {
    updates.push('round_number = ?');
    values.push(roundNumber);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }
  
  values.push(id);
  
  const query = `
    UPDATE rounds 
    SET ${updates.join(', ')}
    WHERE id = ?
  `;

  db.run(query, values, function(err) {
    if (err) {
      console.error('Error updating round:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }
    
    // Return the updated round
    db.get(
      'SELECT * FROM rounds WHERE id = ?',
      [id],
      (err, round) => {
        if (err) {
          console.error('Error fetching updated round:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(round);
      }
    );
  });
});

// Delete a round
router.delete('/rounds/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM rounds WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting round:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Round not found' });
    }
    
    res.json({ message: 'Round deleted successfully' });
  });
});

// Activate a round
router.post('/rounds/:id/activate', isAdmin, (req, res) => {
  const { id } = req.params;
  
  db.serialize(() => {
    // First, get the season ID for this round
    db.get('SELECT season_id FROM rounds WHERE id = ?', [id], (err, round) => {
      if (err) {
        console.error('Error fetching round:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!round) {
        return res.status(404).json({ error: 'Round not found' });
      }
      
      // Deactivate all rounds in this season
      db.run('UPDATE rounds SET is_active = 0 WHERE season_id = ?', [round.season_id], (err) => {
        if (err) {
          console.error('Error deactivating rounds:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        // Activate the specified round
        db.run('UPDATE rounds SET is_active = 1 WHERE id = ?', [id], function(err) {
          if (err) {
            console.error('Error activating round:', err);
            return res.status(500).json({ error: 'Database error' });
          }
          
          // Return the activated round
          db.get(
            'SELECT * FROM rounds WHERE id = ?',
            [id],
            (err, round) => {
              if (err) {
                console.error('Error fetching activated round:', err);
                return res.status(500).json({ error: 'Database error' });
              }
              res.json(round);
            }
          );
        });
      });
    });
  });
});

export default router;
