/**
 * Utility functions for date handling and validation
 */

/**
 * Validates and formats a date string to ensure it's in YYYY-MM-DD format
 * @param {string} dateString - The date string to validate and format
 * @returns {Object} Object containing the formatted date string and validation status
 */
export function validateAndFormatDate(dateString) {
  try {
    // Try to parse the date
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return {
        isValid: false,
        error: 'Invalid date format. Please use YYYY-MM-DD format.',
        formattedDate: null
      };
    }
    
    // Format date as ISO string without time component (YYYY-MM-DD)
    const formattedDate = date.toISOString().split('T')[0];
    
    return {
      isValid: true,
      formattedDate,
      error: null
    };
  } catch (error) {
    console.error('Date parsing error:', error);
    return {
      isValid: false,
      error: 'Invalid date format. Please use YYYY-MM-DD format.',
      formattedDate: null
    };
  }
}

/**
 * Validates that an end date is after a start date
 * @param {string} startDate - The start date string
 * @param {string} endDate - The end date string
 * @returns {Object} Object containing validation status
 */
export function validateDateRange(startDate, endDate) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
      return {
        isValid: false,
        error: 'End date must be after start date'
      };
    }
    
    return {
      isValid: true,
      error: null
    };
  } catch (error) {
    console.error('Date range validation error:', error);
    return {
      isValid: false,
      error: 'Error validating date range'
    };
  }
}
