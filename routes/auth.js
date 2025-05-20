import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../config/database.js';
import jwt from 'jsonwebtoken';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';

const router = express.Router();

// Remove the fallback to ensure consistent secret usage
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// Function to generate refresh token
function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

// Registration endpoint
router.post(['/register', '/api/auth/register'], async (req, res) => {
  console.log('Register request received:', req.body);
  const { username, email, password, phone, amount } = req.body;

  if (!email || !password || !phone || !amount) {
    console.log('Registration failed: Missing required fields');
    return res.status(400).json({ error: 'Email, password, phone, and amount are required' });
  }

  // Check for duplicate email or username
  try {
    const userByEmail = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
    if (userByEmail) {
      return res.status(400).json({ error: 'Email already registered' });
      return;
    }
    if (username) {
      const userByUsername = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
      if (userByUsername) {
        return res.status(400).json({ error: 'Username already taken. Please choose another username.' });
      return;
      }
    }
    // Also check pending_registrations for duplicates
    const pendingByEmail = await db.oneOrNone('SELECT * FROM pending_registrations WHERE email = $1', [email]);
    if (pendingByEmail) {
      return res.status(400).json({ error: 'A registration is already pending for this email. Complete payment or wait.' });
      return;
    }
    if (username) {
      const pendingByUsername = await db.oneOrNone('SELECT * FROM pending_registrations WHERE username = $1', [username]);
      if (pendingByUsername) {
        return res.status(400).json({ error: 'A registration is already pending for this username. Complete payment or wait.' });
      return;
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Generate unique tx_ref
    const tx_ref = 'TX' + Date.now() + Math.floor(Math.random() * 1000000);
    // Store registration info in pending_registrations
    await db.none(
      'INSERT INTO pending_registrations (tx_ref, username, email, password_hash, phone, amount) VALUES ($1, $2, $3, $4, $5, $6)',
      [tx_ref, username, email, hashedPassword, phone, amount]
    );
    // Respond with tx_ref and PayChangu public key
    res.json({
      tx_ref,
      public_key: process.env.PAYCHANGU_PUBLIC_KEY,
      amount,
      email,
      phone,
      message: 'Proceed to payment with this tx_ref.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23505') {
      if (error.constraint === 'pending_registrations_tx_ref_key') {
        return res.status(400).json({ error: 'Duplicate transaction reference. Please try again.' });
      }
    }
    res.status(500).json({ error: 'Registration failed. Please try again.', details: error.message });
  }
});

// Login endpoint
router.post(['/login', '/api/auth/login'], async (req, res) => {
  console.log('Login request received:', { email: req.body.email });
  const { email, password } = req.body;

  if (!email || !password) {
    console.log('Login failed: Missing email or password');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Use oneOrNone instead of one to avoid error when user doesn't exist
    const user = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      console.log('Login failed: User not found', {
        email: email,
        attemptedAdminLogin: email.endsWith('@admin.com')
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      console.log('Login failed: Invalid password', {
        email: email,
        isAdmin: user.role === 'admin',
        adminLoginAttempt: email.endsWith('@admin.com')
      });
      return res.status(401).json({ 
        error: 'Invalid credentials', 
        details: 'The password you entered is incorrect. Please try again.'
      });
    }

    // Additional check for admin authentication
    if (email.endsWith('@admin.com') && user.role !== 'admin') {
      console.log('Login failed: Non-admin user attempting admin login', {
        email: email,
        userId: user.id
      });
      return res.status(403).json({ error: 'Unauthorized admin access' });
    }

    const refreshToken = generateRefreshToken();

    // Store refresh token in separate table
    // First delete any existing tokens for this user
    await db.none('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
    // Then insert the new token
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    await db.none('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, refreshToken, refreshExpiresAt]);

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        isAdmin: user.role === 'admin',
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // Token expires in 1 hour
      }, 
      JWT_SECRET
    );

    console.log('User logged in successfully', {
      email: email,
      userId: user.id,
      isAdmin: user.role === 'admin'
    });
    
    // Set HTTP-only cookies for both tokens
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set access token cookie
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: isProduction, // Only use secure in production (requires HTTPS)
      sameSite: isProduction ? 'none' : 'lax', // 'none' allows cross-site requests with secure, 'lax' is more restrictive but works in development
      maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
      path: '/' // Cookie accessible from all paths
    });
    
    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      path: '/'
    });
    
    // Also send tokens in the response body for clients that prefer that approach
    res.json({
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      token,
      refreshToken
    });
  } catch (error) {
    console.error('Database error during login:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required' });
  }

  try {
    // Find the refresh token in the refresh_tokens table
    const tokenRecord = await db.oneOrNone(
      'SELECT rt.*, u.* FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token = $1',
      [refreshToken]
    );
    
    if (!tokenRecord) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const user = {
      id: tokenRecord.user_id,
      email: tokenRecord.email,
      role: tokenRecord.role
    };

    const newRefreshToken = generateRefreshToken();

    // Update refresh token in the database
    await db.none('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    const refreshExpiresAt2 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
await db.none('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, newRefreshToken, refreshExpiresAt2]);

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        isAdmin: user.role === 'admin',
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // Token expires in 1 hour
      }, 
      JWT_SECRET
    );

    // Set HTTP-only cookies for both tokens, just like in the login endpoint
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set access token cookie
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/'
    });
    
    // Set refresh token cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });
    
    // Also send tokens in the response body
    res.json({
      token,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Error updating refresh token:', error);
    res.status(500).json({ error: 'Could not update refresh token', details: error.message });
  }
});

// Route to check token validity
router.get('/check-token', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      valid: true,
      user: {
        id: decoded.id,
        email: decoded.email,
        isAdmin: decoded.isAdmin
      }
    });
  } catch (err) {
    console.log('Token validation error:', {
      name: err.name,
      message: err.message
    });
    res.status(401).json({
      valid: false,
      error: 'Invalid token',
      details: err.name
    });
  }
});

export default router;
