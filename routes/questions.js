import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Explicit route handlers
router.get('/', async (req, res) => {
  console.log('Questions route accessed (GET /):', {
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
    method: req.method
  });

  try {
    console.log('Fetching questions from database');
    
    // Check if questions table exists and has data
    const questions = await db.any('SELECT * FROM questions');
    console.log(`Fetched ${questions.length} questions`, {
      questionIds: questions.map(q => q.id),
      questionDetails: questions.slice(0, 2) // Log first 2 questions for debugging
    });
    
    if (questions.length === 0) {
      console.warn('No questions found in the database. Inserting sample questions.');
      
      const sampleQuestions = [
        {
          question: 'What is the capital of France?',
          options: ['London', 'Paris', 'Madrid'],
          correctAnswer: 'Paris',
          category: 'General',
          difficulty: 'Medium'
        },
        {
          question: 'Which planet is known as the Red Planet?',
          options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
          correctAnswer: 'Mars',
          category: 'General',
          difficulty: 'Medium'
        }
      ];

      // Insert sample questions in a transaction
      await db.tx(async t => {
        for (const q of sampleQuestions) {
          await t.none(
            'INSERT INTO questions (question, options, correct_answer, category, difficulty) VALUES ($1, $2, $3, $4, $5)', 
            [q.question, JSON.stringify(q.options), q.correctAnswer, q.category, q.difficulty]
          );
        }
      });

      // Refetch questions after insertion
      const updatedQuestions = await db.any('SELECT * FROM questions');
      
      if (updatedQuestions.length === 0) {
        return res.status(500).json({ 
          error: 'Database Error', 
          message: 'Failed to insert sample questions',
          details: 'Unable to populate questions table' 
        });
      }
      
      // Use the updated questions
      questions.push(...updatedQuestions);
    }

    const formattedQuestions = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      correctAnswer: q.correct_answer, // Note: Using correct_answer instead of correctAnswer
      category: q.category,
      difficulty: q.difficulty
    }));

    console.log('Sending questions response', {
      questionCount: formattedQuestions.length,
      firstQuestionDetails: formattedQuestions[0] || 'No questions'
    });
    
    // Log the full response structure
    console.log('Full response:', JSON.stringify({
      questions: formattedQuestions
    }, null, 2));
    
    res.json({ questions: formattedQuestions });
  } catch (error) {
    console.error('Error fetching questions:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      dbPath: path.resolve('./quiz.db'),
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ 
      error: 'Failed to load questions', 
      message: error.message,
      details: 'An unexpected error occurred while fetching questions',
      dbPath: path.resolve('./quiz.db')
    });
  }
});

export default router;
