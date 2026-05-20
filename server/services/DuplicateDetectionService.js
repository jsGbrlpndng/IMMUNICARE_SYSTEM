/**
 * DuplicateDetectionService.js
 * 
 * Provides server-side logic to identify potential duplicate infant records
 * to prevent data contamination in the master registry.
 */

'use strict';

class DuplicateDetectionService {
    /**
     * @param {import('pg').Pool} db
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Checks for potential duplicates based on multiple heuristic levels.
     * 
     * @param {object} data - Infant data from form
     * @returns {Promise<Array>} - List of potential matches
     */
    async findPotentialDuplicates(data) {
        const {
            first_name,
            last_name,
            dob,
            mothers_maiden_name,
            caregiver_phone,
            reference_id
        } = data;

        const potentialMatches = [];

        try {
            // Level 1: Strict Identity (First Name + Last Name + DOB)
            const [strictMatches] = await this.db.query(`
                SELECT id, reference_id, first_name, last_name, dob, registration_status
                FROM infants
                WHERE LOWER(first_name) = LOWER($1)
                  AND LOWER(last_name) = LOWER($2)
                  AND dob = $3
                  AND registration_status != 'REJECTED'
            `, [first_name, last_name, dob]);

            if (strictMatches.length > 0) {
                strictMatches.forEach(m => potentialMatches.push({ ...m, match_type: 'Strict (Name + DOB)' }));
            }

            // Level 2: Fuzzy (Mother Name + DOB)
            if (mothers_maiden_name) {
                const [motherMatches] = await this.db.query(`
                    SELECT id, reference_id, first_name, last_name, dob, registration_status
                    FROM infants
                    WHERE LOWER(mothers_maiden_name) = LOWER($1)
                      AND dob = $2
                      AND id NOT IN (SELECT id FROM (SELECT unnest($3::text[]) as id) s)
                      AND registration_status != 'REJECTED'
                `, [mothers_maiden_name, dob, potentialMatches.map(m => m.id)]);

                if (motherMatches.length > 0) {
                    motherMatches.forEach(m => potentialMatches.push({ ...m, match_type: 'Fuzzy (Mother + DOB)' }));
                }
            }

            // Level 3: Contact (Phone + DOB)
            if (caregiver_phone) {
                const [phoneMatches] = await this.db.query(`
                    SELECT id, reference_id, first_name, last_name, dob, registration_status
                    FROM infants
                    WHERE caregiver_phone = $1
                      AND dob = $2
                      AND id NOT IN (SELECT id FROM (SELECT unnest($3::text[]) as id) s)
                      AND registration_status != 'REJECTED'
                `, [caregiver_phone, dob, potentialMatches.map(m => m.id)]);

                if (phoneMatches.length > 0) {
                    phoneMatches.forEach(m => potentialMatches.push({ ...m, match_type: 'Identity (Phone + DOB)' }));
                }
            }

            return potentialMatches;
        } catch (error) {
            console.error('DuplicateDetectionService Error:', error);
            return [];
        }
    }
}

module.exports = DuplicateDetectionService;
