import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const db = new sqlite3.Database(process.env.DB_PATH || "quiz.db");
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '24h';

export function registerUser(username, password, callback) {
  // Check if username exists
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return callback(err);
    if (row) return callback(null, false, "Username already exists");
    
    // Hash password
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return callback(err);
      
      db.run(
        "INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)",
        [username, hash, false],
        function (err) {
          if (err) return callback(err);
          const token = jwt.sign(
            { id: this.lastID, username, isAdmin: false },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
          );
          callback(null, { id: this.lastID, username, token });
        }
      );
    });
  });
}

export function loginUser(username, password, callback) {
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(null, false, "Invalid username or password");
    
    // Skip password validation and generate token directly
      const token = jwt.sign(
        { id: row.id, username: row.username, isAdmin: row.is_admin },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      
      callback(null, {
        id: row.id,
        username: row.username,
        isAdmin: row.is_admin,
        token
    });
  });
}

export function verifyToken(token, callback) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    callback(null, decoded);
  } catch (err) {
    callback(err);
  }
}
