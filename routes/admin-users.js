import express from 'express';
import bcrypt from 'bcrypt';
import { isAdmin } from '../middleware/auth.js';
import db from '../config/database.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

// Get all users with pagination and filtering
router.get('/', isAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '', role, status } = req.query;
  const offset = (page - 1) * limit;
  
  // Build the WHERE clause based on filters
  let whereClause = [];
  let params = [];
  let paramIndex = 1;
  
  if (search) {
    whereClause.push(`(username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  if (role) {
    whereClause.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }
  
  // Handle status filter (maps to is_disqualified in the database)
  if (status === 'active') {
    whereClause.push(`is_disqualified = false`);
  } else if (status === 'disqualified') {
    whereClause.push(`is_disqualified = true`);
  }
  
  const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';
  
  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) 
    FROM users 
    ${whereString}
  `;
  
  // Get users with pagination
  const usersQuery = `
    SELECT 
      id, 
      username, 
      email, 
      role, 
      role as status,
      is_disqualified,
      created_at,
      updated_at,
      (SELECT COUNT(*) FROM user_quiz_attempts WHERE user_id = users.id) as attempt_count,
      (SELECT MAX(score) FROM user_quiz_attempts WHERE user_id = users.id AND completed = true) as highest_score
    FROM users
    ${whereString}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  const totalCount = await db.one(countQuery, params);
  params.push(parseInt(limit), parseInt(offset));
  
  const users = await db.any(usersQuery, params);
  
  res.json({
    users,
    pagination: {
      total: parseInt(totalCount.count),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(totalCount.count) / parseInt(limit))
    }
  });
}));

// Get user details including quiz history
router.get('/:id', isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Get user details
  const user = await db.oneOrNone(`
    SELECT 
      id, 
      username, 
      email, 
      role, 
      role as status,
      is_disqualified,
      created_at,
      updated_at
    FROM users
    WHERE id = $1
  `, [id]);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Get user's quiz attempts
  const attempts = await db.any(`
    SELECT 
      qs.id,
      qs.score,
      qs.total_questions,
      qs.completed,
      qs.started_at,
      qs.completed_at,
      s.id as season_id,
      s.name as season_name,
      r.id as round_id,
      r.name as round_name,
      (qs.score::float / qs.total_questions) * 100 as percentage_score
    FROM quiz_sessions qs
    LEFT JOIN seasons s ON qs.season_id = s.id
    LEFT JOIN rounds r ON qs.round_id = r.id
    WHERE qs.user_id = $1
    ORDER BY qs.started_at DESC
  `, [id]);
  
  // Get qualification status
  const qualifications = await db.any(`
    SELECT 
      qr.id,
      qr.score,
      qr.completed_at,
      s.id as season_id,
      s.name as season_name,
      r.id as round_id,
      r.name as round_name,
      s.minimum_score_percentage,
      (qr.score::float / (SELECT COUNT(*) FROM questions WHERE season_id = s.id)) * 100 as percentage_score
    FROM quiz_results qr
    JOIN seasons s ON qr.season_id = s.id
    LEFT JOIN rounds r ON qr.round_id = r.id
    WHERE qr.user_id = $1
    ORDER BY qr.completed_at DESC
  `, [id]);
  
  res.json({
    user,
    attempts,
    qualifications
  });
}));

// Update user (role, status, etc.)
router.put('/:id', isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, is_disqualified, username, email } = req.body;
  
  // Verify user exists
  const userExists = await db.oneOrNone('SELECT id FROM users WHERE id = $1', [id]);
  if (!userExists) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Build update query dynamically based on provided fields
  const updateFields = [];
  const values = [];
  let paramIndex = 1;
  
  if (role !== undefined) {
    updateFields.push(`role = $${paramIndex}`);
    values.push(role);
    paramIndex++;
  }
  
  // Status is handled through role in this database schema
  // if (status !== undefined) {
  //   updateFields.push(`status = $${paramIndex}`);
  //   values.push(status);
  //   paramIndex++;
  // }
  
  if (is_disqualified !== undefined) {
    updateFields.push(`is_disqualified = $${paramIndex}`);
    values.push(is_disqualified);
    paramIndex++;
  }
  
  if (username) {
    // Check if username is already taken
    const usernameExists = await db.oneOrNone('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
    if (usernameExists) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    updateFields.push(`username = $${paramIndex}`);
    values.push(username);
    paramIndex++;
  }
  
  if (email) {
    // Check if email is already taken
    const emailExists = await db.oneOrNone('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
    if (emailExists) {
      return res.status(400).json({ error: 'Email is already taken' });
    }
    
    updateFields.push(`email = $${paramIndex}`);
    values.push(email);
    paramIndex++;
  }
  
  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  updateFields.push(`updated_at = NOW()`);
  
  // Add user ID to values array
  values.push(id);
  
  const query = `
    UPDATE users
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, username, email, role, status, is_disqualified, created_at, updated_at
  `;
  
  const updatedUser = await db.one(query, values);
  
  res.json({
    message: 'User updated successfully',
    user: updatedUser
  });
}));

// Reset user password
router.post('/:id/reset-password', isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }
  
  // Verify user exists
  const userExists = await db.oneOrNone('SELECT id FROM users WHERE id = $1', [id]);
  if (!userExists) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  
  // Update the password
  await db.none('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, id]);
  
  res.json({
    message: 'Password reset successfully'
  });
}));

// Delete user (or soft delete by changing status)
router.delete('/:id', isAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { softDelete = true } = req.query;
  
  // Verify user exists
  const userExists = await db.oneOrNone('SELECT id FROM users WHERE id = $1', [id]);
  if (!userExists) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (softDelete === 'true') {
    // Soft delete - update is_disqualified to true
    await db.none('UPDATE users SET is_disqualified = true, updated_at = NOW() WHERE id = $2', [id]);
    
    res.json({
      message: 'User disqualified successfully'
    });
  } else {
    // Hard delete - remove from database
    // This is potentially dangerous and should be used with caution
    try {
      await db.tx(async t => {
        // Delete related records first
        await t.none('DELETE FROM user_responses WHERE session_id IN (SELECT id FROM quiz_sessions WHERE user_id = $1)', [id]);
        await t.none('DELETE FROM quiz_sessions WHERE user_id = $1', [id]);
        await t.none('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
        await t.none('DELETE FROM quiz_results WHERE user_id = $1', [id]);
        
        // Finally delete the user
        await t.none('DELETE FROM users WHERE id = $1', [id]);
      });
      
      res.json({
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Error during user deletion:', error);
      return res.status(500).json({ 
        error: 'Failed to delete user',
        message: 'There may be related records that prevent deletion'
      });
    }
  }
}));

export default router;
