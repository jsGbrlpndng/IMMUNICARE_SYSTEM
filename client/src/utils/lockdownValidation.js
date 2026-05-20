/**
 * Unified Clinical Validation Rules for IMMUNICARE Lockdown
 * PILLARS: Temporal, Spatial, Communication, Biological
 */

export const NAME_REGEX = /[^a-zA-Z\s\-ñÑ.']/; // Reject if match
export const PHONE_REGEX = /^(09|\+639)\d{9}$/;
export const CATCHMENT_BARANGAYS = ['BAGONG SILANG', 'CALENDOLA', 'ESTRELLA', 'GSIS', 'LANGGAM', 'LARAM', 'MAGSAYSAY', 'NARRA', 'RIVERSIDE', 'SAMPAGUITA', 'UB', 'UBL'];

export const validateInfant = (infant) => {
    const errors = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Identity (PILLAR 4)
    if (!infant.first_name || NAME_REGEX.test(infant.first_name)) errors.push("Invalid First Name (use only letters and . - ' )");
    if (!infant.last_name || NAME_REGEX.test(infant.last_name)) errors.push("Invalid Last Name (use only letters and . - ' )");
    if (infant.middle_name && NAME_REGEX.test(infant.middle_name)) errors.push("Invalid Middle Name");

    // 2. Temporal (PILLAR 1)
    if (!infant.dob) {
        errors.push("Missing Date of Birth");
    } else {
        const dobDate = new Date(infant.dob);
        dobDate.setHours(0, 0, 0, 0);
        if (dobDate > today) errors.push("Future DOB detected (Temporal Violation)");
    }

    // 3. Biological (PILLAR 4)
    if (infant.birth_weight) {
        const weight = parseFloat(infant.birth_weight);
        if (weight < 0.5 || weight > 8.0) errors.push(`Birth Weight (${weight}kg) outside clinical range [0.5-8.0kg]`);
    }

    // 4. Communication (PILLAR 3)
    if (!infant.caregiver_phone || !PHONE_REGEX.test(infant.caregiver_phone)) {
        errors.push("Invalid PH Mobile Format (Must be 09XXXXXXXXX or +639XXXXXXXXX)");
    }

    // 5. Spatial (PILLAR 2)
    if (!infant.barangay || !CATCHMENT_BARANGAYS.includes(String(infant.barangay).toUpperCase())) {
        errors.push(`Spatial Violation: ${infant.barangay || 'Unknown'} is outside Catchment Area`);
    }
    
    // Purok is only mandatory if geolocation (lat/lng) is missing
    const hasGeo = infant.latitude && infant.longitude;
    if (!infant.purok && !hasGeo) {
        errors.push("Missing address detail: Please provide a Purok name or pin the location on the map.");
    }

    // 6. Maternal TT Logic (PILLAR 1)
    if (infant.last_tt_date && infant.dob) {
        const ttDate = new Date(infant.last_tt_date);
        ttDate.setHours(0, 0, 0, 0);
        const dobDate = new Date(infant.dob);
        dobDate.setHours(0, 0, 0, 0);
        if (ttDate > today) errors.push("Maternal TT Date cannot be in the future");
        if (ttDate >= dobDate) errors.push("Maternal TT Date must be prior to delivery");
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};
