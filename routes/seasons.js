import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import { isAdmin } from '../middlewares/auth.js';
import { validateAndFormatDate, validateDateRange } from '../utils/dateUtils.js';

const router = express.Router();
const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));

// Get all seasons
router.get('/seasons', isAdmin, (req, res) => {
  const query = `
    SELECT 
      s.*,
      COUNT(DISTINCT q.id) as question_count,
      COUNT(DISTINCT qr.id) as attempts_count,
      COUNT(DISTINCT CASE WHEN qr.score >= s.minimum_score_percentage THEN qr.user_id END) as qualified_users_count
    FROM seasons s
    LEFT JOIN season_questions sq ON s.id = sq.season_id
    LEFT JOIN questions q ON sq.question_id = q.id
    LEFT JOIN quiz_results qr ON s.id = qr.season_id
    GROUP BY s.id
    ORDER BY s.start_date DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching seasons:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Get active season
router.get('/active', (req, res) => {
  const query = `
    SELECT 
      s.*,
      COUNT(DISTINCT q.id) as question_count
    FROM seasons s
    LEFT JOIN season_questions sq ON s.id = sq.season_id
    LEFT JOIN questions q ON sq.question_id = q.id
    WHERE s.is_active = 1
    GROUP BY s.id
  `;

  db.get(query, [], (err, row) => {
    if (err) {
      console.error('Error fetching active season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'No active season found' });
    }
    res.json(row);
  });
});

// Get season by ID
router.get('/:id', isAdmin, (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      s.*,
      COUNT(DISTINCT q.id) as question_count,
      COUNT(DISTINCT qr.id) as attempts_count,
      COUNT(DISTINCT CASE WHEN qr.score >= s.minimum_score_percentage THEN qr.user_id END) as qualified_users_count
    FROM seasons s
    LEFT JOIN season_questions sq ON s.id = sq.season_id
    LEFT JOIN questions q ON sq.question_id = q.id
    LEFT JOIN quiz_results qr ON s.id = qr.season_id
    WHERE s.id = ?
    GROUP BY s.id
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('Error fetching season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json(row);
  });
});

// Create new season
router.post('/seasons', isAdmin, async (req, res) => {
  const {
    name,
    description,
    start_date,
    end_date,
    is_active,
    is_qualification_round,
    minimum_score_percentage
  } = req.body;

  if (!name || !start_date || !end_date || minimum_score_percentage === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate dates
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (endDate <= startDate) {
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  // If this season is being set as active, deactivate all other seasons first
  if (is_active) {
    db.run('UPDATE seasons SET is_active = 0 WHERE id != ?', [-1], (err) => {
      if (err) {
        console.error('Error deactivating other seasons:', err);
        return res.status(500).json({ error: 'Database error' });
      }
    });
  }

  const query = `
    INSERT INTO seasons (
      name, description, start_date, end_date, 
      is_active, is_qualification_round, minimum_score_percentage,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;

  db.run(query, [
    name,
    description || null,
    start_date,
    end_date,
    is_active ? 1 : 0,
    is_qualification_round ? 1 : 0,
    minimum_score_percentage
  ], function(err) {
    if (err) {
      console.error('Error creating season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(201).json({ 
      id: this.lastID,
      name,
      description,
      start_date,
      end_date,
      is_active,
      is_qualification_round,
      minimum_score_percentage
    });
  });
});

// Update season
router.put('/seasons/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    start_date,
    end_date,
    is_active,
    is_qualification_round,
    minimum_score_percentage
  } = req.body;

  if (!name || !start_date || !end_date || minimum_score_percentage === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate dates
  const startDate = new Date(start_date);
  const endDate = new Date(end_date);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (endDate <= startDate) {
    return res.status(400).json({ error: 'End date must be after start date' });
  }

  // If this season is being set as active, deactivate all other seasons first
  if (is_active) {
    db.run('UPDATE seasons SET is_active = 0 WHERE id != ?', [id], (err) => {
      if (err) {
        console.error('Error deactivating other seasons:', err);
        return res.status(500).json({ error: 'Database error' });
      }
    });
  }

  const query = `
    UPDATE seasons 
    SET name = ?, 
        description = ?,
        start_date = ?,
        end_date = ?,
        is_active = ?,
        is_qualification_round = ?,
        minimum_score_percentage = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `;

  db.run(query, [
    name,
    description || null,
    start_date,
    end_date,
    is_active ? 1 : 0,
    is_qualification_round ? 1 : 0,
    minimum_score_percentage,
    id
  ], function(err) {
    if (err) {
      console.error('Error updating season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Season not found' });
    }
    res.json({ 
      id,
      name,
      description,
      start_date,
      end_date,
      is_active,
      is_qualification_round,
      minimum_score_percentage
    });
  });
});

// Delete season
router.delete('/seasons/:id', isAdmin, async (req, res) => {
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

// Get questions for a season
router.get('/seasons/:id/questions', isAdmin, async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT q.*
    FROM questions q
    JOIN season_questions sq ON q.id = sq.question_id
    WHERE sq.season_id = ?
    ORDER BY sq.created_at ASC
  `;

  db.all(query, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching season questions:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Add questions to a season
router.post('/seasons/:id/questions', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Questions array is required' });
  }

  // First verify the season exists
  db.get('SELECT id FROM seasons WHERE id = ?', [id], (err, season) => {
    if (err) {
      console.error('Error checking season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!season) {
      return res.status(404).json({ error: 'Season not found' });
    }

    // Prepare the insert query for multiple questions
    const placeholders = questions.map(() => '(?, ?, datetime(\'now\'))').join(',');
    const values = questions.reduce((acc, questionId) => {
      acc.push(id, questionId);
      return acc;
    }, []);

    const query = `
      INSERT INTO season_questions (season_id, question_id, created_at)
      VALUES ${placeholders}
    `;

    db.run(query, values, function(err) {
      if (err) {
        console.error('Error adding questions to season:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Questions added successfully' });
    });
  });
});

// Remove a question from a season
router.delete('/seasons/:seasonId/questions/:questionId', isAdmin, async (req, res) => {
  const { seasonId, questionId } = req.params;

  const query = 'DELETE FROM season_questions WHERE season_id = ? AND question_id = ?';

  db.run(query, [seasonId, questionId], function(err) {
    if (err) {
      console.error('Error removing question from season:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Question not found in season' });
    }
    res.json({ message: 'Question removed from season successfully' });
  });
});

// Get qualified users for a season
router.get('/seasons/:id/qualified-users', isAdmin, async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT 
      u.id,
      u.username,
      u.email,
      qr.score,
      ROUND(CAST(qr.score AS FLOAT) / 
        (SELECT COUNT(*) FROM season_questions WHERE season_id = ?) * 100, 2) as percentage_score,
      qr.completed_at
    FROM users u
    JOIN quiz_results qr ON u.id = qr.user_id
    WHERE qr.season_id = ? AND qr.score >= (
      SELECT minimum_score_percentage FROM seasons WHERE id = ?
    )
    ORDER BY qr.score DESC, qr.completed_at ASC
  `;

  db.all(query, [id, id, id], (err, rows) => {
    if (err) {
      console.error('Error fetching qualified users:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

export default router;
