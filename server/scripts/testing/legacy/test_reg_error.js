const axios = require('axios');

async function testRegistration() {
    try {
        const payload = {
            "first_name": "Test",
            "last_name": "Infant",
            "dob": "2026-04-20",
            "sex": "Male",
            "birth_weight": 4,
            "place_of_birth": "Health Facility",
            "barangay": "Langgam",
            "caregiver_phone": "09123456789",
            "pregnancy_order": 1,
            "birth_setting": "Health Facility",
            "tt_history_unknown": true,
            "bcg_given": false,
            "hepatitis_b_given": false,
            "opv_given": false,
            "registration_status": "VALIDATED"
        };

        const response = await axios.post('http://localhost:3000/api/infants', payload, {
            headers: {
                'x-user-role': 'Midwife' // Use Midwife to trigger validation block
            }
        });
        console.log('Success:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

testRegistration();
