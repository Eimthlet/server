-- Update existing questions to belong to the default season
UPDATE questions
SET season_id = (SELECT id FROM seasons ORDER BY id LIMIT 1)
WHERE season_id IS NULL;

-- Update existing quiz attempts to belong to the default season
UPDATE user_quiz_attempts
SET season_id = (SELECT id FROM seasons ORDER BY id LIMIT 1)
WHERE season_id IS NULL;
