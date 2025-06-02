-- Add season_id to questions table
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS season_id INTEGER;

-- Add foreign key constraint
ALTER TABLE questions
ADD CONSTRAINT fk_questions_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;

-- Add season_id to user_quiz_attempts table
ALTER TABLE user_quiz_attempts
ADD COLUMN IF NOT EXISTS season_id INTEGER;

-- Add foreign key constraint
ALTER TABLE user_quiz_attempts
ADD CONSTRAINT fk_attempts_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
