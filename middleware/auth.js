import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import cookie from 'cookie';
import bcrypt from 'bcrypt';

// Configure cookie options
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  partitioned: true,
  path: '/',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Middleware to verify if user is authenticated
 */
export const authenticateUser = (req, res, next) => {
  // First check for Authorization header, then fall back to cookie
  let token;
  
  // Try the Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]; // Bearer TOKEN format
  } else {
    // Fall back to cookie
    token = req.cookies.accessToken;
  }
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      details: 'No authentication token provided' 
    });
  }
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check token expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json({ 
        error: 'Token Expired', 
        details: 'Your authentication token has expired. Please log in again.' 
      });
    }

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // Provide user-friendly error messages
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Your session is invalid or has expired', 
        details: 'Please log in again to continue.',
        code: 'INVALID_TOKEN'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Your session has expired', 
        details: 'Please log in again to continue.',
        code: 'TOKEN_EXPIRED'
      });
    } else {
      res.status(500).json({ 
        error: 'We encountered a problem with your session', 
        details: 'Please try logging in again.',
        code: 'AUTH_ERROR'
      });
    }
  }
};

/**
 * Middleware to verify if user is an admin
 */
export const isAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is admin
    const user = await db.oneOrNone('SELECT id FROM users WHERE id = $1 AND admin = true', [decoded.id]);
    if (!user) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Middleware to check if user is disqualified
 */
export const checkDisqualification = async (req, res, next) => {
  try {
    // First check for the accessToken cookie, then fall back to Authorization header
    let token = req.cookies.accessToken;
    
    // If no cookie, try the Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No authentication token provided' });
      }
      
      const tokenParts = authHeader.split(' ');
      if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Invalid authorization format' });
      }
      token = tokenParts[1];
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is disqualified in the database
    const user = await db.oneOrNone(
      'SELECT is_disqualified FROM users WHERE id = $1',
      [decoded.id]
    );

    if (user && user.is_disqualified) {
      return res.status(403).json({ 
        error: 'Account Disqualified', 
        details: 'Your account has been disqualified from admin access.' 
      });
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Disqualification check error:', error);
    res.status(500).json({ error: 'Server error during disqualification check' });
  }
};

// Login function
export async function loginUser(email, password, callback) {
  try {
    const user = await db.oneOrNone(
      'SELECT id, email, password FROM users WHERE email = $1', 
      [email]
    );

    if (!user) {
      return callback(new Error('User not found'), null);
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return callback(new Error('Invalid password'), null);
    }

    // Check admin status
    const isAdmin = await db.oneOrNone(
      'SELECT id FROM users WHERE id = $1 AND admin = true',
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: !!isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    callback(null, token);
  } catch (error) {
    callback(error, null);
  }
}

export function verifyToken(token, callback) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    callback(null, decoded);
  } catch (err) {
    callback(err);
  }
}
