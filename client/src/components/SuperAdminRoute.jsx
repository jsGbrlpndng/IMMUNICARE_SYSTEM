import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SuperAdminRoute = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-800 rounded-full animate-spin"></div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Verifying Clearance...</p>
                </div>
            </div>
        );
    }

    if (!user || user.role !== 'Super Admin') {
        console.warn('[SECURITY] Unauthorized access attempt to Super Admin workspace by:', user?.id || 'Anonymous');
        return <Navigate to="/portal" replace />;
    }

    return children;
};

export default SuperAdminRoute;
