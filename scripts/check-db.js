import pgPromise from 'pg-promise';
import dotenv from 'dotenv';

dotenv.config();

const pgp = pgPromise();

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres_tqud_user:nVBVefqkPY2640tlnd7ULqpQ30LzyMhB@dpg-d0lhrbpr0fns738ddi80-a.oregon-postgres.render.com/postgres_tqud',
  ssl: { rejectUnauthorized: false }
};

const db = pgp(dbConfig);

async function checkDatabase() {
  try {
    console.log('Checking database connection...');
    await db.one('SELECT NOW() as now');
    console.log('✅ Database connection successful');

    // Check tables
    console.log('\nChecking tables...');
    const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\nFound tables:');
    console.table(tables.map(t => t.table_name));

    // Check users table
    console.log('\nChecking users table...');
    const usersColumns = await db.any(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.table(usersColumns);

    // Check questions table
    console.log('\nChecking questions table...');
    const questionsColumns = await db.any(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'questions'
      ORDER BY ordinal_position
    `);
    console.table(questionsColumns);

    // Check quiz_sessions table
    console.log('\nChecking quiz_sessions table...');
    const quizSessionsColumns = await db.any(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'quiz_sessions'
      ORDER BY ordinal_position
    `);
    console.table(quizSessionsColumns);

    // Check user count
    const userCount = await db.one('SELECT COUNT(*) as count FROM users');
    console.log('\nTotal users:', userCount.count);

    // Check question count
    const questionCount = await db.one('SELECT COUNT(*) as count FROM questions');
    console.log('Total questions:', questionCount.count);

    // Check quiz sessions count
    const sessionCount = await db.one('SELECT COUNT(*) as count FROM quiz_sessions');
    console.log('Total quiz sessions:', sessionCount.count);

  } catch (error) {
    console.error('\n❌ Error checking database:');
    console.error(error);
  } finally {
    pgp.end();
    process.exit(0);
  }
}

checkDatabase();
