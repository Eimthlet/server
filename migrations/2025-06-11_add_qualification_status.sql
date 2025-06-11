-- Add column to track if user has passed qualification
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_passed_qualification BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_qualification_attempt TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_qualification_status ON users(has_passed_qualification);

-- Update user_quiz_attempts to track qualification attempts
ALTER TABLE user_quiz_attempts
ADD COLUMN IF NOT EXISTS is_qualification_attempt BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS qualifies_for_next_round BOOLEAN DEFAULT FALSE;
