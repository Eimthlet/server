import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

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
    console.log('Attempting to open database', {
      dbPath: path.resolve('./quiz.db')
    });
    const db = await open({
      filename: './quiz.db',
      driver: sqlite3.Database
    });
    console.log('Database opened successfully');

    console.log('Checking database schema');
    const tableInfo = await db.all(`PRAGMA table_info(questions)`);
    console.log('Questions table schema:', tableInfo);

    console.log('Fetching questions from database');
    const questions = await db.all('SELECT * FROM questions');
    console.log(`Fetched ${questions.length} questions`, {
      questionIds: questions.map(q => q.id),
      questionDetails: questions.slice(0, 2) // Log first 2 questions for debugging
    });
    
    if (questions.length === 0) {
      console.warn('No questions found in the database. Inserting sample questions.');
      
      const sampleQuestions = [
        {
          question: 'What is the capital of France?',
          options: JSON.stringify(['London', 'Paris', 'Madrid']),
          correctAnswer: 'Paris',
          category: 'General',
          difficulty: 'Medium'
        },
        {
          question: 'Which planet is known as the Red Planet?',
          options: JSON.stringify(['Venus', 'Mars', 'Jupiter', 'Saturn']),
          correctAnswer: 'Mars',
          category: 'General',
          difficulty: 'Medium'
        }
      ];

      for (const q of sampleQuestions) {
        await db.run(
          'INSERT INTO questions (question, options, correctAnswer, category, difficulty) VALUES (?, ?, ?, ?, ?)', 
          [q.question, q.options, q.correctAnswer, q.category, q.difficulty]
        );
      }

      // Refetch questions after insertion
      const updatedQuestions = await db.all('SELECT * FROM questions');
      
      if (updatedQuestions.length === 0) {
        return res.status(500).json({ 
          error: 'Database Error', 
          message: 'Failed to insert sample questions',
          details: 'Unable to populate questions table' 
        });
      }
    }

    const formattedQuestions = questions.map(q => ({
      id: q.id,
      question: q.question,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
      correctAnswer: q.correctAnswer,
      category: q.category,
      difficulty: q.difficulty
    }));

    console.log('Closing database connection');
    await db.close();

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
