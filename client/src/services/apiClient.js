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
        
        // Only redirect if not already on login/portal pages
        if (!window.location.pathname.includes('/portal') && 
            !window.location.pathname.includes('/login') &&
            window.location.pathname !== '/') {
            window.location.href = '/portal';
        }
    }

    /**
     * Make authenticated API request
     */
    async request(endpoint, options = {}) {
        const token = this.getToken();
        const user = this.getUser();
        
        // Build headers
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Attach token if available
        if (token) {
            headers['x-auth-token'] = token;
        }

        // Attach user ID if available (required by backend middleware)
        if (user && user.id) {
            headers['x-user-id'] = user.id;
        }

        // Attach user role if available (required by backend middleware)
        if (user && user.role) {
            headers['x-user-role'] = user.role;
        }

        // Build full URL
        let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

        // Inject Multi-Tenancy context (barangay) for Super Admin global filtering
        const contextBarangay = sessionStorage.getItem('selected_barangay');
        if (contextBarangay) {
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
                this.handleUnauthorized();
                throw new Error('Unauthorized - redirecting to login');
            }

            // Handle 403 Forbidden
            if (response.status === 403) {
                const data = await response.json();
                throw new Error(data.error || 'Access forbidden');
            }

            // Return response for caller to handle
            return response;

        } catch (error) {
            // Network errors or other issues
            if (error.message === 'Unauthorized - redirecting to login') {
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
