/**
 * Timezone utility functions for handling date/time conversions
 */

/**
 * Convert a date to organization's timezone
 * @param {Date} date - The date to convert
 * @param {string} timezone - Target timezone (e.g., 'America/New_York', 'Asia/Kolkata')
 * @returns {Date} - Date adjusted to the target timezone
 */
export const convertToTimezone = (date, timezone = 'UTC') => {
  if (!date) return null;
  
  try {
    // Create a new date in the target timezone
    const utcDate = new Date(date.toISOString());
    
    // Get the timezone offset for the target timezone
    const targetDate = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone }));
    const utcDateString = new Date(utcDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    
    // Calculate the offset difference
    const offset = targetDate.getTime() - utcDateString.getTime();
    
    // Apply the offset to get the correct local time
    return new Date(utcDate.getTime() + offset);
  } catch (error) {
    console.warn(`Invalid timezone: ${timezone}, falling back to UTC`);
    return new Date(date);
  }
};

/**
 * Convert a date from organization's timezone to UTC
 * @param {Date} date - The date to convert
 * @param {string} timezone - Source timezone
 * @returns {Date} - Date in UTC
 */
export const convertFromTimezone = (date, timezone = 'UTC') => {
  if (!date) return null;
  
  try {
    // If timezone is UTC, return as is
    if (timezone === 'UTC') {
      return new Date(date);
    }
    
    // Create date string in the source timezone
    const dateString = date.toISOString().slice(0, 19); // Remove 'Z'
    const localDate = new Date(dateString);
    
    // Get what this time would be in UTC
    const utcEquivalent = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const timezoneEquivalent = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }));
    
    // Calculate offset and adjust
    const offset = timezoneEquivalent.getTime() - utcEquivalent.getTime();
    return new Date(localDate.getTime() - offset);
  } catch (error) {
    console.warn(`Invalid timezone: ${timezone}, treating as UTC`);
    return new Date(date);
  }
};

/**
 * Get current date/time in organization's timezone
 * @param {string} timezone - Target timezone
 * @returns {Date} - Current date in the target timezone
 */
export const getCurrentTimeInTimezone = (timezone = 'UTC') => {
  const now = new Date();
  return convertToTimezone(now, timezone);
};

/**
 * Create a date object for a specific time in the organization's timezone
 * @param {Date} baseDate - Base date
 * @param {string} timeString - Time in HH:MM format
 * @param {string} timezone - Target timezone
 * @returns {Date} - Date object with the specified time in the target timezone
 */
export const createTimeInTimezone = (baseDate, timeString, timezone = 'UTC') => {
  if (!baseDate || !timeString) return null;
  
  try {
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Create date in the target timezone
    const date = convertToTimezone(baseDate, timezone);
    date.setHours(hours, minutes, 0, 0);
    
    return date;
  } catch (error) {
    console.warn(`Error creating time in timezone: ${error.message}`);
    return null;
  }
};

/**
 * Format date for display in organization's timezone
 * @param {Date} date - Date to format
 * @param {string} timezone - Target timezone
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
export const formatDateInTimezone = (date, timezone = 'UTC', options = {}) => {
  if (!date) return '';
  
  try {
    const defaultOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    };
    
    return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(date);
  } catch (error) {
    console.warn(`Error formatting date in timezone: ${error.message}`);
    return date.toISOString();
  }
};

/**
 * Check if a timezone is valid
 * @param {string} timezone - Timezone to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidTimezone = (timezone) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get timezone offset in minutes for a specific timezone
 * @param {string} timezone - Target timezone
 * @param {Date} date - Date to get offset for (defaults to now)
 * @returns {number} - Offset in minutes
 */
export const getTimezoneOffset = (timezone = 'UTC', date = new Date()) => {
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
  } catch (error) {
    console.warn(`Error getting timezone offset: ${error.message}`);
    return 0;
  }
};