import bcrypt from 'bcryptjs';
import pg from 'pg-promise';

// Connect to database
const pgp = pg();
const db = pgp({
  connectionString: "postgresql://postgres_tqud_user:nVBVefqkPY2640tlnd7ULqpQ30LzyMhB@dpg-d0lhrbpr0fns738ddi80-a.oregon-postgres.render.com/postgres_tqud",
  ssl: { rejectUnauthorized: false }
});

const email = 'carguru@gmail.com';
const password = 'Cars@2025';

async function updateUserPassword() {
  try {
    // Generate hash exactly as the server does
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    console.log('Generated hash:', hashedPassword);
    
    // Update the user's password in the database
    const result = await db.result(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email',
      [hashedPassword, email]
    );
    
    if (result.rowCount > 0) {
      console.log('Successfully updated password for user:', email);
    } else {
      console.log('User not found:', email);
    }
  } catch (error) {
    console.error('Error updating password:', error);
  } finally {
    pgp.end();
  }
}

updateUserPassword();
