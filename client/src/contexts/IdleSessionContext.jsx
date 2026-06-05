import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const IdleSessionContext = createContext();
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 3000;
const LOCK_STORAGE_KEY = 'immunicare_idle_locked';
const PUBLIC_PATHS = ['/', '/portal', '/login', '/force-password-change', '/caregiver'];

const isPublicPath = (path) => {
    return PUBLIC_PATHS.some((publicPath) => path === publicPath || (publicPath !== '/' && path.startsWith(publicPath)));
};

const createThrottle = (fn, wait) => {
    let lastRun = 0;
    let timeoutId = null;

    const throttled = (...args) => {
        const now = Date.now();
        const remaining = wait - (now - lastRun);

        if (remaining <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastRun = now;
            fn(...args);
            return;
        }

        if (!timeoutId) {
            timeoutId = window.setTimeout(() => {
                lastRun = Date.now();
                timeoutId = null;
                fn(...args);
            }, remaining);
        }
    };

    throttled.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return throttled;
};

const IdleLockModal = ({ user, onUnlock, onLogout }) => {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await onUnlock(password);
            setPassword('');
        } catch (unlockError) {
            setError(unlockError.message || 'Unable to unlock session.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
            <section className="w-full max-w-md border border-slate-300 bg-white shadow-2xl">
                <div className="border-b border-slate-300 bg-[#064E3B] px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/30 bg-white/10">
                            <Lock className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Protected Clinical Session</p>
                            <h2 className="text-lg font-black">Session Locked</h2>
                        </div>
                    </div>
                </div>

                <form onSubmit={submit} className="space-y-4 p-5">
                    <div className="border border-slate-300 bg-slate-50 p-3 text-xs font-bold text-slate-700">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Signed in as</p>
                        <p className="mt-1 text-sm font-black text-slate-950">{user?.name || user?.full_name || user?.id || 'Clinical Staff'}</p>
                        <p className="mt-0.5 uppercase tracking-wide text-[#064E3B]">{user?.role || 'Staff'}</p>
                    </div>

                    <p className="text-sm font-semibold text-slate-600">
                        The workspace was locked after 15 minutes of inactivity. Enter your password to continue without losing the current page.
                    </p>

                    <label className="block">
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Password</span>
                        <div className="flex border border-slate-300 bg-white">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="h-11 flex-1 px-3 text-sm font-bold text-slate-950 outline-none"
                                autoComplete="current-password"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((current) => !current)}
                                className="border-l border-slate-300 px-3 text-slate-500 hover:text-[#064E3B]"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </label>

                    {error ? (
                        <div className="border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{error}</div>
                    ) : null}

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={submitting || !password}
                            className="inline-flex h-10 flex-1 items-center justify-center gap-2 border border-[#064E3B] bg-[#064E3B] px-4 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-[#043828] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <ShieldCheck className="h-4 w-4" />
                            {submitting ? 'Verifying' : 'Unlock'}
                        </button>
                        <button
                            type="button"
                            onClick={onLogout}
                            className="inline-flex h-10 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.12em] text-slate-700 hover:border-red-300 hover:text-red-700"
                        >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
};

export const IdleSessionProvider = ({ children }) => {
    const { user, login, logout, auditLogout } = useAuth();
    const location = useLocation();
    const [locked, setLocked] = useState(() => sessionStorage.getItem(LOCK_STORAGE_KEY) === 'true');
    const timerRef = useRef(null);
    const idleLockAuditRecordedRef = useRef(false);

    const isProtectedSession = Boolean(user) && !isPublicPath(location.pathname);

    const recordIdleLockAudit = useCallback(() => {
        if (idleLockAuditRecordedRef.current) return;
        idleLockAuditRecordedRef.current = true;

        const token = localStorage.getItem('auth_token');
        if (!token) return;

        fetch('/api/auth/session-idle-lock', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ idle_timeout_minutes: IDLE_TIMEOUT_MS / (60 * 1000) }),
            keepalive: true
        }).catch((error) => {
            console.warn('[SESSION_IDLE_LOCK_AUDIT_FAILED]', error);
        });
    }, []);

    const lockSession = useCallback(() => {
        if (!isProtectedSession || locked) return;
        sessionStorage.setItem(LOCK_STORAGE_KEY, 'true');
        recordIdleLockAudit();
        setLocked(true);
    }, [isProtectedSession, locked, recordIdleLockAudit]);

    const resetTimer = useCallback(() => {
        if (!isProtectedSession || locked) return;
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(lockSession, IDLE_TIMEOUT_MS);
    }, [isProtectedSession, lockSession, locked]);

    useEffect(() => {
        if (!isProtectedSession) {
            window.clearTimeout(timerRef.current);
            sessionStorage.removeItem(LOCK_STORAGE_KEY);
            idleLockAuditRecordedRef.current = false;
            setLocked(false);
            return undefined;
        }

        if (locked) {
            window.clearTimeout(timerRef.current);
            return undefined;
        }

        const throttledActivity = createThrottle(resetTimer, ACTIVITY_THROTTLE_MS);
        const forceLock = () => lockSession();
        const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'];
        events.forEach((eventName) => window.addEventListener(eventName, throttledActivity, { passive: true }));
        window.addEventListener('immunicare:idle-lock', forceLock);
        resetTimer();

        return () => {
            events.forEach((eventName) => window.removeEventListener(eventName, throttledActivity));
            window.removeEventListener('immunicare:idle-lock', forceLock);
            throttledActivity.cancel();
            window.clearTimeout(timerRef.current);
        };
    }, [isProtectedSession, lockSession, locked, resetTimer]);

    const unlock = useCallback(async (password) => {
        const response = await fetch('/api/auth/reauthenticate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': localStorage.getItem('auth_token') || ''
            },
            body: JSON.stringify({ password })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success) {
            if (response.status === 401 && payload.code !== 'INVALID_PASSWORD') {
                logout();
                window.location.href = '/portal';
            }
            throw new Error(payload.error || 'Unable to unlock session.');
        }

        login(payload.user, payload.authToken);
        sessionStorage.removeItem(LOCK_STORAGE_KEY);
        idleLockAuditRecordedRef.current = false;
        setLocked(false);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(lockSession, IDLE_TIMEOUT_MS);
    }, [lockSession, login, logout]);

    const signOut = useCallback(() => {
        auditLogout?.();
        sessionStorage.removeItem(LOCK_STORAGE_KEY);
        idleLockAuditRecordedRef.current = false;
        setLocked(false);
        logout();
        window.location.href = '/portal';
    }, [auditLogout, logout]);

    const value = useMemo(() => ({
        locked,
        lockSession,
        unlock
    }), [lockSession, locked, unlock]);

    return (
        <IdleSessionContext.Provider value={value}>
            {children}
            {isProtectedSession && locked ? (
                <IdleLockModal user={user} onUnlock={unlock} onLogout={signOut} />
            ) : null}
        </IdleSessionContext.Provider>
    );
};

export const useIdleSession = () => useContext(IdleSessionContext);
