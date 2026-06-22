import React, { memo, useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import apiClient from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';

const passwordRequirements = [
    { label: 'At least 10 characters', test: (value) => value.length >= 10 },
    { label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
    { label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
    { label: 'One number', test: (value) => /[0-9]/.test(value) },
    { label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export const getDefaultRouteForRole = (role) => {
    if (role === 'Super Admin') return '/superadmin/dashboard';
    if (role === 'Admin') return '/admin/dashboard';
    if (role === 'BHW') return '/bhw/dashboard';
    if (role === 'Midwife') return '/clinical/dashboard';
    return '/portal';
};

const PasswordField = memo(({ id, label, value, visible, onToggle, onChange, autoComplete }) => (
    <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">{label}</span>
        <div className="mt-2 flex items-center border border-slate-300 bg-white">
            <input
                id={id}
                name={id}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(event) => onChange(id, event.target.value)}
                className="min-w-0 flex-1 px-3 py-3 text-sm font-semibold text-slate-900 outline-none"
                autoComplete={autoComplete}
            />
            <button
                type="button"
                onClick={onToggle}
                className="px-3 text-slate-500 hover:text-slate-900"
                aria-label={visible ? 'Hide password' : 'Show password'}
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    </label>
));

PasswordField.displayName = 'PasswordField';

export const PasswordSuccessInterstitial = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const successType = new URLSearchParams(location.search).get('type');
    const fallbackMessage = successType === 'set'
        ? 'Password set successfully. Please log in again.'
        : 'Password changed successfully. Please log in again.';
    const securityMessage = location.state?.securityMessage || fallbackMessage;

    const goToLogin = () => {
        navigate('/login', {
            replace: true,
            state: { securityMessage }
        });
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8 text-slate-950">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="password-success-title"
                aria-describedby="password-success-message"
                className="w-full max-w-md border border-emerald-900/20 bg-white shadow-xl"
            >
                <div className="border-b border-emerald-100 bg-[#ECFDF5] px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center bg-[#084C39] text-white shadow-sm">
                            <CheckCircle2 className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-800">
                                ImmuniCare Security
                            </p>
                            <h1 id="password-success-title" className="mt-1 text-2xl font-black text-slate-950">
                                Security Update Complete
                            </h1>
                        </div>
                    </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                    <p id="password-success-message" className="text-base font-black leading-relaxed text-slate-900">
                        {securityMessage}
                    </p>
                    <p className="text-sm font-semibold leading-relaxed text-slate-600">
                        For your protection, your previous session has been closed.
                    </p>
                    <button
                        type="button"
                        onClick={goToLogin}
                        className="inline-flex w-full items-center justify-center bg-[#084C39] px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#07362A] focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
                    >
                        Go to Login
                    </button>
                </div>
            </section>
        </main>
    );
};

const SecurityProfileForm = ({
    forced = false,
    onSuccess,
    title = 'Security Profile',
    subtitle = 'Update your account password.',
    compact = false
}) => {
    const { clearAuthSession, logout, auditLogout } = useAuth();
    const [form, setForm] = useState({
        current_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [show, setShow] = useState({
        current: false,
        next: false,
        confirm: false
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const failedRequirements = passwordRequirements.filter((rule) => !rule.test(form.new_password));
    const confirmationMismatch = Boolean(form.confirm_password && form.new_password !== form.confirm_password);

    const setField = useCallback((field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
        setError('');
        setSuccess('');
    }, []);

    const toggleVisibility = useCallback((field) => {
        setShow((current) => ({ ...current, [field]: !current[field] }));
    }, []);

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        if (!form.current_password || !form.new_password || !form.confirm_password) {
            setError('All password fields are required.');
            return;
        }

        if (failedRequirements.length > 0) {
            setError(`Password must include ${failedRequirements.map((rule) => rule.label.toLowerCase()).join(', ')}.`);
            return;
        }

        if (form.new_password !== form.confirm_password) {
            setError('New password and confirmation must match exactly.');
            return;
        }

        try {
            setSubmitting(true);
            const response = await apiClient.post('/auth/change-password', form);
            const payload = await response.json();

            if (!response.ok) {
                setError(payload?.error || 'Unable to change password.');
                return;
            }

            setForm({
                current_password: '',
                new_password: '',
                confirm_password: ''
            });
            const securityMessage = forced
                ? 'Password set successfully. Please log in again.'
                : 'Password changed successfully. Please log in again.';

            setSuccess(payload?.message || securityMessage);

            if (onSuccess) onSuccess(payload);
            auditLogout?.();
            if (clearAuthSession) {
                clearAuthSession({ updateState: false });
            } else {
                logout();
            }
            const successType = forced ? 'set' : 'changed';
            window.location.replace(`/password-update-success?type=${successType}`);
        } catch (requestError) {
            console.error('[SECURITY_PROFILE_CHANGE_PASSWORD]', requestError);
            setError(requestError.message || 'Unable to change password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <section className={`${compact ? 'w-full border-0 bg-transparent shadow-none' : 'mx-auto w-full max-w-xl border border-slate-200 bg-white shadow-sm'}`}>
            {!compact && (
                <div className="border-b border-slate-200 px-6 py-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center bg-emerald-50 text-emerald-800">
                            <ShieldCheck className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-800">
                                {forced ? 'Required Security Update' : 'Account Security'}
                            </p>
                            <h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
                            <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={submit} className={`${compact ? 'space-y-5 px-4 py-4' : 'space-y-5 px-6 py-6'}`}>
                {error && (
                    <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                        {error}
                    </div>
                )}
                {success && !forced && (
                    <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                        {success}
                    </div>
                )}

                <PasswordField
                    id="current_password"
                    label="Current Password"
                    value={form.current_password}
                    visible={show.current}
                    onToggle={() => toggleVisibility('current')}
                    onChange={setField}
                    autoComplete="current-password"
                />
                <PasswordField
                    id="new_password"
                    label="New Password"
                    value={form.new_password}
                    visible={show.next}
                    onToggle={() => toggleVisibility('next')}
                    onChange={setField}
                    autoComplete="new-password"
                />
                <PasswordField
                    id="confirm_password"
                    label="Confirm New Password"
                    value={form.confirm_password}
                    visible={show.confirm}
                    onToggle={() => toggleVisibility('confirm')}
                    onChange={setField}
                    autoComplete="new-password"
                />

                <div className="border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Password Requirements</p>
                    <div className="mt-2 grid gap-1 text-xs font-bold">
                        {passwordRequirements.map((rule) => {
                            const passed = rule.test(form.new_password);
                            return (
                                <span key={rule.label} className={passed ? 'text-emerald-800' : 'text-slate-500'}>
                                    {passed ? 'OK' : '-'} {rule.label}
                                </span>
                            );
                        })}
                        {confirmationMismatch && (
                            <span className="text-rose-700">- Confirmation must match exactly</span>
                        )}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 bg-[#084C39] px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#07362A] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {submitting ? 'Updating Password...' : 'Update Password'}
                </button>
            </form>
        </section>
    );
};

export default SecurityProfileForm;
