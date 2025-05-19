import express from 'express';
import db from '../config/database.js';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const router = express.Router();

// POST /api/auth/paychangu-callback
router.post('/paychangu-callback', async (req, res) => {
  const { tx_ref } = req.body;
  if (!tx_ref) {
    return res.status(400).json({ error: 'Missing tx_ref' });
  }

  try {
    // 1. Verify payment with PayChangu
    const verifyUrl = `https://api.paychangu.com/v1/transaction/verify/${tx_ref}`;
    const verifyResponse = await fetch(verifyUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.PAYCHANGU_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    const verifyResult = await verifyResponse.json();
    if (!verifyResponse.ok || !verifyResult.status || verifyResult.status !== 'success') {
      return res.status(402).json({ error: 'Payment not verified', details: verifyResult });
    }

    // 2. Find the pending registration
    const pending = await db.oneOrNone('SELECT * FROM pending_registrations WHERE tx_ref = $1', [tx_ref]);
    if (!pending) {
      return res.status(404).json({ error: 'No pending registration found for this tx_ref' });
    }

    // 3. Double-check for duplicates before creating user
    const userByEmail = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [pending.email]);
    if (userByEmail) {
      await db.none('DELETE FROM pending_registrations WHERE tx_ref = $1', [tx_ref]);
      return res.status(400).json({ error: 'Email already registered' });
    }
    const userByUsername = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [pending.username]);
    if (userByUsername) {
      await db.none('DELETE FROM pending_registrations WHERE tx_ref = $1', [tx_ref]);
      return res.status(400).json({ error: 'Username already taken' });
    }

    // 4. Create the user
    const result = await db.one(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [pending.username, pending.email, pending.password_hash, 'user']
    );

    // 5. Clean up pending registration
    await db.none('DELETE FROM pending_registrations WHERE tx_ref = $1', [tx_ref]);

    // 6. Generate JWT token
    const token = jwt.sign(
      {
        id: result.id,
        email: pending.email,
        isAdmin: false,
        exp: Math.floor(Date.now() / 1000) + (60 * 60)
      },
      process.env.JWT_SECRET
    );

    res.json({
      user: { id: result.id, username: pending.username, email: pending.email, role: 'user' },
      token,
      message: 'Registration complete and payment verified.'
    });
  } catch (error) {
    console.error('PayChangu callback error:', error);
    res.status(500).json({ error: 'Could not complete registration', details: error.message });
  }
});

export default router;
