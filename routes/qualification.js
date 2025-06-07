import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get user's qualification status
router.get('/', authenticateUser, async (req, res) => {
  console.log('\n=== QUALIFICATION REQUEST STARTED ===');
  console.log('Request Time:', new Date().toISOString());
  
  try {
    // Validate user ID
    if (!req.user?.id) {
      console.error('No user ID in request');
      return res.status(400).json({
        error: 'User ID is required',
        hasAttempted: false,
        isQualified: false
      });
    }
    
    const userId = req.user.id;
    console.log('Processing request for user ID:', userId);
    
    // Test database connection
    try {
      await db.one('SELECT 1 as test');
      console.log('Database connection test successful');
    } catch (dbTestError) {
      console.error('Database connection test failed:', dbTestError);
      return res.status(503).json({
        error: 'Database connection error',
        message: 'Unable to connect to the database',
        hasAttempted: false,
        isQualified: false
      });
    }
    
    // Check if tables exist with better error handling
    let tablesExist;
    try {
      console.log('Checking if required tables exist...');
      const tableCheckQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'questions'
        ) as questions_exist,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'quiz_sessions'
        ) as sessions_exist`;
      
      console.log('Executing table check query:', tableCheckQuery);
      tablesExist = await db.oneOrNone(tableCheckQuery);
      console.log('Tables check result:', JSON.stringify(tablesExist, null, 2));
    } catch (tableCheckError) {
      console.error('Error checking table existence:', tableCheckError);
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'System is initializing. Please try again later.'
      });
    }

    if (!tablesExist || !tablesExist.questions_exist || !tablesExist.sessions_exist) {
      console.log('Required tables do not exist');
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'Quiz not yet available.'
      });
    }

    try {
      const tablesExist = await db.oneOrNone(`
        SELECT 
          EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'questions') as questions_exist,
          EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quiz_sessions') as sessions_exist
      `);
      
      console.log('Tables check result:', tablesExist);
      
      if (!tablesExist.questions_exist || !tablesExist.sessions_exist) {
        const missingTables = [];
        if (!tablesExist.questions_exist) missingTables.push('questions');
        if (!tablesExist.sessions_exist) missingTables.push('quiz_sessions');
        
        console.error(`Missing required tables: ${missingTables.join(', ')}`);
        return res.status(500).json({
          error: 'Database not properly initialized',
          message: `Missing required tables: ${missingTables.join(', ')}`,
          hasAttempted: false,
          isQualified: false
        });
      }
    } catch (tableCheckError) {
      console.error('Error checking table existence:', tableCheckError);
      return res.status(500).json({
        error: 'Database error',
        message: 'Failed to verify database structure',
        details: process.env.NODE_ENV === 'development' ? tableCheckError.message : undefined,
        hasAttempted: false,
        isQualified: false
      });
    }
    
    // Get total number of questions
    console.log('Fetching total number of questions...');
    let totalQuestions = 0;
    try {
      const countResult = await db.one('SELECT COUNT(*) as count FROM questions');
      totalQuestions = parseInt(countResult.count, 10);
      console.log(`Found ${totalQuestions} questions in the database`);
      
      if (totalQuestions === 0) {
        console.warn('No questions found in the database');
        return res.status(200).json({
          hasAttempted: false,
          isQualified: false,
          message: 'No questions are available at this time.'
        });
      }
    } catch (countError) {
      console.error('Error counting questions:', countError);
      console.error('Error details:', {
        message: countError.message,
        stack: countError.stack,
        code: countError.code,
        detail: countError.detail,
        hint: countError.hint,
        position: countError.position,
        internalPosition: countError.internalPosition,
        internalQuery: countError.internalQuery,
        where: countError.where,
        schema: countError.schema,
        table: countError.table,
        column: countError.column,
        dataType: countError.dataType,
        constraint: countError.constraint,
        file: countError.file,
        line: countError.line,
        routine: countError.routine
      });
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'Error loading quiz data.',
        error: countError.message,
        code: countError.code
      });
    }
    
    if (!totalQuestions || totalQuestions.count === 0) {
      console.log('No questions found in the database');
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'No questions available yet.'
      });
    }

    console.log(`Checking for quiz attempts for user ${userId}...`);
    let attempt = null;
    try {
      // First try to get a completed attempt
      attempt = await db.oneOrNone(
        `SELECT 
          id, 
          COALESCE(score, 0) as score,
          COALESCE(qualifies_for_next_round, false) as qualifies_for_next_round,
          COALESCE(percentage_score, 0) as percentage_score,
          $1 as total_questions,
          completed,
          completed_at
        FROM 
          quiz_sessions
        WHERE 
          user_id = $2 
          AND completed = true
        ORDER BY 
          completed_at DESC
        LIMIT 1`,
        [totalQuestions, userId]
      );
      
      console.log('Completed attempt found:', attempt ? 'Yes' : 'No');
      
      // If no completed attempt, check for any attempt
      if (!attempt) {
        console.log('No completed attempts, checking for any attempts...');
        attempt = await db.oneOrNone(
          `SELECT 
            id, 
            COALESCE(score, 0) as score,
            $1 as total_questions,
            COALESCE(completed, false) as completed
          FROM 
            quiz_sessions
          WHERE 
            user_id = $2
          ORDER BY 
            started_at DESC
          LIMIT 1`,
          [totalQuestions, userId]
        );
        console.log('Any attempt found:', attempt ? 'Yes' : 'No');
      }
      
      if (!attempt) {
        // User has not taken the quiz yet
        console.log('No quiz attempts found for user');
        return res.json({
          hasAttempted: false,
          isQualified: false,
          message: 'You have not attempted the quiz yet.'
        });
      }

      // Calculate minimum score required (50%)
      const minimumRequired = Math.ceil(attempt.total_questions * 0.5);
      const percentageScore = attempt.percentage_score || 
        (attempt.score / attempt.total_questions) * 100;
      const isQualified = percentageScore >= 50;
      
      return res.json({
        hasAttempted: true,
        isQualified,
        score: attempt.score,
        totalQuestions: attempt.total_questions,
        percentage: Math.round(percentageScore),
        completed: attempt.completed
      });
    } catch (error) {
      console.error('Error fetching qualification status:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Something went wrong on our end',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    } finally {
      console.log('=== QUALIFICATION REQUEST FINISHED ===\n');
    }
  } catch (error) {
    console.error('=== UNHANDLED ERROR IN QUALIFICATION ENDPOINT ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      table: error.table,
      constraint: error.constraint
    });
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
