import db from '../config/database.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

/**
 * Middleware to check if user has access to a season
 * - Admins always have access
 * - For qualification rounds, checks if user has passed qualification
 * - For regular seasons, checks if user has passed qualification (if required)
 */
export const checkSeasonAccess = async (req, res, next) => {
  try {
    const { seasonId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }

    // Admins bypass all checks
    if (req.user?.isAdmin) {
      return next();
    }

    // Get season details
    const season = await db.oneOrNone(
      `SELECT id, is_qualification_round, is_active, 
              start_date, end_date, requires_qualification
       FROM seasons 
       WHERE id = $1`,
      [seasonId]
    );

    if (!season) {
      throw new NotFoundError('Season not found');
    }

    // Check if season is active
    const now = new Date();
    if (season.start_date > now || season.end_date < now) {
      throw new ForbiddenError('This season is not currently active');
    }

    // For qualification rounds, check if user has already passed
    if (season.is_qualification_round) {
      const userStatus = await db.oneOrNone(
        `SELECT has_passed_qualification 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (userStatus?.has_passed_qualification) {
        throw new ForbiddenError('You have already passed the qualification round');
      }
      return next();
    }

    // For regular seasons that require qualification
    if (season.requires_qualification) {
      const userStatus = await db.oneOrNone(
        `SELECT has_passed_qualification 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (!userStatus?.has_passed_qualification) {
        throw new ForbiddenError('Qualification required to access this season');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user can start a qualification attempt
 */
export const canAttemptQualification = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenError('Authentication required');
    }

    // Check if user has already passed qualification
    const userStatus = await db.oneOrNone(
      `SELECT has_passed_qualification, last_qualification_attempt 
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (userStatus?.has_passed_qualification) {
      throw new ForbiddenError('You have already passed the qualification round');
    }

    // Check if there's an active qualification round
    const activeRound = await db.oneOrNone(
      `SELECT id FROM seasons 
       WHERE is_qualification_round = true 
       AND is_active = true 
       AND start_date <= NOW() 
       AND end_date >= NOW()
       LIMIT 1`
    );

    if (!activeRound) {
      throw new NotFoundError('No active qualification round available');
    }

    next();
  } catch (error) {
    next(error);
  }
};
