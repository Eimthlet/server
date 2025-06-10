-- Add season_id column to user_quiz_attempts table
ALTER TABLE user_quiz_attempts 
ADD COLUMN IF NOT EXISTS season_id INTEGER 
REFERENCES seasons(id) 
ON DELETE SET NULL;

-- Update existing records to use the default season if needed
-- First, check if there's a default season
DO $$
DECLARE
  default_season_id INTEGER;
BEGIN
  -- Try to find a default season (is_active = true or the first one)
  SELECT id INTO default_season_id 
  FROM seasons 
  WHERE is_active = true 
  LIMIT 1;
  
  -- If no active season, just get the first one
  IF default_season_id IS NULL THEN
    SELECT id INTO default_season_id FROM seasons ORDER BY id LIMIT 1;
  END IF;
  
  -- If we found a season, update existing records
  IF default_season_id IS NOT NULL THEN
    UPDATE user_quiz_attempts 
    SET season_id = default_season_id 
    WHERE season_id IS NULL;
  END IF;
END $$;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_season_id 
ON user_quiz_attempts(season_id);

-- Add a comment to document the change
COMMENT ON COLUMN user_quiz_attempts.season_id IS 'References the season this quiz attempt belongs to';

-- Update the updated_at column for all modified rows
UPDATE user_quiz_attempts 
SET updated_at = CURRENT_TIMESTAMP 
WHERE season_id IS NOT NULL;
