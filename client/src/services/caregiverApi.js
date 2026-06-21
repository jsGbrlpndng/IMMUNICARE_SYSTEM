const API_BASE_URL = '/api/caregiver';
const CAREGIVER_TOKEN_KEY = 'caregiver_auth_token';
const CAREGIVER_SESSION_KEY = 'caregiver_session';

const parseJson = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || data.message || 'Caregiver request failed');
    }
    return data;
};

const caregiverApi = {
    getToken() {
        return localStorage.getItem(CAREGIVER_TOKEN_KEY);
    },

    getSession() {
        const raw = localStorage.getItem(CAREGIVER_SESSION_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            localStorage.removeItem(CAREGIVER_SESSION_KEY);
            return null;
        }
    },

    setSession(token, caregiver) {
        localStorage.setItem(CAREGIVER_TOKEN_KEY, token);
        localStorage.setItem(CAREGIVER_SESSION_KEY, JSON.stringify(caregiver));
    },

    clearSession() {
        localStorage.removeItem(CAREGIVER_TOKEN_KEY);
        localStorage.removeItem(CAREGIVER_SESSION_KEY);
    },

    async requestOtp(referenceNumber) {
        const response = await fetch(`${API_BASE_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference_number: referenceNumber })
        });
        return parseJson(response);
    },

    async verifyOtp(referenceNumber, otp) {
        const response = await fetch(`${API_BASE_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference_number: referenceNumber, otp })
        });
        return parseJson(response);
    },

    async me() {
        const response = await fetch(`${API_BASE_URL}/me`, {
            headers: { 'x-auth-token': this.getToken() || '' }
        });
        return parseJson(response);
    },

    async getCard(infantId) {
        const response = await fetch(`${API_BASE_URL}/infants/${encodeURIComponent(infantId)}/card`, {
            headers: { 'x-auth-token': this.getToken() || '' }
        });
        return parseJson(response);
    }
};

export default caregiverApi;
