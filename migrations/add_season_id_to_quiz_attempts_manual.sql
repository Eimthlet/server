-- Migration to add season_id to user_quiz_attempts table
-- Run this in your Render PostgreSQL database when you have access

-- Add the column
ALTER TABLE user_quiz_attempts 
ADD COLUMN season_id INTEGER 
REFERENCES seasons(id) 
ON DELETE SET NULL;

-- Update existing records to use the default season if needed
-- First, find a default season (active or first one)
WITH default_season AS (
  SELECT id FROM seasons WHERE is_active = true LIMIT 1
)
UPDATE user_quiz_attempts 
SET season_id = (SELECT id FROM default_season LIMIT 1)
WHERE season_id IS NULL
AND EXISTS (SELECT 1 FROM default_season);

-- Create an index for better query performance
CREATE INDEX idx_user_quiz_attempts_season_id 
ON user_quiz_attempts(season_id);

-- Add a comment to document the change
COMMENT ON COLUMN user_quiz_attempts.season_id IS 'References the season this quiz attempt belongs to';

-- Update the updated_at column for all modified rows
UPDATE user_quiz_attempts 
SET updated_at = CURRENT_TIMESTAMP 
WHERE season_id IS NOT NULL;
