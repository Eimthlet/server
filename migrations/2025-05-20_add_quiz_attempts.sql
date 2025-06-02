-- Migration: Add user_quiz_attempts table to track quiz attempts
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id) -- Ensures each user can only have one attempt
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_id ON user_quiz_attempts(user_id);

-- Create progress table to track individual question answers
CREATE TABLE IF NOT EXISTS quiz_progress (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES user_quiz_attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    user_answer TEXT,
    is_correct BOOLEAN,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(attempt_id, question_id) -- Each question can only be answered once per attempt
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quiz_progress_attempt_id ON quiz_progress(attempt_id);
