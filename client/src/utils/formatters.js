/**
 * Common formatting utilities for ImmuniCare
 */

/**
 * Format a date string to a localized medium date style
 * @param {string|Date} date 
 * @returns {string}
 */
export const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(undefined, { dateStyle: 'medium' });
};

/**
 * Get the age in months and weeks for display
 * @param {number} ageInMonths 
 * @param {number} ageInWeeks 
 * @returns {string}
 */
export const formatAge = (ageInMonths, ageInWeeks) => {
    return `${ageInMonths || 0} months (${ageInWeeks || 0} weeks)`;
};

/**
 * Get timing status for a dose
 * @param {string|Date} recommendedDate 
 * @param {string} vaccinationStatus 
 * @returns {string}
 */
export const getDoseTimingStatus = (recommendedDate, vaccinationStatus) => {
    if (vaccinationStatus === 'COMPLETED_VALIDATED') return 'COMPLETED_VALIDATED';
    if (!recommendedDate) return 'DUE_TODAY_OR_OVERDUE';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const recDate = new Date(recommendedDate);
    recDate.setHours(0, 0, 0, 0);

    return today < recDate ? 'NOT_DUE_YET' : 'DUE_TODAY_OR_OVERDUE';
};
