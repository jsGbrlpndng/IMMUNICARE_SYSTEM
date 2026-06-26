/**
 * Centralized API Client with automatic authentication
 * Handles token injection, 401 redirects, and error handling
 */

const API_BASE_URL = '/api';

class ApiClient {
    /**
     * Get stored auth token
     */
    getToken() {
        return localStorage.getItem('auth_token');
    }

    /**
     * Get stored user data
     */
    getUser() {
        const userData = localStorage.getItem('user');
        return userData ? JSON.parse(userData) : null;
    }

    /**
     * Clear auth data and redirect to login
     */
    handleUnauthorized() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        localStorage.removeItem('session_policy');
        sessionStorage.removeItem('immunicare_idle_locked');
        sessionStorage.removeItem('immunicare_reauth_in_progress');
        
        // Only redirect if not already on login/portal pages
        if (!window.location.pathname.includes('/portal') && 
            !window.location.pathname.includes('/login') &&
            !window.location.pathname.includes('/password-update-success') &&
            window.location.pathname !== '/') {
            window.location.href = '/portal';
        }
    }

    isSessionLockedOrReauthenticating() {
        return (
            sessionStorage.getItem('immunicare_idle_locked') === 'true' ||
            sessionStorage.getItem('immunicare_reauth_in_progress') === 'true'
        );
    }

    buildApiError(message, response, payload = {}) {
        const error = new Error(message);
        error.status = response?.status;
        error.code = payload?.code;
        error.payload = payload;
        return error;
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        if (localStorage.getItem('auth_token') && this.isSessionLockedOrReauthenticating()) {
            window.dispatchEvent(new Event('immunicare:idle-lock'));
            throw new Error('Session locked. Please re-authenticate to continue.');
        }

        const token = this.getToken();
        // Build headers
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Attach token if available
        if (token) {
            headers['x-auth-token'] = token;
        }

        // Build full URL
        let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

        // Super Admin can request a barangay context explicitly from the UI.
        // Barangay-scoped users are enforced on the backend and should not drive
        // scope by browser session state.
        const user = this.getUser();
        if (user?.assigned_barangay && !headers['x-admin-barangay']) {
            headers['x-admin-barangay'] = user.assigned_barangay;
        }
        if (user?.barangay_id && !headers['x-admin-barangay-id']) {
            headers['x-admin-barangay-id'] = String(user.barangay_id);
        }

        const contextBarangay = sessionStorage.getItem('selected_barangay');
        if (user?.role === 'Super Admin' && contextBarangay && contextBarangay !== 'all' && !/[?&]barangay=/.test(url)) {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}barangay=${encodeURIComponent(contextBarangay)}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            // Handle 401 Unauthorized
            if (response.status === 401) {
                const payload = await response.json().catch(() => ({}));
                const code = payload?.code;
                const hardExpiryCodes = new Set(['REAUTH_EXPIRED', 'SESSION_EXPIRED', 'SESSION_INVALIDATED']);
                const shouldPreserveLockedSession = this.isSessionLockedOrReauthenticating() && !hardExpiryCodes.has(code);

                if (!shouldPreserveLockedSession) {
                    this.handleUnauthorized();
                    throw this.buildApiError(payload.error || 'Unauthorized - redirecting to login', response, payload);
                }

                throw this.buildApiError(payload.error || 'Session locked. Please re-authenticate to continue.', response, payload);
            }

            // Handle 403 Forbidden
            if (response.status === 403) {
                const data = await response.json();
                if (data.code === 'PASSWORD_UPDATE_REQUIRED') {
                    if (!window.location.pathname.includes('/force-password-change')) {
                        window.location.href = '/force-password-change';
                    }
                }
                throw new Error(data.message || data.details || data.error || 'Access forbidden');
            }

            // Return response for caller to handle
            return response;

        } catch (error) {
            // Network errors or other issues
            if (error.status === 401) {
                throw error;
            }
            if (error.name === 'AbortError') {
                throw error;
            }
            
            console.error('API Request Error:', error);
            throw error;
        }
    }

    /**
     * GET request
     */
    async get(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'GET',
        });
    }

    /**
     * POST request
     */
    async post(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    /**
     * PUT request
     */
    async put(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE',
        });
    }

    /**
     * PATCH request
     */
    async patch(endpoint, data, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }
}

// Export singleton instance
const apiClient = new ApiClient();
export default apiClient;
