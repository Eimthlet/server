-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_user_quiz_attempts_updated_at ON user_quiz_attempts;

-- Create or replace the update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_user_quiz_attempts_updated_at
BEFORE UPDATE ON user_quiz_attempts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add minimum_score_percentage column to questions table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'questions' AND column_name = 'minimum_score_percentage') THEN
    ALTER TABLE questions ADD COLUMN minimum_score_percentage INTEGER DEFAULT 50;
  END IF;
END $$;
