-- Step 1: Create seasons table
CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  is_qualification_round BOOLEAN DEFAULT FALSE,
  minimum_score_percentage INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Add season_id to questions table
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS season_id INTEGER;

-- Step 3: Add foreign key constraint
ALTER TABLE questions
ADD CONSTRAINT fk_questions_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;

-- Step 4: Add season_id to user_quiz_attempts table
ALTER TABLE user_quiz_attempts
ADD COLUMN IF NOT EXISTS season_id INTEGER;

-- Step 5: Add foreign key constraint
ALTER TABLE user_quiz_attempts
ADD CONSTRAINT fk_attempts_season
FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;

-- Step 6: Create a default season for existing questions
INSERT INTO seasons (name, description, start_date, end_date, is_active, is_qualification_round)
VALUES ('Season 1', 'Initial qualification round', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', TRUE, TRUE);

-- Step 7: Update existing questions to belong to the default season
UPDATE questions
SET season_id = (SELECT id FROM seasons ORDER BY id LIMIT 1)
WHERE season_id IS NULL;

-- Step 8: Update existing quiz attempts to belong to the default season
UPDATE user_quiz_attempts
SET season_id = (SELECT id FROM seasons ORDER BY id LIMIT 1)
WHERE season_id IS NULL;
