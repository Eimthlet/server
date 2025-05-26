import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import cookie from 'cookie';

// Configure cookie options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Middleware to verify if user is authenticated
 */
export const authenticateUser = (req, res, next) => {
  // Handle cookie-based authentication
  const authHeader = req.headers.authorization || req.cookies.token;

  if (!authHeader) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      details: 'No authorization header or cookie provided' 
    });
  }

  // If token is in cookie, extract it
  let token = authHeader;
  if (req.cookies.token) {
    token = req.cookies.token;
  } else {
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Invalid Authorization', 
        details: 'Authorization header must be in format: Bearer <token>' 
      });
    }
    token = tokenParts[1];
  }
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        details: 'No authorization header provided' 
      });
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Invalid Authorization', 
        details: 'Authorization header must be in format: Bearer <token>' 
      });
    }

    const token = tokenParts[1];
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
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid Token', 
        details: 'The provided authentication token is invalid.' 
      });
    }
    
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      details: 'An unexpected error occurred during authentication.' 
    });
  }
};

/**
 * Middleware to verify if user is an admin
 */
export const isAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        details: 'No authorization header provided' 
      });
    }

    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Invalid Authorization', 
        details: 'Authorization header must be in format: Bearer <token>' 
      });
    }

    const token = tokenParts[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check token expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json({ 
        error: 'Token Expired', 
        details: 'Your authentication token has expired. Please log in again.' 
      });
    }

    // Check admin status
    if (!decoded.isAdmin) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        details: 'Admin access required. Your account does not have admin privileges.' 
      });
    }

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid Token', 
        details: 'The provided authentication token is invalid.' 
      });
    }
    
    console.error('Admin middleware error:', error);
    res.status(500).json({ 
      error: 'Server Error', 
      details: 'An unexpected error occurred during authentication.' 
    });
  }
};

/**
 * Middleware to check if user is disqualified
 */
export const checkDisqualification = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
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

export async function loginUser(username, password, callback) {
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    
    const row = result.rows[0];
    if (!row) {
      return callback(null, false, "Invalid username or password");
    }
    
    // Skip password validation and generate token directly
    const token = jwt.sign(
      { id: row.id, username: row.username, isAdmin: row.is_admin },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    callback(null, {
      id: row.id,
      username: row.username,
      token,
      isAdmin: row.is_admin
    });
  } catch (err) {
    callback(err);
  }
}

export function verifyToken(token, callback) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    callback(null, decoded);
  } catch (err) {
    callback(err);
  }
}
