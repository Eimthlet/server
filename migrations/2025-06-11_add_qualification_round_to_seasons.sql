-- Add is_qualification_round column to seasons table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'seasons' AND column_name = 'is_qualification_round') THEN
    ALTER TABLE seasons ADD COLUMN is_qualification_round BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Set default value for existing seasons
UPDATE seasons SET is_qualification_round = FALSE WHERE is_qualification_round IS NULL;
