import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-clinic-soft">
                <div className="w-12 h-12 border-4 border-clinic-teal border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) {
        // Redirect to landing page but save the attempted location
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    if ((user.must_change_password || user.password_update_required) && location.pathname !== '/force-password-change') {
        return <Navigate to="/force-password-change" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === 'BHW') {
            return <Navigate to="/bhw/dashboard" replace />;
        } else if (user.role === 'Admin') {
            return <Navigate to="/admin/dashboard" replace />;
        } else if (user.role === 'Super Admin') {
            return <Navigate to="/superadmin/dashboard" replace />;
        } else if (user.role === 'Midwife') {
            return <Navigate to="/clinical/dashboard" replace />;
        }
        return <Navigate to="/portal" replace />;
    }

    return children;
};

export default ProtectedRoute;
