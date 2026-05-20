import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

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
                setUser(userData);
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
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('auth_token', authToken);
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
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
