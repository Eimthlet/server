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
    // Use the correct API endpoint from PayChangu documentation
    const verifyUrl = `https://api.paychangu.com/verify-payment/${tx_ref}`;
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
      console.log('Payment status check:', {
        responseOk: verifyResponse.ok,
        hasData: !!verifyResult.data,
        status: verifyResult.data?.status,
        expectedStatus: 'success or successful',
        statusMatch: verifyResult.data?.status === 'success' || verifyResult.data?.status === 'successful'
      });
      // Check the correct field for payment success - accept both 'success' and 'successful'
      if (!verifyResponse.ok || !verifyResult.data || (verifyResult.data.status !== 'success' && verifyResult.data.status !== 'successful')) {
        return res.status(402).json({ error: 'Payment not verified', details: verifyResult });
      }
    } catch (verifyError) {
      console.error('Error verifying payment with PayChangu:', verifyError);
      return res.status(500).json({ error: 'Failed to verify payment with PayChangu', details: verifyError.message });
    }

    // 2. Find the pending registration
    console.log('Looking for pending registration with tx_ref:', tx_ref);
    const pending = await db.oneOrNone('SELECT * FROM pending_registrations WHERE tx_ref = $1', [tx_ref]);
    if (!pending) {
      console.error('No pending registration found for tx_ref:', tx_ref);
      return res.status(404).json({ error: 'No pending registration found for this tx_ref' });
    }
    console.log('Found pending registration:', pending.username, pending.email);

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
    console.log('Creating user:', pending.username, pending.email);
    try {
      console.log('User creation data:', {
        username: pending.username,
        email: pending.email,
        passwordHashLength: pending.password_hash?.length || 0,
        role: 'user'
      });
      
      try {
        const result = await db.one(
          'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
          [pending.username, pending.email, pending.password_hash, 'user']
        );
        console.log('User created successfully with ID:', result.id);
      } catch (dbError) {
        console.error('Database error during user creation:', dbError);
        console.error('SQL error details:', dbError.message, dbError.code, dbError.constraint);
        throw dbError; // Re-throw to be caught by the outer try-catch
      }

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

      // Use HTML redirect instead of HTTP redirect for cross-domain scenarios
      const frontendUrl = process.env.FRONTEND_URL || 'https://car-quizz-git-main-jonathans-projects-8c96c19b.vercel.app';
      const redirectUrl = `${frontendUrl}/login?payment=success&email=${encodeURIComponent(pending.email)}`;
      console.log('Redirecting to:', redirectUrl);
      
      // Send HTML with immediate redirect script
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Registration Successful</title>
            <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
            <script type="text/javascript">
              // Immediate redirect
              window.location.replace("${redirectUrl}");
            </script>
          </head>
          <body onload="window.location.href='${redirectUrl}'">
            <h1>Registration Successful!</h1>
            <p>You are being redirected to the login page...</p>
            <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
          </body>
        </html>
      `);
    } catch (dbError) {
      console.error('Database error creating user:', dbError);
      return res.status(500).json({ error: 'Failed to create user', details: dbError.message });
    }
  } catch (error) {
    console.error('PayChangu callback error:', error);
    res.status(500).json({ error: 'Could not complete registration', details: error.message });
  }
});

export default router;