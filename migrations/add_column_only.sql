-- Add total_questions column to user_quiz_attempts table
ALTER TABLE user_quiz_attempts ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;
