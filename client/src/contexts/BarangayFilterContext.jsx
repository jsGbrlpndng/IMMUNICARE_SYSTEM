import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const BarangayFilterContext = createContext();

export const useBarangayFilter = () => {
    const context = useContext(BarangayFilterContext);
    if (!context) {
        throw new Error('useBarangayFilter must be used within a BarangayFilterProvider');
    }
    return context;
};

export const BarangayFilterProvider = ({ children }) => {
    const { user } = useAuth();
    // Initialize from sessionStorage or 'all'
    const [selectedBarangay, _setSelectedBarangay] = useState(() => {
        return sessionStorage.getItem('selected_barangay') || 'all';
    });

    const setSelectedBarangay = (val) => {
        _setSelectedBarangay(val);
        sessionStorage.setItem('selected_barangay', val);
    };

    // Reset to 'all' if user changes or if they are not Super Admin
    useEffect(() => {
        if (user && user.role !== 'Super Admin') {
            setSelectedBarangay(user.assigned_barangay || 'all');
        } else if (!user) {
            setSelectedBarangay('all');
        }
    }, [user]);

    const value = {
        selectedBarangay,
        setSelectedBarangay,
        isAll: selectedBarangay === 'all'
    };

    return (
        <BarangayFilterContext.Provider value={value}>
            {children}
        </BarangayFilterContext.Provider>
    );
};
