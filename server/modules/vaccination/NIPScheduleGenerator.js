/**
 * NIPScheduleGenerator - National Immunization Program schedule calculation service
 * Calculates next vaccination schedule based on infant age and birth dose status
 * 
 * Used by both client (real-time display) and server (persistence)
 * Applies identical schedule logic regardless of user role
 */

class NIPScheduleGenerator {
    /**
     * Calculate next vaccination schedule
     * 
     * @param {Object} params - Schedule calculation parameters
     * @param {Date|string} params.dob - Date of birth
     * @param {boolean} params.bcg_given - Whether BCG was given at birth
     * @param {boolean} params.hepatitis_b_given - Whether Hepatitis B was given at birth
     * @returns {Object} - { next_due_vaccine: string, next_due_date: string }
     */
    static calculateNext(params) {
        const { dob, bcg_given, hepatitis_b_given } = params;

        // Validate required parameters
        if (!dob) {
            return {
                next_due_vaccine: 'Date of birth required',
                next_due_date: ''
            };
        }

        // Convert date to Date object if it's a string
        const birthDate = typeof dob === 'string' ? new Date(dob) : dob;
        const today = new Date();
        
        // Calculate age in days
        const ageInDays = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24));

        // Priority 1: BCG (due at birth, valid up to 28 days)
        if (ageInDays <= 28 && !bcg_given) {
            return {
                next_due_vaccine: 'BCG (due at birth, valid up to 28 days)',
                next_due_date: this.formatDate(birthDate)
            };
        }

        // Priority 2: Hepatitis B Birth Dose (within 24 hours preferred, up to 5 days)
        if (ageInDays <= 5 && !hepatitis_b_given) {
            return {
                next_due_vaccine: 'Hepatitis B Birth Dose (within 24 hours preferred)',
                next_due_date: this.formatDate(birthDate)
            };
        }

        // Priority 3: Six-week vaccines (at 42 days / 6 weeks)
        const sixWeekDate = new Date(birthDate);
        sixWeekDate.setDate(sixWeekDate.getDate() + 42);

        if (ageInDays >= 42) {
            return {
                next_due_vaccine: 'Pentavalent 1, OPV 1, IPV 1, PCV 1',
                next_due_date: this.formatDate(sixWeekDate)
            };
        } else {
            // Infant is not yet 6 weeks old
            return {
                next_due_vaccine: 'Upcoming: Pentavalent 1, OPV 1, IPV 1, PCV 1',
                next_due_date: this.formatDate(sixWeekDate)
            };
        }
    }

    /**
     * Format date for display
     * @param {Date} date - Date to format
     * @returns {string} - Formatted date string
     */
    static formatDate(date) {
        if (!date) return '';
        
        // Return ISO date format for database storage
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    /**
     * Format date for display (user-friendly format)
     * @param {Date} date - Date to format
     * @returns {string} - Formatted date string (e.g., "Jan 15, 2024")
     */
    static formatDateDisplay(date) {
        if (!date) return '';
        
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    /**
     * Calculate full NIP schedule for an infant
     * Returns all scheduled vaccinations with dates
     * 
     * @param {Date|string} dob - Date of birth
     * @returns {Array} - Array of vaccination schedule objects
     */
    static calculateFullSchedule(dob) {
        if (!dob) return [];

        const birthDate = typeof dob === 'string' ? new Date(dob) : dob;
        const schedule = [];

        // Birth doses
        schedule.push({
            vaccine: 'BCG',
            age_description: 'At birth (up to 28 days)',
            due_date: this.formatDate(birthDate),
            age_in_days: 0
        });

        schedule.push({
            vaccine: 'Hepatitis B Birth Dose',
            age_description: 'Within 24 hours (up to 5 days)',
            due_date: this.formatDate(birthDate),
            age_in_days: 0
        });

        // 6 weeks (42 days)
        const sixWeeks = new Date(birthDate);
        sixWeeks.setDate(sixWeeks.getDate() + 42);
        schedule.push({
            vaccine: 'Pentavalent 1, OPV 1, IPV 1, PCV 1',
            age_description: '6 weeks',
            due_date: this.formatDate(sixWeeks),
            age_in_days: 42
        });

        // 10 weeks (70 days)
        const tenWeeks = new Date(birthDate);
        tenWeeks.setDate(tenWeeks.getDate() + 70);
        schedule.push({
            vaccine: 'Pentavalent 2, OPV 2, PCV 2',
            age_description: '10 weeks',
            due_date: this.formatDate(tenWeeks),
            age_in_days: 70
        });

        // 14 weeks (98 days)
        const fourteenWeeks = new Date(birthDate);
        fourteenWeeks.setDate(fourteenWeeks.getDate() + 98);
        schedule.push({
            vaccine: 'Pentavalent 3, OPV 3, IPV 2, PCV 3',
            age_description: '14 weeks',
            due_date: this.formatDate(fourteenWeeks),
            age_in_days: 98
        });

        // 9 months (270 days)
        const nineMonths = new Date(birthDate);
        nineMonths.setDate(nineMonths.getDate() + 270);
        schedule.push({
            vaccine: 'Measles-Mumps-Rubella 1',
            age_description: '9 months',
            due_date: this.formatDate(nineMonths),
            age_in_days: 270
        });

        // 12 months (365 days)
        const twelveMonths = new Date(birthDate);
        twelveMonths.setDate(twelveMonths.getDate() + 365);
        schedule.push({
            vaccine: 'Measles-Mumps-Rubella 2',
            age_description: '12 months',
            due_date: this.formatDate(twelveMonths),
            age_in_days: 365
        });

        return schedule;
    }

    /**
     * Validate schedule calculation parameters
     * @param {Object} params - Parameters to validate
     * @returns {Object} - { valid: boolean, errors: string[] }
     */
    static validateParams(params) {
        const errors = [];

        if (!params.dob) {
            errors.push('Date of birth is required');
        }

        if (params.dob) {
            const dobDate = new Date(params.dob);
            const today = new Date();
            
            if (dobDate > today) {
                errors.push('Date of birth cannot be in the future');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = NIPScheduleGenerator;
