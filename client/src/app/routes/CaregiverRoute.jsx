import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import caregiverApi from '../../services/caregiverApi';

const CaregiverRoute = ({ children }) => {
    const location = useLocation();
    const [state, setState] = useState({
        loading: true,
        valid: false,
        session: null
    });

    useEffect(() => {
        let active = true;

        const verify = async () => {
            if (!caregiverApi.getToken()) {
                if (active) setState({ loading: false, valid: false, session: null });
                return;
            }

            try {
                const session = await caregiverApi.me();
                if (active) setState({ loading: false, valid: true, session });
            } catch (_) {
                caregiverApi.clearSession();
                if (active) setState({ loading: false, valid: false, session: null });
            }
        };

        verify();
        return () => {
            active = false;
        };
    }, []);

    if (state.loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-700 border-t-transparent" />
            </div>
        );
    }

    if (!state.valid) {
        return <Navigate to="/caregiver/login" state={{ from: location }} replace />;
    }

    return React.cloneElement(children, { caregiverSession: state.session });
};

export default CaregiverRoute;
