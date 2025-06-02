import db from './config/database.js';

async function checkDatabase() {
  try {
    console.log('Checking database connection...');
    
    // Test connection
    await db.one('SELECT NOW()');
    console.log('✓ Database connection successful');
    
    // Check tables
    console.log('\nChecking tables...');
    const tables = ['users', 'questions', 'seasons', 'rounds', 'quiz_results'];
    
    for (const table of tables) {
      try {
        const exists = await db.oneOrNone(
          `SELECT to_regclass('public.${table}') as exists`
        );
        console.log(`- ${table}: ${exists ? '✓ Exists' : '✗ Missing'}`);
        
        if (exists) {
          const count = await db.one(
            `SELECT COUNT(*) FROM ${table}`,
            [],
            a => +a.count
          );
          console.log(`  Rows: ${count}`);
        }
      } catch (err) {
        console.error(`Error checking table ${table}:`, err.message);
      }
    }
    
    // Check admin user
    console.log('\nChecking admin user...');
    try {
      const adminUser = await db.oneOrNone('SELECT id, email FROM users WHERE admin = true LIMIT 1');
      console.log(`- Admin user: ${adminUser ? '✓ Found' : '✗ Not found'}`);
      if (adminUser) {
        console.log(`  ID: ${adminUser.id}, Email: ${adminUser.email}`);
      }
    } catch (error) {
      console.error('Database Error:', error);
      console.error('\nℹ️  If getting column errors, check your database schema matches the expected structure');
    }
    
  } catch (error) {
    console.error('Database check failed:', error);
  } finally {
    process.exit();
  }
}

checkDatabase();
