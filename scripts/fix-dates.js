/**
 * Script to fix date formats in the seasons table
 */
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// PostgreSQL connection string
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres_tqud_user:nVBVefqkPY2640tlnd7ULqpQ30LzyMhB@dpg-d0lhrbpr0fns738ddi80-a.oregon-postgres.render.com/postgres_tqud';
console.log(`Connecting to PostgreSQL database...`);

// Configure PostgreSQL client
const { Pool } = pg;
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for connecting to Render's PostgreSQL
  }
});

/**
 * Format date to YYYY-MM-DD
 * @param {string} dateString - The date string to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error formatting date:', error);
    return null;
  }
}

/**
 * Fix dates in the seasons table
 */
async function fixDates() {
  const client = await pool.connect();
  
  try {
    console.log('Starting date format fix...');
    
    // Get all seasons
    const { rows } = await client.query('SELECT id, start_date, end_date FROM seasons');
    console.log(`Found ${rows.length} seasons to check`);
    
    // Process each season
    for (const row of rows) {
      const { id, start_date, end_date } = row;
      
      // Format dates
      const formattedStartDate = formatDate(start_date);
      const formattedEndDate = formatDate(end_date);
      
      if (formattedStartDate && formattedEndDate) {
        // Update the season with formatted dates
        await client.query(
          'UPDATE seasons SET start_date = $1, end_date = $2 WHERE id = $3',
          [formattedStartDate, formattedEndDate, id]
        );
        console.log(`Updated season ${id}: ${start_date} -> ${formattedStartDate}, ${end_date} -> ${formattedEndDate}`);
      } else {
        console.log(`Skipping season ${id} due to invalid dates: ${start_date}, ${end_date}`);
      }
    }
    
    console.log('Date format fix completed successfully');
  } catch (error) {
    console.error('Error fixing dates:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the fix
fixDates().catch(console.error);
