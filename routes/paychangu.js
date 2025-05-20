import express from 'express';
import db from '../config/database.js';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const router = express.Router();

// Accept both GET and POST for PayChangu callback
router.all('/paychangu-callback', async (req, res) => {
  const tx_ref = req.body.tx_ref || req.query.tx_ref;
  if (!tx_ref) {
    return res.status(400).json({ error: 'Missing tx_ref' });
  }

  try {
    // 1. Verify payment with PayChangu
    // Use the correct test API endpoint
    const verifyUrl = `https://api.paychangu.com/v1/transactions/verify/${tx_ref}`;
    console.log('Verifying payment at URL:', verifyUrl);
    
    try {
      const verifyResponse = await fetch(verifyUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      const verifyResult = await verifyResponse.json();
      console.log('PayChangu verifyResult:', verifyResult);
      // Check the correct field for payment success
      if (!verifyResponse.ok || !verifyResult.data || verifyResult.data.status !== 'successful') {
        return res.status(402).json({ error: 'Payment not verified', details: verifyResult });
      }
    } catch (verifyError) {
      console.error('Error verifying payment with PayChangu:', verifyError);
      return res.status(500).json({ error: 'Failed to verify payment with PayChangu', details: verifyError.message });
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
