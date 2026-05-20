/**
 * Clinical calculation utilities for ImmuniCare
 */

/**
 * Calculate if an infant is Child Protected At Birth (CPAB)
 * Logic based on DOH SRS rules.
 * 
 * @param {Object} infant 
 * @returns {boolean}
 */
export const calculateCPAB = (infant) => {
    // If already calculated by backend, trust it
    if (infant.cpab_status === 'Protected') return true;

    // Fallback: Client-side recalculation using SRS rules
    const dob = new Date(infant.dob);
    const tt2 = infant.tt2_date ? new Date(infant.tt2_date) : null;
    const tt3 = infant.tt3_date ? new Date(infant.tt3_date) : null;
    const pregnancyNum = parseInt(infant.pregnancy_order) || 1;

    if (!tt2 || isNaN(tt2.getTime())) return false;

    const daysBetween = Math.floor((dob - tt2) / (1000 * 60 * 60 * 24));
    if (daysBetween < 30) return false; // Must be >= 1 month before delivery

    if (pregnancyNum === 1) return true; // First pregnancy with TT2 suffices

    // Subsequent pregnancies: Check TT3 or recent TT (within 5 years)
    const fiveYearsAgo = new Date(dob);
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const recentTT = (tt3 && !isNaN(tt3.getTime()) && tt3 >= fiveYearsAgo) ||
        (tt2 >= fiveYearsAgo);
    return !!recentTT;
};

/**
 * Calculate summary metrics for a list of infants
 * 
 * @param {Array} infants 
 * @returns {Object}
 */
export const calculateDashboardMetrics = (infants) => {
    const totalRegistered = infants.length;
    if (totalRegistered === 0) {
        return {
            totalRegistered: 0,
            fullyImmunizedCount: 0,
            fullyImmunizedPercentage: 0,
            zeroDoseCount: 0,
            underImmunizedCount: 0,
            cpabCount: 0,
            cpabPercentage: 0
        };
    }

    const fullyImmunizedCount = infants.filter(infant => infant.bcg_given && infant.hepatitis_b_given).length;
    const zeroDoseCount = infants.filter(infant => !infant.bcg_given && !infant.hepatitis_b_given).length;
    const underImmunizedCount = infants.filter(infant =>
        (infant.bcg_given && !infant.hepatitis_b_given) || (!infant.bcg_given && infant.hepatitis_b_given)
    ).length;

    const cpabCount = infants.filter(calculateCPAB).length;

    return {
        totalRegistered,
        fullyImmunizedCount,
        fullyImmunizedPercentage: Math.round((fullyImmunizedCount / totalRegistered) * 100),
        zeroDoseCount,
        underImmunizedCount,
        cpabCount,
        cpabPercentage: Math.round((cpabCount / totalRegistered) * 100)
    };
};
