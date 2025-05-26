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

// Use DATABASE_URL if provided, otherwise use individual parameters
const dbConfig = process.env.DATABASE_URL || {
  host: process.env.DATABASE_HOST || 'dpg-d0lhrbpr0fns738ddi80-a.oregon-postgres.render.com',
  port: process.env.DATABASE_PORT || 5432,
  database: process.env.DATABASE_NAME || 'postgres_tqud',
  user: process.env.DATABASE_USER || 'postgres_tqud_user',
  password: process.env.DATABASE_PASSWORD || 'nVBVefqkPY2640tlnd7ULqpQ30LzyMhB',
  ssl: { 
    rejectUnauthorized: false,
    // Additional SSL options if needed
  },
  // Connection timeout of 10 seconds
  connectionTimeoutMillis: 10000,
  // Maximum number of clients in the pool
  max: 20,
  // Idle timeout for a client
  idleTimeoutMillis: 30000
};

console.log('Initializing database connection with config:', {
  ...dbConfig,
  password: dbConfig.password ? '***' : 'not set'
});

// Create the database instance
const db = pgp(dbConfig);

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
