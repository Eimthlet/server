-- Create a default season for existing questions
INSERT INTO seasons (name, start_date, end_date, is_active)
VALUES ('Season 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', TRUE);
