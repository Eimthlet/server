-- Create user_quiz_attempts table
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  qualifies_for_next_round BOOLEAN DEFAULT FALSE,
  percentage_score NUMERIC(5, 2) DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_id ON user_quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_completed ON user_quiz_attempts(completed);

-- Create trigger to update updated_at
CREATE TRIGGER update_user_quiz_attempts_updated_at
BEFORE UPDATE ON user_quiz_attempts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add any missing columns to existing tables if needed
DO $$
BEGIN
  -- Add missing columns to quiz_sessions if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'quiz_sessions' AND column_name = 'qualifies_for_next_round') THEN
    ALTER TABLE quiz_sessions ADD COLUMN qualifies_for_next_round BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'quiz_sessions' AND column_name = 'percentage_score') THEN
    ALTER TABLE quiz_sessions ADD COLUMN percentage_score NUMERIC(5, 2) DEFAULT 0;
  END IF;
END $$;
