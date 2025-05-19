import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Submit quiz result
router.post('/', async (req, res) => {
  const { userId, seasonId, roundId, score } = req.body;

  if (!userId || !seasonId || !roundId || score === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Start a transaction
    await db.tx(async t => {
      // Insert quiz result
      const result = await t.one(
        `INSERT INTO quiz_results (user_id, season_id, round_id, score)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userId, seasonId, roundId, score]
      );

      // Check if user qualifies for next round
      const round = await t.oneOrNone(
        `SELECT min_score_to_qualify FROM rounds WHERE id = $1`,
        [roundId]
      );

      if (!round) {
        throw new Error('Round not found');
      }

      const qualifiesForNext = score >= round.min_score_to_qualify;
      
      res.json({
        id: result.id,
        score,
        qualifiesForNext
      });
    });
  } catch (error) {
    console.error('Error submitting quiz result:', error);
    res.status(500).json({ error: 'Could not save quiz result' });
  }
});

// Get user's results for a season
router.get('/user/:userId/season/:seasonId', async (req, res) => {
  const { userId, seasonId } = req.params;

  try {
    const results = await db.any(
      `SELECT qr.*, r.round_number, r.min_score_to_qualify
       FROM quiz_results qr
       JOIN rounds r ON r.id = qr.round_id
       WHERE qr.user_id = $1 AND qr.season_id = $2
       ORDER BY r.round_number`,
      [userId, seasonId]
    );
    res.json(results);
  } catch (error) {
    console.error('Error fetching user results:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get current season and round
router.get('/current', async (req, res) => {
  try {
    const result = await db.oneOrNone(
      `SELECT s.*, r.id as round_id, r.round_number, r.min_score_to_qualify
       FROM seasons s
       JOIN rounds r ON r.season_id = s.id
       WHERE s.is_active = true
       ORDER BY r.round_number DESC
       LIMIT 1`
    );

    if (!result) {
      return res.status(404).json({ error: 'No active season found' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching current season:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
