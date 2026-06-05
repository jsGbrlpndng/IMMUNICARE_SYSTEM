import React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

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
            }
        }
        setLoading(false);
    }, []);

    const login = (userData, authToken) => {
        const normalizedUser = normalizeAuthUser(userData);
        setUser(normalizedUser);
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        localStorage.setItem('auth_token', authToken);
        sessionStorage.removeItem('immunicare_idle_locked');
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('immunicare_idle_locked');
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
        <AuthContext.Provider value={{ user, login, logout, auditLogout, loading }}>
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
