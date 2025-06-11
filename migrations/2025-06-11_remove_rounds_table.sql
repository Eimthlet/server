-- Remove round_id from questions table
ALTER TABLE questions 
DROP COLUMN IF EXISTS round_id;

-- Remove round_id from user_quiz_attempts table
ALTER TABLE user_quiz_attempts 
DROP COLUMN IF EXISTS round_id;

-- Drop indexes
DROP INDEX IF EXISTS idx_questions_round_id;
DROP INDEX IF EXISTS idx_user_quiz_attempts_round_id;

-- Drop the rounds table
DROP TABLE IF EXISTS rounds;
