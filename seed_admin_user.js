import bcrypt from 'bcryptjs';
import db from './config/database.js';

const email = "admin@admin.com";
const password = "admin123";

const hashPassword = async (plain) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plain, salt);
};

async function seedAdminUser() {
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if user already exists
    const existingUser = await client.oneOrNone(
      'SELECT id FROM users WHERE email = $1', 
      [email]
    );

    if (existingUser) {
      console.log('Admin user already exists:', email);
      return;
    }

    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Insert admin user
    await client.none(
      `INSERT INTO users (email, password, is_admin) 
       VALUES ($1, $2, $3)`,
      [email, hashedPassword, true]
    );

    await client.query('COMMIT');
    console.log('Admin user created successfully:', email);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating admin user:', error);
  } finally {
    client.release();
    process.exit();
  }
}

seedAdminUser();
