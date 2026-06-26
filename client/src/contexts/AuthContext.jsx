import React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();
const SESSION_POLICY_STORAGE_KEY = 'session_policy';

const normalizeAuthUser = (userData) => {
    if (!userData || typeof userData !== 'object') return null;
    const fullName = userData.full_name || userData.name || null;
    return {
        ...userData,
        full_name: fullName,
        name: userData.name || fullName
    };
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [sessionPolicy, setSessionPolicy] = useState(() => {
        try {
            const savedPolicy = localStorage.getItem(SESSION_POLICY_STORAGE_KEY);
            return savedPolicy ? JSON.parse(savedPolicy) : null;
        } catch (_) {
            localStorage.removeItem(SESSION_POLICY_STORAGE_KEY);
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing session in localStorage
        const savedUser = localStorage.getItem('user');
        const savedToken = localStorage.getItem('auth_token');
        
        if (savedUser && savedToken) {
            try {
                const userData = JSON.parse(savedUser);
                setUser(normalizeAuthUser(userData));
            } catch (error) {
                console.error('Failed to parse user data:', error);
                // Clear corrupted data
                localStorage.removeItem('user');
                localStorage.removeItem('auth_token');
                localStorage.removeItem(SESSION_POLICY_STORAGE_KEY);
            }
        }
        setLoading(false);
    }, []);

    const login = useCallback((userData, authToken, nextSessionPolicy = null) => {
        const normalizedUser = normalizeAuthUser(userData);
        setUser(normalizedUser);
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        localStorage.setItem('auth_token', authToken);
        if (nextSessionPolicy) {
            setSessionPolicy(nextSessionPolicy);
            localStorage.setItem(SESSION_POLICY_STORAGE_KEY, JSON.stringify(nextSessionPolicy));
        }
        sessionStorage.removeItem('immunicare_idle_locked');
        sessionStorage.removeItem('immunicare_reauth_in_progress');
    }, []);

    const updateSessionPolicy = useCallback((nextSessionPolicy) => {
        if (!nextSessionPolicy) return;
        setSessionPolicy(nextSessionPolicy);
        localStorage.setItem(SESSION_POLICY_STORAGE_KEY, JSON.stringify(nextSessionPolicy));
    }, []);

    const clearAuthSession = ({ updateState = true } = {}) => {
        if (updateState) {
            setUser(null);
        }
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
        localStorage.removeItem(SESSION_POLICY_STORAGE_KEY);
        sessionStorage.removeItem('immunicare_idle_locked');
        sessionStorage.removeItem('immunicare_reauth_in_progress');
    };

    const logout = () => {
        clearAuthSession();
    };

    const auditLogout = () => {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ reason: 'USER_INITIATED' }),
            keepalive: true
        }).catch((error) => {
            console.warn('[AUTH_LOGOUT_AUDIT_FAILED]', error);
        });
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, auditLogout, clearAuthSession, loading, sessionPolicy, updateSessionPolicy }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
