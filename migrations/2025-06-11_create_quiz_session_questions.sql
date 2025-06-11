-- Create quiz_session_questions table to track questions for each quiz attempt
CREATE TABLE IF NOT EXISTS quiz_session_questions (
    id SERIAL PRIMARY KEY,
    quiz_session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    question_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(quiz_session_id, question_id)
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_quiz_session_questions_quiz_session_id ON quiz_session_questions(quiz_session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_session_questions_question_id ON quiz_session_questions(question_id);
