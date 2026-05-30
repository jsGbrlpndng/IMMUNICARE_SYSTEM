import React from 'react';
import { Navigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SecurityProfileForm, { getDefaultRouteForRole } from '../components/SecurityProfileForm';

const ForcePasswordChange = () => {
    const { user, loading } = useAuth();

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
            <div className="mx-auto mb-8 flex max-w-xl items-center gap-3">
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

            <SecurityProfileForm
                forced
                title="Change Your Temporary Password"
                subtitle="For data privacy compliance, temporary credentials must be replaced before you can access the clinical system."
            />
        </div>
    );
};

export default ForcePasswordChange;
