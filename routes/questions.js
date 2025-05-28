import express from 'express';
import db from '../config/database.js';
import path from 'path';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Explicit route handlers
// Add a fallback questions array for when no questions are available from the database
const fallbackQuestions = [
  {
    id: 1,
    question: 'What car manufacturer makes the Mustang?',
    options: ['Ford', 'Chevrolet', 'Toyota', 'Honda'],
    correct_answer: 'Ford',
    category: 'Car Brands',
    difficulty: 'Easy',
    season_id: 1
  },
  {
    id: 2,
    question: 'Which of these is NOT a Japanese car manufacturer?',
    options: ['BMW', 'Toyota', 'Honda', 'Nissan'],
    correct_answer: 'BMW',
    category: 'Car Brands',
    difficulty: 'Easy',
    season_id: 1
  },
  {
    id: 3,
    question: 'What does SUV stand for?',
    options: ['Sport Utility Vehicle', 'Standard Utility Van', 'Super Urban Vehicle', 'Sport Undercarriage Vehicle'],
    correct_answer: 'Sport Utility Vehicle',
    category: 'Car Terminology',
    difficulty: 'Easy',
    season_id: 1
  },
  {
    id: 4,
    question: 'Which car brand has a logo featuring four interlocking rings?',
    options: ['Audi', 'BMW', 'Mercedes-Benz', 'Volkswagen'],
    correct_answer: 'Audi',
    category: 'Car Brands',
    difficulty: 'Medium',
    season_id: 1
  },
  {
    id: 5,
    question: 'What does MPG stand for in car specifications?',
    options: ['Miles Per Gallon', 'Maximum Power Generated', 'Motor Power Grade', 'Multiple Point Gearbox'],
    correct_answer: 'Miles Per Gallon',
    category: 'Car Terminology',
    difficulty: 'Easy',
    season_id: 1
  },
  {
    id: 6,
    question: 'Which car company produces the 911 model?',
    options: ['Porsche', 'Ferrari', 'Lamborghini', 'Aston Martin'],
    correct_answer: 'Porsche',
    category: 'Car Brands',
    difficulty: 'Medium',
    season_id: 1
  },
  {
    id: 7,
    question: 'What type of engine uses spark plugs to ignite the fuel?',
    options: ['Gasoline', 'Diesel', 'Electric', 'Hydrogen'],
    correct_answer: 'Gasoline',
    category: 'Car Mechanics',
    difficulty: 'Medium',
    season_id: 1
  },
  {
    id: 8,
    question: 'Which country is home to the car manufacturer Hyundai?',
    options: ['South Korea', 'Japan', 'China', 'Germany'],
    correct_answer: 'South Korea',
    category: 'Car Brands',
    difficulty: 'Medium',
    season_id: 1
  },
  {
    id: 9,
    question: 'What does ABS stand for in car safety features?',
    options: ['Anti-lock Braking System', 'Automatic Brake System', 'Advanced Braking Sensors', 'Automated Backup System'],
    correct_answer: 'Anti-lock Braking System',
    category: 'Car Safety',
    difficulty: 'Medium',
    season_id: 1
  }
];

router.get('/', authenticateUser, async (req, res) => {
  console.log('Questions route accessed (GET /):', {
    timestamp: new Date().toISOString(),
    headers: req.headers,
    query: req.query,
    method: req.method,
    userId: req.user?.id || 'Not authenticated'
  });

  try {
    // Check if the user already has a completed attempt
    if (req.user) {
      const existingCompletedAttempt = await db.oneOrNone(
        'SELECT * FROM user_quiz_attempts WHERE user_id = $1 AND completed = true',
        [req.user.id]
      );

      if (existingCompletedAttempt) {
        console.log('User already has a completed attempt:', existingCompletedAttempt);
        return res.status(403).json({ 
          error: 'You have already completed the quiz. Only one attempt is allowed per season.',
          attemptId: existingCompletedAttempt.id,
          completed: true,
          score: existingCompletedAttempt.score
        });
      }
    }
    
    // First check if there's an active season
    console.log('Checking for active seasons');
    const activeSeason = await db.oneOrNone(`
      SELECT s.id, s.name, s.minimum_score_percentage, s.created_by_admin_id
      FROM seasons s
      WHERE s.is_active = true 
      AND s.start_date <= NOW() 
      AND s.end_date >= NOW()
      LIMIT 1
    `);

    if (!activeSeason) {
      console.log('No active season found');
      return res.status(200).json({
        questions: [],
        message: 'There is no active quiz season at the moment. Please check back later.',
        status: 'NO_ACTIVE_SEASON'
      });
    }
    
    // Verify the season was created by an admin
    if (!activeSeason.created_by_admin_id) {
      console.log('Active season not created by an admin');
      return res.status(403).json({
        questions: [],
        message: 'The current quiz season is not available. Please try again later.',
        status: 'INVALID_SEASON'
      });
    }

    console.log('Active season found:', activeSeason);

    // Check if the user is qualified for this season
    if (req.user) {
      console.log('Checking if user is qualified for this season');
      
      // Check if user has qualified in a previous qualification round
      const userQualification = await db.oneOrNone(`
        SELECT * FROM quiz_results 
        WHERE user_id = $1 
        AND season_id = $2 
        AND score >= (
          SELECT COUNT(*) * (minimum_score_percentage / 100.0)
          FROM questions
          WHERE season_id = $2
        )
      `, [req.user.id, activeSeason.id]);

      if (!userQualification) {
        console.log('User is not qualified for this season');
        return res.status(200).json({
          questions: [],
          message: 'You did not qualify for this season. Please wait for the next qualification round.',
          status: 'NOT_QUALIFIED'
        });
      }
      
      console.log('User is qualified for this season');
    }

    // Fetch questions for the active season
    console.log('Fetching questions for active season');
    const questions = await db.any('SELECT * FROM questions WHERE season_id = $1', [activeSeason.id]);
    
    console.log(`Fetched ${questions.length} questions for season ${activeSeason.id}`, {
      questionIds: questions.map(q => q.id),
      questionDetails: questions.slice(0, 2) // Log first 2 questions for debugging
    });
    
    if (questions.length === 0) {
      console.warn('No questions found for the active season');
      return res.status(200).json({
        questions: [],
        message: 'No questions are available for the current season yet.',
        status: 'NO_QUESTIONS'
      });
    }

    const formattedQuestions = questions.map(q => {
      try {
        // Safely parse options with error handling
        let parsedOptions = [];
        if (q.options) {
          if (typeof q.options === 'string') {
            try {
              parsedOptions = JSON.parse(q.options);
            } catch (parseError) {
              console.error(`Error parsing options for question ${q.id}:`, parseError);
              // Fallback to empty array if parsing fails
              parsedOptions = [];
            }
          } else if (Array.isArray(q.options)) {
            parsedOptions = q.options;
          }
        }
        
        return {
          id: q.id,
          question: q.question || 'Question unavailable',
          options: parsedOptions,
          correctAnswer: q.correct_answer || '', // Using correct_answer instead of correctAnswer
          category: q.category || 'General',
          difficulty: q.difficulty || 'Medium',
          seasonId: q.season_id
        };
      } catch (err) {
        console.error(`Error formatting question ${q.id}:`, err);
        // Return a default question object if formatting fails
        return {
          id: q.id || 0,
          question: 'Error loading question',
          options: [],
          correctAnswer: '',
          category: 'Error',
          difficulty: 'Medium',
          seasonId: q.season_id
        };
      }
    });

    console.log('Sending questions response', {
      questionCount: formattedQuestions.length,
      firstQuestionDetails: formattedQuestions[0] || 'No questions'
    });
    
    res.json({ 
      questions: formattedQuestions,
      season: {
        id: activeSeason.id,
        name: activeSeason.name,
        minimumScorePercentage: activeSeason.minimum_score_percentage
      }
    });
  } catch (error) {
    console.error('Error fetching questions:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Try to diagnose the specific error
    let errorType = 'unknown';
    let errorMessage = 'An unexpected error occurred while fetching questions.';
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.message.includes('connect')) {
      errorType = 'connection';
      errorMessage = 'Unable to connect to the database. Please try again later.';
    } else if (error.message.includes('relation') && error.message.includes('does not exist')) {
      errorType = 'schema';
      errorMessage = 'Database schema issue. Please contact support.';
    } else if (error.message.includes('permission denied')) {
      errorType = 'permission';
      errorMessage = 'Database permission issue. Please contact support.';
    }
    
    console.log(`Identified error type: ${errorType}. Using fallback questions.`);
    
    // Check if the user already has a completed attempt before using fallback
    if (req.user) {
      try {
        const existingCompletedAttempt = await db.oneOrNone(
          'SELECT * FROM user_quiz_attempts WHERE user_id = $1 AND completed = true',
          [req.user.id]
        );

        if (existingCompletedAttempt) {
          console.log('User already has a completed attempt (fallback check):', existingCompletedAttempt);
          return res.status(403).json({ 
            error: 'You have already completed the quiz. Only one attempt is allowed per season.',
            attemptId: existingCompletedAttempt.id,
            completed: true,
            score: existingCompletedAttempt.score
          });
        }
      } catch (secondaryError) {
        console.error('Error checking for completed attempts during fallback:', secondaryError);
        // Continue to fallback questions if this check fails
      }
    }
    
    // Format the fallback questions in the same way as the regular questions
    const formattedFallbackQuestions = fallbackQuestions.map(q => ({
      id: q.id,
      question: q.question,
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: q.correct_answer,
      category: q.category,
      difficulty: q.difficulty,
      seasonId: q.season_id
    }));
    
    // Return fallback questions with a message
    res.json({ 
      questions: formattedFallbackQuestions,
      season: {
        id: 1,
        name: 'Default Season',
        minimumScorePercentage: 60
      },
      message: `Using sample questions. ${errorMessage}`,
      usingFallback: true,
      errorType: errorType
    });
  }
});

export default router;
