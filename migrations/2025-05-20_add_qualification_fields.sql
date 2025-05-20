-- Migration: Add qualification fields to user_quiz_attempts table
ALTER TABLE user_quiz_attempts 
ADD COLUMN IF NOT EXISTS qualifies_for_next_round BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS percentage_score INTEGER DEFAULT 0;

-- Update existing attempts to calculate qualification status (50% minimum)
UPDATE user_quiz_attempts
SET 
  qualifies_for_next_round = (score >= (SELECT COUNT(*) / 2 FROM questions)),
  percentage_score = CASE 
    WHEN (SELECT COUNT(*) FROM questions) > 0 
    THEN ROUND((score::float / (SELECT COUNT(*) FROM questions)) * 100) 
    ELSE 0 
  END
WHERE completed = true;
