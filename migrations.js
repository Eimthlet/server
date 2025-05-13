import sqlite3 from "sqlite3";

const db = new sqlite3.Database("quiz.db");

db.serialize(() => {
  // Drop existing tables to recreate with correct schema
  db.run(`DROP TABLE IF EXISTS quiz_results`);
  db.run(`DROP TABLE IF EXISTS rounds`);
  db.run(`DROP TABLE IF EXISTS seasons`);

  // Create tables with updated schema
  db.run(`CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    season_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    is_active INTEGER DEFAULT 0,
    min_score_to_qualify INTEGER DEFAULT 70,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(season_id) REFERENCES seasons(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL,
    round_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(season_id) REFERENCES seasons(id),
    FOREIGN KEY(round_id) REFERENCES rounds(id)
  )`);

  // Keep existing tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    refresh_token TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correctAnswer TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add index for seasons dates
  db.run(`CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date)`);

  // Add unique constraint for active seasons
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_active ON seasons(name) WHERE end_date > datetime('now')`);

  // Add column for tracking quiz attempts
  db.run(`
    ALTER TABLE progress ADD COLUMN IF NOT EXISTS attempt_date TEXT DEFAULT (datetime('now'))
  `);
});

db.close();
console.log("Database migrations complete.");
