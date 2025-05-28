-- Add total_questions column to user_quiz_attempts table
ALTER TABLE user_quiz_attempts ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;

-- Update existing records to have the correct total_questions count
-- This will set total_questions based on the active season's questions count
UPDATE user_quiz_attempts 
SET total_questions = (
  SELECT COUNT(*) 
  FROM questions 
  WHERE season_id = (
    SELECT id 
    FROM seasons 
    WHERE is_active = true 
    LIMIT 1
  )
)
WHERE total_questions IS NULL OR total_questions = 0;
