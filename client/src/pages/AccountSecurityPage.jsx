import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserRound, Clock3 } from 'lucide-react';
import SecurityProfileForm from '../components/SecurityProfileForm';
import apiClient from '../services/apiClient';

const formatDateTime = (value) => {
    if (!value) return 'Not yet recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
};

const ProfileField = ({ label, value, highlight = false }) => (
    <div className="min-h-[56px] bg-white px-4 py-3">
        <div className="mb-1 text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</div>
        <div className={`break-words text-[12px] font-black leading-snug ${highlight ? 'text-emerald-800' : 'text-slate-900'}`}>
            {value || '--'}
        </div>
    </div>
);

const AccountSecurityPage = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const loadProfile = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await apiClient.get('/auth/profile');
                const payload = await response.json().catch(() => ({}));

                if (!cancelled) {
                    if (response.ok && payload?.success) {
                        setProfile(payload.profile || null);
                    } else {
                        setError(payload?.error || 'Unable to load account profile.');
                    }
                }
            } catch (requestError) {
                if (!cancelled) {
                    console.error('[ACCOUNT_PROFILE_LOAD_FAILED]', requestError);
                    setError('Unable to load account profile.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadProfile();
        return () => {
            cancelled = true;
        };
    }, []);

    const assignmentLabel = profile?.assigned_barangay || 'Not assigned';
    const emailLabel = profile?.email || 'Not on file';

    return (
        <div className="px-4 py-5 lg:px-6 lg:py-6">
            <div className="space-y-5">
                <section className="border border-slate-300 bg-white">
                    <div className="border-b border-slate-300 bg-slate-100 px-4 py-3">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 items-center justify-center bg-emerald-50 text-emerald-800">
                                <UserRound className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-800">Profile Overview</p>
                                <h1 className="mt-1 text-2xl font-black text-slate-950">Clinical Identity Card</h1>
                                <p className="mt-1 text-sm font-medium text-slate-500">Review your account identity, assignment, and audit metadata.</p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="px-4 py-6 text-sm font-bold text-slate-500">Loading profile...</div>
                    ) : (
                        <div className="space-y-0">
                            <div className="chart-grid chart-grid-double">
                                <ProfileField label="Full Name" value={profile?.full_name} />
                                <ProfileField label="Role" value={profile?.role} highlight />
                            </div>
                            <div className="chart-grid chart-grid-double border-t border-slate-300">
                                <ProfileField label="Barangay / Assignment" value={assignmentLabel} />
                                <ProfileField label="Email" value={emailLabel} />
                            </div>
                            <div className="chart-grid chart-grid-double border-t border-slate-300">
                                <ProfileField label="Creation Date" value={formatDateTime(profile?.created_at)} />
                                <ProfileField label="Created By" value={profile?.created_by_name || 'System / Legacy Seed'} />
                            </div>
                            <div className="chart-grid chart-grid-double border-t border-slate-300">
                                <ProfileField label="Last Modified" value={formatDateTime(profile?.updated_at)} />
                                <ProfileField label="Last Login" value={formatDateTime(profile?.last_login_at)} />
                            </div>
                        </div>
                    )}
                </section>

                <section className="border border-[#064E3B] bg-white">
                    <div className="border-b border-[#064E3B] bg-[#ECFDF5] px-4 py-3">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 items-center justify-center bg-white text-emerald-800 shadow-sm">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-800">Account Security</p>
                                <h2 className="mt-1 text-2xl font-black text-slate-950">Change Password</h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">Update your credentials in a separate secured section.</p>
                            </div>
                        </div>
                    </div>
                    <div className="px-0 py-0">
                        <SecurityProfileForm
                            title="Account Settings"
                            subtitle="Change your password by confirming your current credential first."
                            compact
                        />
                    </div>
                </section>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .chart-grid {
                    display: grid;
                    gap: 1px;
                    width: 100%;
                    max-width: 100%;
                    background: #cbd5e1;
                    padding: 1px;
                }
                .chart-grid-double { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                @media (max-width: 900px) {
                    .chart-grid-double { grid-template-columns: minmax(0, 1fr); }
                }
            `}} />
        </div>
    );
};

export default AccountSecurityPage;
