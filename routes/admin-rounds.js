import express from 'express';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get all rounds
router.get('/', isAdmin, async (req, res) => {
  try {
    const rounds = await db.any(
      `SELECT id, name, description, is_active, 
              start_date, end_date, created_at, updated_at
       FROM rounds
       ORDER BY start_date DESC`
    );
    res.json({ rounds });
  } catch (error) {
    console.error('Error fetching rounds:', error);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});

// Create a new round
router.post('/', isAdmin, async (req, res) => {
  try {
    const { name, description, is_active, start_date, end_date } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Round name is required' });
    }

    const newRound = await db.one(
      `INSERT INTO rounds (name, description, is_active, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, is_active, start_date, end_date, created_at`,
      [name, description || null, is_active || true, start_date || null, end_date || null]
    );

    res.status(201).json({
      success: true,
      message: 'Round created successfully',
      round: newRound
    });
  } catch (error) {
    console.error('Error creating round:', error);
    res.status(500).json({ error: 'Failed to create round' });
  }
});

// Update a round
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active, start_date, end_date } = req.body;

    const updatedRound = await db.oneOrNone(
      `UPDATE rounds 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_active = COALESCE($3, is_active),
           start_date = COALESCE($4, start_date),
           end_date = COALESCE($5, end_date),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, description, is_active, start_date, end_date, updated_at`,
      [name, description, is_active, start_date, end_date, id]
    );

    if (!updatedRound) {
      return res.status(404).json({ error: 'Round not found' });
    }

    res.json({
      success: true,
      message: 'Round updated successfully',
      round: updatedRound
    });
  } catch (error) {
    console.error('Error updating round:', error);
    res.status(500).json({ error: 'Failed to update round' });
  }
});

// Get round details with question count
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const round = await db.oneOrNone(
      `SELECT r.*, 
              (SELECT COUNT(*) FROM questions WHERE round_id = r.id) as question_count
       FROM rounds r
       WHERE r.id = $1`,
      [id]
    );

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Get questions for this round
    const questions = await db.any(
      `SELECT id, question, category, difficulty, created_at
       FROM questions
       WHERE round_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      ...round,
      questions
    });
  } catch (error) {
    console.error('Error fetching round details:', error);
    res.status(500).json({ error: 'Failed to fetch round details' });
  }
});

// Assign questions to round
router.post('/:id/questions', isAdmin, async (req, res) => {
  try {
    const { id: roundId } = req.params;
    const { questionIds } = req.body;

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'Question IDs array is required' });
    }

    // Verify the round exists
    const roundExists = await db.oneOrNone('SELECT 1 FROM rounds WHERE id = $1', [roundId]);
    if (!roundExists) {
      return res.status(404).json({ error: 'Round not found' });
    }

    // Update questions to assign them to this round
    await db.none(
      `UPDATE questions 
       SET round_id = $1, updated_at = NOW()
       WHERE id = ANY($2)`,
      [roundId, questionIds]
    );

    res.json({
      success: true,
      message: `Assigned ${questionIds.length} questions to round`
    });
  } catch (error) {
    console.error('Error assigning questions to round:', error);
    res.status(500).json({ error: 'Failed to assign questions to round' });
  }
});

export default router;
