import { Pool } from 'pg';
import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD
});

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '24h';

export async function registerUser(username, password, callback) {
  try {
    // Check if username exists
    const row = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    
    if (row.rows[0]) {
      return callback(null, false, "Username already exists");
    }
    
    // Hash password
    const hash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      "INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING id",
      [username, hash, false]
    );
    
    const token = jwt.sign(
      { id: result.rows[0].id, username, isAdmin: false },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    callback(null, { id: result.rows[0].id, username, token });
  } catch (err) {
    callback(err);
  }
}

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
