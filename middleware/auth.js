import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import cookie from 'cookie';

// Configure cookie options
const cookieOptions = {
  httpOnly: true,
  secure: true, // Always use secure cookies
  // No SameSite attribute - let the browser use the default
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
export const isAdmin = (req, res, next) => {
  try {
    // First check for the accessToken cookie, then fall back to Authorization header
    let token = req.cookies.accessToken;
    
    // If no cookie, try the Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          details: 'No authentication token provided' 
        });
      }
      
      const tokenParts = authHeader.split(' ');
      if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
        return res.status(401).json({ 
          error: 'Invalid Authorization', 
          details: 'Authorization header must be in format: Bearer <token>' 
        });
      }
      token = tokenParts[1];
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check token expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json({ 
        error: 'Your session has expired', 
        details: 'Please log in again to continue.',
        code: 'TOKEN_EXPIRED'
      });
    }

    // Check admin status - check both isAdmin and role for backward compatibility
    const isAdminUser = decoded.isAdmin || (decoded.role && decoded.role.toLowerCase() === 'admin');
    if (!isAdminUser) {
      console.log('Access denied - User is not an admin. User role:', decoded.role);
      return res.status(403).json({ 
        error: 'Access restricted', 
        details: 'This area is only accessible to administrators.',
        code: 'ADMIN_REQUIRED',
        userRole: decoded.role || 'not set'
      });
    }
    
    console.log('Admin access granted for user:', decoded.email, 'Role:', decoded.role);

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
