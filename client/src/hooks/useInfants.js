import { useState, useEffect } from 'react';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to fetch all infants and calculate core metrics
 */
export const useInfants = () => {
    const { user } = useAuth();
    const [infants, setInfants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchInfants = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const response = await apiClient.get('/infants');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success && data.infants) {
                setInfants(data.infants);
            } else {
                setInfants([]);
            }
        } catch (err) {
            console.error('Error fetching infants:', err);
            setError(err.message);
            setInfants([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInfants();
    }, [user]);

    return { infants, loading, error, refresh: fetchInfants };
};
