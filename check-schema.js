import db from './config/database.js';

async function checkSchema() {
  try {
    // Get table schema for users table
    const tableInfo = await db.any(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    console.log('Users table schema:');
    console.table(tableInfo);
    
    // List all tables in the database
    const tables = await db.any(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('\nAll tables in database:');
    console.table(tables);
    
  } catch (error) {
    console.error('Error checking schema:', error);
  } finally {
    process.exit(0);
  }
}

checkSchema();
