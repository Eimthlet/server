import sqlite3 from "sqlite3";
import path from "path";

const db = new sqlite3.Database(path.join(process.cwd(), "quiz.db"));

db.serialize(() => {
  // Create seasons table
  db.run(`CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    is_qualification_round BOOLEAN DEFAULT 0,
    minimum_score_percentage INTEGER DEFAULT 50,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create season_questions table for mapping questions to seasons
  db.run(`CREATE TABLE IF NOT EXISTS season_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(season_id) REFERENCES seasons(id),
    FOREIGN KEY(question_id) REFERENCES questions(id)
  )`);

  // Create quiz_results table for storing user attempts
  db.run(`CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(season_id) REFERENCES seasons(id)
  )`);

  // Add indexes for better performance
  db.run('CREATE INDEX IF NOT EXISTS idx_season_questions_season ON season_questions(season_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_season_questions_question ON season_questions(question_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_quiz_results_season ON quiz_results(season_id)');
});

db.close();
console.log("Season tables migration complete.");
