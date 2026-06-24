import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Activity, LogOut } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import SecurityProfileForm, { getDefaultRouteForRole } from '../../../components/SecurityProfileForm';

const ForcePasswordChange = () => {
    const navigate = useNavigate();
    const { user, loading, logout, auditLogout } = useAuth();

    const handleBackToLogin = () => {
        auditLogout?.();
        logout();
        navigate('/portal', { replace: true });
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-800" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/portal" replace />;
    }

    if (!user.must_change_password && !user.password_update_required) {
        return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
    }

    return (
        <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950">
            <div className="mx-auto mb-8 flex max-w-xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center bg-[#084C39] text-white shadow-sm">
                        <Activity className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="text-lg font-black leading-none">ImmuniCare</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-800">
                            Mandatory Credential Update
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:border-emerald-800 hover:text-emerald-900"
                >
                    <LogOut className="h-4 w-4" />
                    Sign in with another account
                </button>
            </div>

            <SecurityProfileForm
                forced
                title="Change Your Temporary Password"
                subtitle="For data privacy compliance, temporary credentials must be replaced before you can access the clinical system."
            />
        </div>
    );
};

export default ForcePasswordChange;
