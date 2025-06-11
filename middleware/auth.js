import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import cookie from 'cookie';
import bcrypt from 'bcrypt';

// Configure cookie options
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined
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
  // If authenticateUser middleware has already run and set req.user
  if (req.user) {
    if (req.user.isAdmin === true) {
      return next(); // User is authenticated and is an admin
    } else {
      return res.status(403).json({ error: 'Admin access required', details: 'User is not an administrator.' });
    }
  }

  // Fallback if req.user is not set (e.g., authenticateUser did not run or failed silently before this)
  // This part largely keeps your existing logic but is now a fallback.
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) { // Consistently use accessToken
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required', details: 'No token provided for admin check.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get the user from the database to verify admin status
    const user = await db.oneOrNone('SELECT id, email, role FROM users WHERE id = $1', [decoded.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found', details: 'The user associated with this token does not exist.' });
    }
    
    // Check if user has admin role
    if (user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required', 
        details: 'Token valid, but user does not have administrator privileges.' 
      });
    }
    
    // Set the user on the request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isAdmin: user.role === 'admin'
    };
    
    next();
  } catch (error) {
    console.error('Admin check error (fallback path):', error);
    // Distinguish between token errors and other errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Invalid or expired token for admin access.' });
    }
    return res.status(500).json({ error: 'Server error during admin check.' });
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

    // Based on the current schema, admin status is not stored in the users table.
    // Defaulting isAdmin to false and role to 'user' for tokens generated by this function.
    // Admin status should be managed via JWT claims from a trusted source or a proper roles system.
    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: false, role: 'user' },
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
