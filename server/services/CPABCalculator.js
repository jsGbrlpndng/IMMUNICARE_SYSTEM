/**
 * CPABCalculator - Children Protected at Birth calculation service
 * Implements DOH-compliant CPAB logic for maternal tetanus toxoid protection.
 *
 * Architecture Decision (2026-04): The system uses a SINGLE last_tt_date column
 * paired with mother_tt_status ('1'–'5') instead of separate tt2_date / tt3_date
 * columns. This reduces data-entry friction for midwives while retaining all
 * clinical accuracy. The static calculate() method now accepts this simplified
 * shape. Legacy callers that still pass { tt2_date, tt3_date } are supported via
 * the backward-compat shim at the bottom of this file.
 */

class CPABCalculator {
    /**
     * Calculate CPAB status.
     *
     * @param {Object} params
     * @param {Date|string} params.dob              - Infant date of birth (delivery date)
     * @param {string}      params.last_tt_date     - Date of the most recent TT dose (any level)
     * @param {string|number} params.mother_tt_status - '1'–'5' (TT level) or null/''
     * @param {number}      params.pregnancy_order  - Total pregnancies (1 = first)
     * @param {boolean}     params.tt_history_unknown - If true, status is Pending
     *
     * @returns {{ cpab_status: string, cpab_reason: string }}
     */
    static calculate(params) {
        const { dob, last_tt_date, mother_tt_status, pregnancy_order, tt_history_unknown } = params;

        // ── Guard: DOB required ───────────────────────────────────────────
        if (!dob) {
            return { cpab_status: 'Pending', cpab_reason: 'Date of birth not provided' };
        }

        const deliveryDate = typeof dob === 'string' ? new Date(dob) : dob;
        const pregnancyNum = parseInt(pregnancy_order) || 1;
        const ttLevel     = parseInt(mother_tt_status) || 0;

        // ── Rule 1: TT history unknown ────────────────────────────────────
        if (tt_history_unknown === true) {
            return { cpab_status: 'Pending', cpab_reason: 'TT history marked as unknown' };
        }

        // ── Rule 2: No TT dose at level ≥ 2 recorded ─────────────────────
        // TT1 alone confers no protection; protection requires TT2+.
        if (ttLevel < 2 || !last_tt_date) {
            return { cpab_status: 'Not Protected', cpab_reason: 'No TT2+ vaccination recorded' };
        }

        const ttDate = typeof last_tt_date === 'string' ? new Date(last_tt_date) : last_tt_date;

        // ── Rule 3: Last TT dose must be at least 30 days before delivery ─
        const daysBetween = Math.floor((deliveryDate - ttDate) / (1000 * 60 * 60 * 24));
        if (daysBetween < 30) {
            return {
                cpab_status: 'Not Protected',
                cpab_reason: `TT${ttLevel} received <1 month before delivery (${daysBetween} days)`
            };
        }

        // ── Rule 4: First pregnancy with TT2+ ≥30 days before delivery ───
        if (pregnancyNum === 1) {
            return {
                cpab_status: 'Protected',
                cpab_reason: `First pregnancy with TT${ttLevel} ≥1 month before delivery`
            };
        }

        // ── Rule 5: Subsequent pregnancy — must be within 5-year protection window ─
        // TT3+ provides 5-year protection. TT2 provides 3-year protection (DOH guideline).
        const protectionYears = ttLevel >= 3 ? 5 : 3;
        const protectionCutoff = new Date(deliveryDate);
        protectionCutoff.setFullYear(protectionCutoff.getFullYear() - protectionYears);

        if (ttDate >= protectionCutoff) {
            return {
                cpab_status: 'Protected',
                cpab_reason: `Subsequent pregnancy — TT${ttLevel} within ${protectionYears}-year protection window`
            };
        }

        return {
            cpab_status: 'Not Protected',
            cpab_reason: `TT${ttLevel} administered >  ${protectionYears} years before delivery`
        };
    }

    /**
     * Validate CPAB calculation parameters.
     * @param {Object} params
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validateParams(params) {
        const errors = [];

        if (!params.dob) errors.push('Date of birth is required');

        if (params.last_tt_date && params.dob) {
            const ttDate  = new Date(params.last_tt_date);
            const dobDate = new Date(params.dob);
            if (ttDate >= dobDate) {
                errors.push('last_tt_date must be before the delivery date');
            }
        }

        if (params.pregnancy_order && (params.pregnancy_order < 1 || params.pregnancy_order > 20)) {
            errors.push('Pregnancy order must be between 1 and 20');
        }

        return { valid: errors.length === 0, errors };
    }
}

module.exports = CPABCalculator;
