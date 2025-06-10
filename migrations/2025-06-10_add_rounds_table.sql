-- Create rounds table to track different qualification rounds
CREATE TABLE IF NOT EXISTS rounds (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add round_id to questions table
ALTER TABLE questions 
ADD COLUMN round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL;

-- Add round_id to user_quiz_attempts table to track which round an attempt belongs to
ALTER TABLE user_quiz_attempts 
ADD COLUMN round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL;

-- Create an index on round_id for better performance
CREATE INDEX IF NOT EXISTS idx_questions_round_id ON questions(round_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_round_id ON user_quiz_attempts(round_id);

-- Insert a default qualification round if none exists
INSERT INTO rounds (name, description, is_active) 
SELECT 'Qualification Round 1', 'First qualification round', TRUE
WHERE NOT EXISTS (SELECT 1 FROM rounds LIMIT 1);
