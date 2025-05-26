import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import db from '../config/database.js';

const router = express.Router();

// Get user's qualification status
router.get('/', authenticateUser, async (req, res) => {
  try {
    console.log('=== QUALIFICATION REQUEST STARTED ===');
    console.log('User ID:', req.user.id);
    const userId = req.user.id;
    
    // Log database connection info
    console.log('Database connection pool state:', db.$pool);
    
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

    // First, get total number of questions
    let totalQuestions;
    try {
      console.log('Fetching total number of questions...');
      const countQuery = 'SELECT COUNT(*) as count FROM questions';
      console.log('Executing count query:', countQuery);
      totalQuestions = await db.oneOrNone(countQuery);
      console.log('Total questions result:', JSON.stringify(totalQuestions, null, 2));
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
    
    try {
      console.log('Checking for completed quiz attempts...');
      let attempt;
      try {
        // First try to get a completed attempt
        attempt = await db.oneOrNone(
          `SELECT 
            id, 
            score, 
            qualifies_for_next_round,
            percentage_score,
            $1::integer as total_questions
          FROM 
            quiz_sessions
          WHERE 
            user_id = $2 AND completed = true
          ORDER BY 
            completed_at DESC
          LIMIT 1`,
          [parseInt(totalQuestions.count, 10), userId]
        );
        console.log('Completed attempt found:', !!attempt);
      } catch (attemptError) {
        console.error('Error fetching completed attempt:', attemptError);
        // Continue to check for any attempt
      }
      
      // If no completed attempt, check for any attempt
      if (!attempt) {
        console.log('No completed attempts, checking for any attempts...');
        try {
          const anyAttempt = await db.oneOrNone(
            `SELECT 
              id, 
              score,
              $1::integer as total_questions
            FROM 
              quiz_sessions
            WHERE 
              user_id = $2
            ORDER BY 
              created_at DESC
            LIMIT 1`,
            [parseInt(totalQuestions.count, 10), userId]
          );
          
          if (anyAttempt) {
            console.log('Found incomplete attempt:', anyAttempt);
            return res.json({
              hasAttempted: true,
              isQualified: false,
              score: anyAttempt.score || 0,
              totalQuestions: anyAttempt.total_questions || 0,
              percentageScore: 0,
              minimumRequired: Math.ceil((anyAttempt.total_questions || 0) * 0.5),
              message: 'You have an incomplete attempt. Please complete the quiz to see if you qualify.'
            });
          }
        } catch (anyAttemptError) {
          console.error('Error checking for any attempts:', anyAttemptError);
          // Continue to return no attempts
        }

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
        percentageScore: percentageScore.toFixed(2),
        minimumRequired,
        message: isQualified
          ? 'Congratulations! You have qualified for the next round.' 
          : `You did not meet the minimum score requirement of ${minimumRequired} points (50%).`
      });
    } catch (dbError) {
      console.error('Database error in qualification endpoint:', dbError);
      return res.status(200).json({
        hasAttempted: false,
        isQualified: false,
        message: 'Quiz data not yet available.'
      });
    }
  } catch (error) {
    console.error('=== UNHANDLED ERROR IN QUALIFICATION ENDPOINT ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      internalPosition: error.internalPosition,
      internalQuery: error.internalQuery,
      where: error.where,
      schema: error.schema,
      table: error.table,
      column: error.column,
      dataType: error.dataType,
      constraint: error.constraint,
      file: error.file,
      line: error.line,
      routine: error.routine
    });
    
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      code: error.code,
      details: {
        detail: error.detail,
        hint: error.hint,
        table: error.table,
        constraint: error.constraint
      }
    });
  } finally {
    console.log('=== QUALIFICATION REQUEST COMPLETED ===');
  }
});

export default router;
