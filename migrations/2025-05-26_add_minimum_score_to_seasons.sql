-- Add minimum_score_percentage column to seasons table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'seasons' AND column_name = 'minimum_score_percentage') THEN
    ALTER TABLE seasons ADD COLUMN minimum_score_percentage INTEGER DEFAULT 50;
  END IF;
END $$;

-- Update existing seasons to have the default minimum score
UPDATE seasons SET minimum_score_percentage = 50 WHERE minimum_score_percentage IS NULL;
