import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';

const router = express.Router();
const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));

// Submit quiz result
router.post('/', (req, res) => {
  const { userId, seasonId, roundId, score } = req.body;

  if (!userId || !seasonId || !roundId || score === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO quiz_results (user_id, season_id, round_id, score) VALUES (?, ?, ?, ?)',
    [userId, seasonId, roundId, score],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Could not save quiz result' });
      }

      // Check if user qualifies for next round
      db.get(
        `SELECT min_score_to_qualify FROM rounds WHERE id = ?`,
        [roundId],
        (err, round) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          const qualifiesForNext = score >= round.min_score_to_qualify;
          res.json({
            id: this.lastID,
            score,
            qualifiesForNext
          });
        }
      );
    }
  );
});

// Get user's results for a season
router.get('/user/:userId/season/:seasonId', (req, res) => {
  const { userId, seasonId } = req.params;

  db.all(
    `SELECT qr.*, r.round_number, r.min_score_to_qualify
     FROM quiz_results qr
     JOIN rounds r ON r.id = qr.round_id
     WHERE qr.user_id = ? AND qr.season_id = ?
     ORDER BY r.round_number`,
    [userId, seasonId],
    (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(results);
    }
  );
});

// Get current season and round
router.get('/current', (req, res) => {
  db.get(
    `SELECT s.*, r.id as round_id, r.round_number, r.min_score_to_qualify
     FROM seasons s
     JOIN rounds r ON r.season_id = s.id
     WHERE s.is_active = 1
     ORDER BY r.round_number DESC
     LIMIT 1`,
    [],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!result) {
        return res.status(404).json({ error: 'No active season found' });
      }
      res.json(result);
    }
  );
});

export default router;
