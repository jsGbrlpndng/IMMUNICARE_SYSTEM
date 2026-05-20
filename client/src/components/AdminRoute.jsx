import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const AdminRoute = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    // Check if user exists and token exists
    const token = localStorage.getItem('auth_token');
    
    if (!user || !token) {
        return <Navigate to="/portal" state={{ from: location }} replace />;
    }

    if (user.role !== 'Barangay Admin') {
        // Redirect non-admins to their appropriate dashboard
        const target = user.role === 'Super Admin' ? '/superadmin/dashboard' : '/clinical/dashboard';
        return <Navigate to={target} replace />;
    }

    return children;
};

export default AdminRoute;
