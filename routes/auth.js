import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../config/database.js';
import jwt from 'jsonwebtoken';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { asyncHandler, formatErrorResponse } from '../middleware/errorHandler.js';

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
router.post(['/register', '/api/auth/register'], asyncHandler(async (req, res) => {
  console.log('Register request received:', req.body);
  const { username, email, password, phone, amount } = req.body;

  // Validate required fields
  if (!email || !password || !phone || !amount) {
    console.log('Registration failed: Missing required fields');
    return res.status(400).json({ 
      success: false,
      error: 'Email, password, phone, and amount are required' 
    });
  }

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false,
      error: 'Please provide a valid email address' 
    });
  }

  // Validate password strength
  if (password.length < 8) {
    return res.status(400).json({ 
      success: false,
      error: 'Password must be at least 8 characters long' 
    });
  }

  // Validate username if provided
  if (username) {
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        success: false,
        error: 'Username must be between 3 and 20 characters' 
      });
    }
    
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ 
        success: false,
        error: 'Username can only contain letters, numbers, underscores and hyphens' 
      });
    }
  }

  // Validate phone number
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    return res.status(400).json({ 
      success: false,
      error: 'Please provide a valid phone number (10-15 digits)' 
    });
  }

  // Validate amount
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Amount must be a positive number' 
    });
  }

  // Check for duplicate email or username
  const userByEmail = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
  if (userByEmail) {
    return res.status(400).json({ 
      success: false,
      error: 'Email already registered' 
    });
  }
  
  if (username) {
    const userByUsername = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
    if (userByUsername) {
      return res.status(400).json({ 
        success: false,
        error: 'Username already taken. Please choose another username.' 
      });
    }
  }
  
  // Also check pending_registrations for duplicates
  const pendingByEmail = await db.oneOrNone('SELECT * FROM pending_registrations WHERE email = $1', [email]);
  if (pendingByEmail) {
    return res.status(400).json({ 
      success: false,
      error: 'A registration is already pending for this email. Complete payment or wait.' 
    });
  }
  
  if (username) {
    const pendingByUsername = await db.oneOrNone('SELECT * FROM pending_registrations WHERE username = $1', [username]);
    if (pendingByUsername) {
      return res.status(400).json({ 
        success: false,
        error: 'A registration is already pending for this username. Complete payment or wait.' 
      });
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
    success: true,
    tx_ref,
    public_key: process.env.PAYCHANGU_PUBLIC_KEY,
    amount,
    email,
    phone,
    message: 'Proceed to payment with this tx_ref.'
  });
}));

// Login endpoint
router.post(['/login', '/api/auth/login'], asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Validate required fields
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Please enter both your email and password',
      code: 'MISSING_CREDENTIALS'
    });
  }

  try {
    // Find user by email
    const user = await db.oneOrNone('SELECT * FROM users WHERE email = $1', [email]);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'The email or password you entered is incorrect',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user is disqualified
    if (user.is_disqualified) {
      return res.status(403).json({
        success: false,
        error: 'Your account has been temporarily suspended',
        details: 'Please contact support for assistance',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'The email or password you entered is incorrect',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Create JWT payload with both isAdmin and role for backward compatibility
    const payload = {
      id: user.id,
      email: user.email,
      isAdmin: user.role === 'admin',
      role: user.role || 'user' // Include the role field
    };
    
    console.log('JWT payload created:', payload);

    // Generate tokens
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    // Store refresh token in database
    await db.none(
      'INSERT INTO refresh_tokens(user_id, token, expires_at) VALUES($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, refreshToken]
    );

    // Set HTTP-only cookies
    // Set cookies directly using headers to avoid browser SameSite warnings
    const cookieHeader = (name, value, maxAge) => {
      return `${name}=${value}; HttpOnly; Secure; Path=/; Max-Age=${Math.floor(maxAge / 1000)}; SameSite=None; Partitioned`;
    };
    
    // Set cookies using headers with simplified approach
    const accessTokenMaxAge = 60 * 60 * 1000; // 1 hour
    const refreshTokenMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    res.setHeader('Set-Cookie', [
      cookieHeader('accessToken', token, accessTokenMaxAge),
      cookieHeader('refreshToken', refreshToken, refreshTokenMaxAge)
    ]);

    // Also include tokens in the response body for the frontend to use
    const userResponse = {
      id: user.id,
      email: user.email,
      isAdmin: user.role === 'admin',
      role: user.role || 'user'
    };
    
    console.log('Login successful, responding with user:', userResponse);
    
    res.json({
      data: {
        success: true,
        token: token,
        refreshToken: refreshToken,
        user: userResponse
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}));

// Refresh token endpoint
router.post(['/refresh', '/api/auth/refresh'], asyncHandler(async (req, res) => {
  // Get refresh token from cookie or request body
  let refreshToken = req.cookies.refreshToken;
  
  // If not in cookies, check request body
  if (!refreshToken && req.body.refreshToken) {
    refreshToken = req.body.refreshToken;
  }

  if (!refreshToken) {
    return res.status(401).json({ 
      success: false,
      error: 'Refresh token is required' 
    });
  }

  // Find the refresh token in the refresh_tokens table
  const tokenRecord = await db.oneOrNone(
    'SELECT rt.*, u.* FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token = $1',
    [refreshToken]
  );
  
  if (!tokenRecord) {
    return res.status(403).json({ 
      success: false,
      error: 'Invalid refresh token' 
    });
  }

  const user = {
    id: tokenRecord.user_id,
    email: tokenRecord.email,
    role: tokenRecord.role || 'user'
  };
  
  console.log('Refreshing token for user:', { ...user, isAdmin: tokenRecord.admin });

  const newRefreshToken = generateRefreshToken();

  // Update refresh token in the database
  await db.none('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  await db.none('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', 
    [user.id, newRefreshToken, refreshExpiresAt]
  );

  // Create JWT payload with both isAdmin and role for backward compatibility
  const payload = {
    id: user.id,
    email: user.email,
    isAdmin: tokenRecord.admin,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + (60 * 60) // Token expires in 1 hour
  };
  
  console.log('New JWT payload:', payload);
  const token = jwt.sign(payload, JWT_SECRET);

  // Set HTTP-only cookies for both tokens
  // Simplified cookie header function that works better with cross-origin requests
  const cookieHeader = (name, value, maxAge) => {
    return `${name}=${value}; HttpOnly; Secure; Path=/; Max-Age=${Math.floor(maxAge / 1000)}; SameSite=None; Partitioned`;
  };
  
  // Set cookies using headers with simplified approach
  const accessTokenMaxAge = 60 * 60 * 1000; // 1 hour
  const refreshTokenMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  res.setHeader('Set-Cookie', [
    cookieHeader('accessToken', token, accessTokenMaxAge),
    cookieHeader('refreshToken', newRefreshToken, refreshTokenMaxAge)
  ]);
  
  // Prepare user response with role information
  const userResponse = {
    id: user.id,
    email: user.email,
    isAdmin: user.role === 'admin',
    role: user.role
  };
  
  console.log('Token refresh successful, responding with user:', userResponse);
  
  // Also send tokens in the response body along with user info
  res.json({
    success: true,
    token,
    refreshToken: newRefreshToken,
    user: userResponse
  });
}));

// Route to check token validity
router.get(['/check-token', '/api/auth/check-token'], asyncHandler(async (req, res) => {
  // Get token from cookie instead of authorization header
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({ 
      success: false,
      valid: false, 
      error: 'No token provided' 
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user details from database to ensure the user still exists
    const user = await db.oneOrNone('SELECT id, email, role FROM users WHERE id = $1', [decoded.id]);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'User no longer exists'
      });
    }
    
    const userResponse = {
      id: user.id,
      email: user.email,
      isAdmin: user.role === 'admin', // Corrected: Derive isAdmin from role
      role: user.role || 'user'
    };
    
    console.log('Token check successful, responding with user:', userResponse);
    
    res.json({
      success: true,
      valid: true,
      user: userResponse
    });
  } catch (err) {
    console.log('Token validation error:', {
      name: err.name,
      message: err.message
    });
    res.status(401).json({
      success: false,
      valid: false,
      error: 'Invalid token',
      details: err.name
    });
  }
}));

// Logout endpoint to clear cookies
router.post(['/logout', '/api/auth/logout'], asyncHandler(async (req, res) => {
  // Clear all auth cookies
  // For clearing cookies, we need to set an expired date and use the same SameSite=None attribute
  res.setHeader('Set-Cookie', [
    'accessToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=None',
    'refreshToken=; HttpOnly; Secure; Path=/; Max-Age=0; SameSite=None'
  ]);
  
  // Also clear any refresh tokens from the database if the user is authenticated
  try {
    const token = req.cookies.accessToken;
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded && decoded.id) {
        await db.none('DELETE FROM refresh_tokens WHERE user_id = $1', [decoded.id]);
      }
    }
  } catch (error) {
    // If token verification fails, we still want to clear cookies
    console.log('Error during logout token verification:', error);
  }
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

// Endpoint to check for pending registrations
router.post(['/check-pending-registration', '/api/auth/check-pending-registration'], asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ 
      success: false,
      error: 'Email is required' 
    });
  }
  
  try {
    // Check if there's a pending registration for this email
    const pending = await db.oneOrNone('SELECT * FROM pending_registrations WHERE email = $1', [email]);
    
    if (pending) {
      return res.json({
        success: true,
        pending: true,
        tx_ref: pending.tx_ref,
        email: pending.email
      });
    } else {
      return res.json({
        success: true,
        pending: false
      });
    }
  } catch (error) {
    console.error('Error checking pending registration:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check pending registration', 
      details: error.message 
    });
  }
}));

// Endpoint to resume payment for pending registration
router.post(['/resume-payment', '/api/auth/resume-payment'], asyncHandler(async (req, res) => {
  const { tx_ref, original_tx_ref, email } = req.body;
  
  if (!tx_ref || !original_tx_ref || !email) {
    return res.status(400).json({ 
      success: false,
      error: 'New transaction reference, original transaction reference, and email are required' 
    });
  }
  
  try {
    // Check if the pending registration exists using the original tx_ref
    const pending = await db.oneOrNone(
      'SELECT * FROM pending_registrations WHERE tx_ref = $1 AND email = $2', 
      [original_tx_ref, email]
    );
    
    if (!pending) {
      return res.status(404).json({ 
        success: false, 
        error: 'No pending registration found' 
      });
    }
    
    // Update the pending registration with the new tx_ref
    await db.none(
      'UPDATE pending_registrations SET tx_ref = $1 WHERE tx_ref = $2 AND email = $3',
      [tx_ref, original_tx_ref, email]
    );
    
    // Return the payment information with the new tx_ref
    res.json({
      success: true,
      tx_ref: tx_ref, // Use the new tx_ref
      public_key: process.env.PAYCHANGU_PUBLIC_KEY,
      amount: pending.amount,
      email: pending.email,
      phone: pending.phone,
      message: 'Resume payment with the new transaction reference.'
    });
  } catch (error) {
    console.error('Resume payment error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resume payment', 
      details: error.message 
    });
  }
}));

export default router;
