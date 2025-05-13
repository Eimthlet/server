import express from 'express';
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import path from 'path';
import crypto from 'crypto';

const router = express.Router();
const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));

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
  const { username, email, password } = req.body;

  if (!email || !password) {
    console.log('Registration failed: Missing email or password');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Check if user already exists
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error('Database error during user check:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (user) {
        console.log('Registration failed: Email already exists:', email);
        return res.status(400).json({ error: 'Email already registered' });
      }

      try {
        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10);
        // Generate a default username if not provided
        const defaultUsername = email.split('@')[0];
        const finalUsername = username || defaultUsername;
        const refreshToken = generateRefreshToken();

        db.run(
          'INSERT INTO users (username, email, password, is_admin, refresh_token) VALUES (?, ?, ?, ?, ?)',
          [finalUsername, email, hashedPassword, email.endsWith('@admin.com') ? 1 : 0, refreshToken],
          function (err) {
            if (err) {
              console.error('Error creating user:', err);
              return res.status(500).json({ error: 'Could not create user' });
            }

            const token = jwt.sign(
              { 
                id: this.lastID, 
                email, 
                isAdmin: email.endsWith('@admin.com'),
                exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
              }, 
              JWT_SECRET
            );

            console.log('User registered successfully:', email);
            res.json({
              user: { id: this.lastID, username: finalUsername, email },
              token,
              refreshToken
            });
          }
        );
      } catch (hashError) {
        console.error('Error hashing password:', hashError);
        return res.status(500).json({ error: 'Error processing password' });
      }
    });
  } catch (error) {
    console.error('Server error during registration:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
router.post(['/login', '/api/auth/login'], (req, res) => {
  console.log('Login request received:', { email: req.body.email });
  const { email, password } = req.body;

  if (!email || !password) {
    console.log('Login failed: Missing email or password');
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      console.error('Database error during login:', {
        error: err,
        email: email
      });
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      console.log('Login failed: User not found', {
        email: email,
        attemptedAdminLogin: email.endsWith('@admin.com')
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        console.log('Login failed: Invalid password', {
          email: email,
          isAdmin: user.is_admin === 1,
          adminLoginAttempt: email.endsWith('@admin.com')
        });
        return res.status(401).json({ 
          error: 'Invalid credentials', 
          details: 'The password you entered is incorrect. Please try again.'
        });
      }

      // Additional check for admin authentication
      if (email.endsWith('@admin.com') && user.is_admin !== 1) {
        console.log('Login failed: Non-admin user attempting admin login', {
          email: email,
          userId: user.id
        });
        return res.status(403).json({ error: 'Unauthorized admin access' });
      }

      const refreshToken = generateRefreshToken();

      // Update user's refresh token in the database
      db.run('UPDATE users SET refresh_token = ? WHERE id = ?', [refreshToken, user.id], (updateErr) => {
        if (updateErr) {
          console.error('Error updating refresh token:', {
            error: updateErr,
            userId: user.id,
            email: email
          });
          return res.status(500).json({ error: 'Could not update refresh token' });
        }

        const token = jwt.sign(
          { 
            id: user.id, 
            email: user.email, 
            isAdmin: user.is_admin === 1,
            exp: Math.floor(Date.now() / 1000) + (60 * 60) // Token expires in 1 hour
          }, 
          JWT_SECRET
        );

        console.log('User logged in successfully', {
          email: email,
          userId: user.id,
          isAdmin: user.is_admin === 1
        });
        res.json({
          user: { id: user.id, username: user.username, email: user.email, role: user.is_admin === 1 ? 'admin' : 'user' },
          token,
          refreshToken
        });
      });
    } catch (error) {
      console.error('Server error during login:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// Refresh token endpoint
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required' });
  }

  db.get('SELECT * FROM users WHERE refresh_token = ?', [refreshToken], (err, user) => {
    if (err) {
      console.error('Database error during token refresh:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    // Generate new access token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        isAdmin: user.is_admin === 1,
        exp: Math.floor(Date.now() / 1000) + (60 * 60) // Token expires in 1 hour
      }, 
      JWT_SECRET
    );

    // Optional: Generate a new refresh token for added security
    const newRefreshToken = generateRefreshToken();

    // Update user's refresh token in the database
    db.run('UPDATE users SET refresh_token = ? WHERE id = ?', [newRefreshToken, user.id], (updateErr) => {
      if (updateErr) {
        console.error('Error updating refresh token:', updateErr);
        return res.status(500).json({ error: 'Could not update refresh token' });
      }

      res.json({
        token,
        refreshToken: newRefreshToken
      });
    });
  });
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
