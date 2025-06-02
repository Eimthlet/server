import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

// Initialize pg-promise with query timing
const initOptions = {
  query(e) {
    console.log('QUERY:', e.query);
    if (e.params) {
      console.log('PARAMS:', e.params);
    }
  },
  connect(client) {
    const cp = client.connectionParameters;
    console.log('Connected to database:', {
      database: cp.database,
      host: cp.host,
      port: cp.port,
      user: cp.user,
      ssl: cp.ssl ? 'enabled' : 'disabled'
    });
  },
  error(err, e) {
    console.error('Database Error:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      internalPosition: err.internalPosition,
      internalQuery: err.internalQuery,
      where: err.where,
      schema: err.schema,
      table: err.table,
      column: err.column,
      dataType: err.dataType,
      constraint: err.constraint,
      file: err.file,
      line: err.line,
      routine: err.routine
    });
  }
};

const pgp = pgPromise(initOptions);

// Use connection string for database configuration
const dbConfig = {
  connectionString: 'postgresql://postgres_tqud_user:nVBVefqkPY2640tlnd7ULqpQ30LzyMhB@dpg-d0lhrbpr0fns738ddi80-a.oregon-postgres.render.com/postgres_tqud',
  ssl: { 
    rejectUnauthorized: false
  },
<<<<<<< HEAD
  // Reduced connection timeout to fail faster if DB is unavailable
  connectionTimeoutMillis: 5000,
  // Reduced max clients for better resource management
  max: 10, 
  // Shorter idle timeout to release connections quicker
  idleTimeoutMillis: 10000,
  // Query timeout to prevent hanging queries
  query_timeout: 5000,
  // Enable statement timeout for all queries
  statement_timeout: 5000,
  // Retry strategy
  retry: {
    max: 3,
    interval: 1000
  }
=======
  // Connection timeout of 10 seconds
  connectionTimeoutMillis: 10000,
  // Maximum number of clients in the pool
  max: 20,
  // Idle timeout for a client
  idleTimeoutMillis: 30000
>>>>>>> e1a003cf8e9377eb786f85f708165d69f2e41808
};

console.log('Initializing database connection with config:', {
  ...dbConfig,
  password: dbConfig.password ? '***' : 'not set'
});

// Create the database instance
const db = pgp(dbConfig);

<<<<<<< HEAD
// Test the connection with retry logic
async function testConnection() {
  const maxRetries = 3;
  let retryCount = 0;
  let lastError = null;
  
  while (retryCount < maxRetries) {
    try {
      const result = await Promise.race([
        db.one('SELECT NOW() as now'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        )
      ]);
      console.log('Database connection test successful. Current time:', result.now);
      return; // Success, exit the function
    } catch (error) {
      lastError = error;
      retryCount++;
      console.error(`Database connection test failed (attempt ${retryCount}/${maxRetries}):`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
      
      if (retryCount < maxRetries) {
        console.log(`Retrying in ${retryCount * 1000}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
      }
    }
  }
  
  console.error(`All connection attempts failed after ${maxRetries} retries.`);
  // Don't exit the process on connection failure, allow the app to continue
  // but log the failure clearly
  console.error('WARNING: Database connection could not be established!');
  // Instead of exiting, we'll continue but may have degraded functionality
=======
// Test the connection
async function testConnection() {
  try {
    const result = await db.one('SELECT NOW() as now');
    console.log('Database connection test successful. Current time:', result.now);
  } catch (error) {
    console.error('Database connection test failed:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    process.exit(1);
  }
>>>>>>> e1a003cf8e9377eb786f85f708165d69f2e41808
}

// Run the connection test when this module is imported
testConnection().catch(console.error);

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down database connection pool...');
  db.$pool.end();
  process.exit(0);
});

export default db;
