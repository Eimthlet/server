import 'dotenv/config';
import express from "express";
import cors from "cors";
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

// Config
import db from './config/database.js';
import setupSwagger from './config/swagger.js';

// Routes
import authRoutes from './routes/auth.js';
import paychanguRoutes from './routes/paychangu.js';
import adminRoutes from './routes/admin.js';
import adminQuizRoutes from './routes/admin-quiz.js';
import adminSeasonsRoutes from './routes/admin-seasons.js';
import adminUsersRoutes from './routes/admin-users.js';
import resultsRoutes from "./routes/results.js";
import questionsRoutes from "./routes/questions.js";
import quizRoutes from "./routes/quiz.js";
import progressRoutes from "./routes/progress_updated.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import qualificationRoutes from "./routes/qualification.js";
import migrationsRoutes from "./routes/migrations.js";

// Middleware
import { isAdmin, authenticateUser } from './middleware/auth.js';
import { errorHandler, asyncHandler } from './middleware/errorHandler.js';

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000;

// Setup Swagger documentation
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
}

// Middleware
const allowedOrigins = [
  'https://car-quizz-jonathans-projects-8c96c19b.vercel.app',
  'https://car-quizz-git-main-jonathans-projects-8c96c19b.vercel.app',
  'https://car-quizz.vercel.app',
  'http://localhost:3000',  // For local development
  'http://localhost:5000'   // For local development
];

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Allow all Vercel domains and localhost
    if (origin.endsWith('vercel.app') || origin.includes('localhost')) {
      callback(null, origin);
    } else {
      console.log('Origin not allowed by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'Origin', 'Accept', 'X-Requested-With', 'Cookie'],
  exposedHeaders: ['Set-Cookie', 'X-XSRF-TOKEN'],
  maxAge: 86400 // 24 hours
};

// Apply CORS configuration
app.use(cors(corsOptions));

// Enable pre-flight requests for all routes
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser()); // Parse cookies

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log('Incoming Request:', {
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    query: req.query,
    timestamp: new Date().toISOString()
  });
  next();
});

// Authentication middleware is now imported from './middleware/auth.js'

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API
 *     responses:
 *       200:
 *         description: API is running
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API routes
app.use('/api/auth', authRoutes);
// Mount PayChangu routes at the root level to ensure callbacks work
// The routes are already handling both / and /api/auth paths internally
app.use('/', paychanguRoutes);

// Mount admin routes
app.use('/api/admin', isAdmin, adminRoutes);
app.use('/api/admin/quiz', isAdmin, adminQuizRoutes);
app.use('/api/admin/seasons', isAdmin, adminSeasonsRoutes);
app.use('/api/admin/users', isAdmin, adminUsersRoutes); // New admin users route
app.use('/api/admin/migrations', isAdmin, migrationsRoutes); // Migrations route for database updates
app.use('/api/questions', questionsRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/leaderboard', leaderboardRoutes); // Changed from /api/results/leaderboard
app.use('/api/qualification', qualificationRoutes);

// 404 Handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Insights statistics endpoint
app.get("/api/admin/insights-stats", isAdmin, async (req, res) => {
  try {
    const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
    
    // Average Score
    const averageScoreQuery = "SELECT AVG(score) as avg_score FROM progress";
    
    // Most Played Game
    const mostPlayedGameQuery = `
      SELECT 'Quiz Game' as game_name, COUNT(*) as play_count
      FROM progress
    `;
    
    // Least Played Game
    const leastPlayedGameQuery = `
      SELECT 'Quiz Game' as game_name, COUNT(*) as play_count
      FROM progress
    `;
    
    // Player Insights
    const playerInsightsQuery = `
      SELECT 
        u.id, 
        u.username, 
        CASE 
          WHEN AVG(p.score) > 80 THEN 'Top Performer'
          WHEN AVG(p.score) < 50 THEN 'Needs Improvement'
          ELSE 'Average Player'
        END as insight,
        ROUND(AVG(p.score), 2) as average_score,
        COUNT(p.id) as total_games
      FROM users u
      JOIN progress p ON u.id = p.user_id
      WHERE u.is_admin = 0
      GROUP BY u.id, u.username
      ORDER BY average_score DESC
      LIMIT 10
    `;

    // Total Non-Admin Users
    const totalUsersQuery = `
      SELECT COUNT(*) as total_users
      FROM users
      WHERE is_admin = 0
    `;

    // Non-Admin Users with Scores
    const nonAdminUsersQuery = `
      SELECT 
        u.id, 
        u.username, 
        u.email,
        ROUND(AVG(p.score), 2) as average_score,
        COUNT(p.id) as total_games,
        MAX(p.score) as highest_score,
        MIN(p.score) as lowest_score
      FROM users u
      LEFT JOIN progress p ON u.id = p.user_id
      WHERE u.is_admin = 0
      GROUP BY u.id, u.username, u.email
      ORDER BY average_score DESC
    `;
    
    // Execute queries
    const executeQueries = () => {
      return new Promise((resolve, reject) => {
        db.get(averageScoreQuery, [], (err, avgScoreRow) => {
          if (err) {
            console.error('Average score query error:', err);
            return reject({ status: 500, message: 'Failed to fetch average score' });
          }

          db.all(mostPlayedGameQuery, [], (err, mostPlayedRows) => {
            if (err) {
              console.error('Most played game query error:', err);
              return reject({ status: 500, message: 'Failed to fetch most played game' });
            }

            db.all(leastPlayedGameQuery, [], (err, leastPlayedRows) => {
              if (err) {
                console.error('Least played game query error:', err);
                return reject({ status: 500, message: 'Failed to fetch least played game' });
              }

              db.get(totalUsersQuery, [], (err, totalUsersRow) => {
                if (err) {
                  console.error('Total users query error:', err);
                  return reject({ status: 500, message: 'Failed to fetch total users' });
                }

                db.all(nonAdminUsersQuery, [], (err, nonAdminUsersRows) => {
                  if (err) {
                    console.error('Non-admin users query error:', err);
                    return reject({ status: 500, message: 'Failed to fetch non-admin users' });
                  }

                  db.all(playerInsightsQuery, [], (err, insightsRows) => {
                    if (err) {
                      console.error('Player insights query error:', err);
                      return reject({ status: 500, message: 'Failed to fetch player insights' });
                    }
                    
                    resolve({
                      averageScore: Math.round(avgScoreRow.avg_score || 0),
                      mostPlayedGame: mostPlayedRows[0] ? mostPlayedRows[0].game_name : 'Quiz Game',
                      leastPlayedGame: leastPlayedRows[0] ? leastPlayedRows[0].game_name : 'Quiz Game',
                      insights: insightsRows,
                      totalUsers: totalUsersRow ? totalUsersRow.total_users || 0 : 0,
                      nonAdminUsers: nonAdminUsersRows || []
                    });
                  });
                });
              });
            });
          });
        });
      });
    };

    executeQueries()
      .then(data => res.json(data))
      .catch(error => {
        console.error('Insights stats error:', error);
        res.status(error.status || 500).json({ error: error.message });
      });
  } catch (error) {
    console.error('Insights stats error:', error);
    res.status(500).json({ error: 'Failed to fetch insights statistics', details: error.message });
  }
});

// authenticateUser is now imported from './middleware/auth.js'

// Endpoint to get all questions
app.get("/api/questions", authenticateUser, async (req, res) => {
  try {
    const questions = await db.any('SELECT * FROM questions');
    res.json({ questions });
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Admin route to get all questions with additional details
app.get('/api/admin/questions', isAdmin, async (req, res) => {
  try {
    const questions = await db.any('SELECT * FROM questions ORDER BY id DESC');
    res.json({ 
      questions: questions.map(row => ({
        ...row,
        options: JSON.parse(row.options || '[]')
      }))
    });
  } catch (error) {
    console.error('Error fetching admin questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Admin route to add a new question
app.post('/api/admin/questions', isAdmin, async (req, res) => {
  const { question, options, correct_answer, category, difficulty, time_limit } = req.body;

  // Basic validation
  if (!question || !options || !correct_answer || !category || !difficulty) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Convert options array to JSON string for storage
    const optionsJson = JSON.stringify(options);
    
    // Insert the new question
    const result = await db.one(
      'INSERT INTO questions(question, options, correct_answer, category, difficulty, time_limit) VALUES($1, $2, $3, $4, $5, $6) RETURNING *',
      [question, optionsJson, correct_answer, category, difficulty, time_limit || 30]
    );
    
    // Parse options back to array for response
    const newQuestion = {
      ...result,
      options: JSON.parse(result.options || '[]')
    };
    
    res.status(201).json({ 
      message: 'Question added successfully',
      question: newQuestion
    });
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(500).json({ error: 'Failed to add question', details: error.message });
  }
});
// Admin route to delete a question
app.delete('/api/admin/questions/:id', isAdmin, async (req, res) => {
  const questionId = req.params.id;

  try {
    const result = await db.result('DELETE FROM questions WHERE id = $1', [questionId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.status(200).json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Admin Dashboard Statistics
app.get("/api/admin/dashboard-stats", isAdmin, async (req, res) => {
  
  try {
    const stats = {};
    
    // Get total users
    // Get total users
    const userCount = await db.one('SELECT COUNT(*) as count FROM users WHERE is_admin = false');
    stats.totalUsers = userCount.count;

    // Get top players
    const topPlayers = await db.any(`
      SELECT u.username, MAX(p.score) as highest_score, COUNT(p.id) as games_played
      FROM users u
      JOIN progress p ON u.id = p.user_id
      WHERE u.is_admin = false
      GROUP BY u.id, u.username
      ORDER BY highest_score DESC, games_played DESC
      LIMIT 5
    `);
    stats.topPlayers = topPlayers;

    // Get recent activity
    const recentActivity = await db.any(`
      SELECT u.username, p.score, p.created_at
      FROM progress p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 10
    `);
    stats.recentActivity = recentActivity;

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  } finally {
    db.close();
  }
});

// Prevent game replays
app.post("/api/quiz/start", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
    
    // Check if user has already played
    const checkQuery = "SELECT COUNT(*) as count FROM progress WHERE user_id = $1";
    const hasPlayed = await new Promise((resolve, reject) => {
      db.get(checkQuery, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count > 0);
      });
    });

    if (hasPlayed) {
      return res.status(403).json({ 
        error: 'Game Already Played',
        message: 'You have already played this quiz. Multiple attempts are not allowed.'
      });
    }

    // If not played, proceed with quiz start logic
    res.json({ success: true, message: 'Quiz started successfully' });
  } catch (error) {
    console.error('Error starting quiz:', error);
    res.status(500).json({ error: 'Failed to start quiz' });
  }
});

// Seasons management
app.post("/api/admin/seasons", isAdmin, async (req, res) => {
  const { name, startDate, endDate } = req.body;
  
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'Name, start date, and end date are required' });
  }

  const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
  
  try {
    // Format dates to ISO string for consistent storage
    const formattedStartDate = new Date(startDate).toISOString();
    const formattedEndDate = new Date(endDate).toISOString();

    const query = `
      INSERT INTO seasons (name, start_date, end_date, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `;
    
    await new Promise((resolve, reject) => {
      db.run(query, [name, formattedStartDate, formattedEndDate], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    res.json({ success: true, message: 'Season created successfully' });
  } catch (error) {
    console.error('Error creating season:', error);
    res.status(500).json({ error: 'Failed to create season' });
  } finally {
    db.close();
  }
});

// Get seasons with proper date formatting
app.get("/api/admin/seasons", isAdmin, async (req, res) => {
  const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
  
  try {
    const query = `
      SELECT 
        id,
        name,
        datetime(start_date) as start_date,
        datetime(end_date) as end_date,
        datetime(created_at) as created_at
      FROM seasons
      ORDER BY created_at DESC
    `;
    
    const seasons = await new Promise((resolve, reject) => {
      db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({ seasons });
  } catch (error) {
    console.error('Error fetching seasons:', error);
    res.status(500).json({ error: 'Failed to fetch seasons' });
  } finally {
    db.close();
  }
});

// Update season endpoint
app.put("/api/admin/seasons/:id", isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate, isActive } = req.body;
  
  const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
  
  try {
    // Format dates
    const formattedStartDate = new Date(startDate).toISOString();
    const formattedEndDate = new Date(endDate).toISOString();

    const query = `
      UPDATE seasons 
      SET name = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `;
    
    await new Promise((resolve, reject) => {
      db.run(query, [name, formattedStartDate, formattedEndDate, id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    res.json({ 
      success: true, 
      message: 'Season updated successfully',
      season: { id, name, startDate: formattedStartDate, endDate: formattedEndDate }
    });
  } catch (error) {
    console.error('Error updating season:', error);
    res.status(500).json({ error: 'Failed to update season' });
  } finally {
    db.close();
  }
});

// Activate season endpoint
app.post("/api/admin/seasons/:id/activate", isAdmin, async (req, res) => {
  const { id } = req.params;
  const db = new sqlite3.Database(path.join(process.cwd(), 'quiz.db'));
  
  try {
    // Deactivate all seasons first
    await new Promise((resolve, reject) => {
      db.run('UPDATE seasons SET is_active = 0', [], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    // Activate the selected season
    await new Promise((resolve, reject) => {
      db.run('UPDATE seasons SET is_active = 1 WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });

    // Get the updated season
    const season = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM seasons WHERE id = $1', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.json({ success: true, season });
  } catch (error) {
    console.error('Error activating season:', error);
    res.status(500).json({ error: 'Failed to activate season' });
  } finally {
    db.close();
  }
});

// Update question endpoint
app.put("/api/admin/questions/:id", isAdmin, async (req, res) => {
  const { id } = req.params;
  const { question, options, correctAnswer, category, difficulty } = req.body;

  try {
    // Convert options to JSON string for storage
    const optionsJson = JSON.stringify(options);
    
    // Update the question in the database
    await db.none(
      'UPDATE questions SET question = $1, options = $2, correct_answer = $3, category = $4, difficulty = $5 WHERE id = $6',
      [question, optionsJson, correctAnswer, category, difficulty, id]
    );

    res.json({ 
      success: true, 
      message: 'Question updated successfully',
      question: { id, question, options, correctAnswer, category, difficulty }
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// end point to get all leaderboard
