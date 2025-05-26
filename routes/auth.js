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

    // Create JWT payload
    const payload = {
      id: user.id,
      email: user.email,
      isAdmin: user.role === 'admin'
    };

    // Generate tokens
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    // Store refresh token in database
    await db.none(
      'INSERT INTO refresh_tokens(user_id, token, expires_at) VALUES($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, refreshToken]
    );

    // Set HTTP-only cookies
    const cookieOptions = {
      httpOnly: true,
      secure: true, // Always use secure cookies
      sameSite: 'none', // Always use sameSite=none for cross-site requests
      path: '/',
      domain: process.env.COOKIE_DOMAIN || undefined
    };
    
    // Add the Partitioned attribute as a string in the header directly
    // This is because some versions of Express don't support the partitioned property
    const cookieHeader = (name, value, options) => {
      const cookieString = `${name}=${value}; Partitioned; ${Object.entries(options)
        .map(([key, value]) => {
          if (key === 'maxAge') {
            return `Max-Age=${Math.floor(value / 1000)}`;
          }
          if (key === 'httpOnly') {
            return 'HttpOnly';
          }
          if (key === 'sameSite') {
            return `SameSite=${value}`;
          }
          return `${key.charAt(0).toUpperCase() + key.slice(1)}=${value}`;
        })
        .join('; ')}`;
      return cookieString;
    };
    
    // Set cookies with Partitioned attribute using headers directly
    const accessTokenOptions = {
      ...cookieOptions,
      maxAge: 60 * 60 * 1000 // 1 hour
    };
    
    const refreshTokenOptions = {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    
    // Set cookies using headers to ensure Partitioned attribute is properly set
    res.setHeader('Set-Cookie', [
      cookieHeader('accessToken', token, accessTokenOptions),
      cookieHeader('refreshToken', refreshToken, refreshTokenOptions)
    ]);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.role === 'admin'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}));

// Refresh token endpoint
router.post(['/refresh', '/api/auth/refresh'], asyncHandler(async (req, res) => {
  // Get refresh token from cookie instead of request body
  const refreshToken = req.cookies.refreshToken;

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
    role: tokenRecord.role
  };

  const newRefreshToken = generateRefreshToken();

  // Update refresh token in the database
  await db.none('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
  await db.none('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, newRefreshToken, refreshExpiresAt]);

  const token = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      isAdmin: user.role === 'admin',
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // Token expires in 1 hour
    }, 
    JWT_SECRET
  );

  // Set HTTP-only cookies for both tokens
  const cookieOptions = {
    httpOnly: true,
    secure: true, // Always use secure cookies
    sameSite: 'none', // Always use sameSite=none for cross-site requests
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: 60 * 60 * 1000 // 1 hour in milliseconds
  };
  
  // Set access token cookie
  res.cookie('accessToken', token, cookieOptions);
  
  // Set refresh token cookie with longer expiration
  res.cookie('refreshToken', newRefreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  });
  
  // Also send tokens in the response body
  res.json({
    success: true,
    token,
    refreshToken: newRefreshToken
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
    
    res.json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        isAdmin: user.role === 'admin'
      }
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
  const cookieOptions = {
    httpOnly: true,
    secure: true, // Always use secure cookies
    sameSite: 'none', // Always use sameSite=none for cross-site requests
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined
  };
  
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  
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

export default router;
