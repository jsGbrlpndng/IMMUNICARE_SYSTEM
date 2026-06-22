import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Lock,
    ArrowLeft,
    ShieldCheck,
    UserCircle,
    ArrowRight,
    Loader2,
    Activity,
    Users,
    Eye,
    EyeOff
} from 'lucide-react';

const AccessPortal = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user } = useAuth();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Redirect if already logged in
    useEffect(() => {
        if (user) {
            const { role: userRole } = user;
            if (user.must_change_password || user.password_update_required) {
                navigate('/force-password-change', { replace: true });
                return;
            }
            if (userRole === 'Super Admin') {
                navigate('/superadmin/dashboard');
            } else if (userRole === 'Admin') {
                navigate('/admin/dashboard');
            } else if (userRole === 'Midwife') {
                navigate('/clinical/dashboard');
            } else if (userRole === 'BHW') {
                navigate('/bhw/dashboard');
            } else {
                navigate('/clinical/dashboard');
            }
        }
    }, [user, navigate]);

    const handleStaffLogin = async (e) => {
        e.preventDefault();
        if (!userId.trim()) {
            alert('Please enter your Staff ID');
            return;
        }
        if (!password.trim()) {
            alert('Please enter your password');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId.trim(),
                    password: password.trim()
                })
            });

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response. Please contact system administrator.');
            }

            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                console.error('JSON parsing error:', jsonError);
                throw new Error('Invalid server response format. Please try again or contact support.');
            }

            if (response.ok && data.success) {
                const { role: userRole } = data.user;
                console.log(`Login successful for ${data.user.name} (${userRole})`);

                // Save session with authToken
                login(data.user, data.authToken);

                if (data.status === 'REQUIRES_PASSWORD_UPDATE' || data.user?.must_change_password || data.user?.password_update_required) {
                    navigate('/force-password-change', { replace: true });
                    return;
                }

                // Redirect strictly based on the role returned from the database
                if (userRole === 'Super Admin') {
                    navigate('/superadmin/dashboard');
                } else if (userRole === 'Admin') {
                    navigate('/admin/dashboard');
                } else if (userRole === 'Midwife') {
                    navigate('/clinical/dashboard');
                } else if (userRole === 'BHW') {
                    navigate('/bhw/dashboard');
                } else {
                    console.warn(`Unknown role: ${userRole}`);
                    navigate('/portal');
                }
            } else {
                // Handle specific error codes
                const errorMessage = data.error || 'Login failed';
                const errorCode = data.code || 'UNKNOWN_ERROR';

                console.error(`Login error [${errorCode}]:`, errorMessage);

                switch (errorCode) {
                    case 'INVALID_CREDENTIALS':
                        alert('Invalid Staff ID or password. Please try again.');
                        break;
                    case 'USER_INACTIVE':
                        alert('Your account is inactive. Please contact your system administrator.');
                        break;
                    case 'MISSING_CREDENTIALS':
                        alert('Please enter both Staff ID and password.');
                        break;
                    case 'INVALID_USER_ID_FORMAT':
                        alert('Please enter a valid Staff ID.');
                        break;
                    default:
                        alert(errorMessage);
                }
            }
        } catch (error) {
            console.error('Login error:', error);

            // Provide user-friendly error messages
            if (error.message.includes('fetch')) {
                alert('Connection failure to health server. Please check your internet connection and try again.');
            } else if (error.message.includes('JSON')) {
                alert('Server communication error. Please try again or contact technical support.');
            } else {
                alert(error.message || 'Connection failure to health server. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-emerald-500/10">
            {/* Header */}
            <nav className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 py-3 shadow-sm backdrop-blur-lg">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-5 lg:px-8">
                    {/* Logo */}
                    <Link to="/" className="group flex items-center space-x-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-gradient-to-br from-emerald-600 to-[#064E3B] shadow-sm transition-transform group-hover:scale-105">
                            <Activity className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="text-lg font-black tracking-tight text-[#064E3B]">ImmuniCare</span>
                            <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600">RHU Portal</span>
                        </div>
                    </Link>

                    {/* Back to Home */}
                    <Link
                        to="/"
                        className="group flex items-center space-x-2 text-slate-500 transition-colors hover:text-[#064E3B]"
                    >
                        <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
                        <span className="text-sm font-bold">Back to Home</span>
                    </Link>
                </div>
            </nav>

            {/* Main Content */}
            <div className="flex min-h-screen items-center justify-center px-5 pb-12 pt-24">
                <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_440px]">
                    <aside className="hidden border-r border-slate-200 bg-[#064E3B] p-8 text-white lg:flex lg:flex-col lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-50">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Secure Staff Access
                            </div>
                            <h1 className="mt-8 max-w-md text-4xl font-black leading-tight tracking-tight">
                                Immunization operations for RHU and barangay teams.
                            </h1>
                            <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-emerald-50/80">
                                Sign in to manage infant registry work, NIP schedules, validations, follow-ups, and coverage monitoring.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ['Infant Registry', Users],
                                ['NIP Monitoring', Activity],
                                ['Validation Queue', ShieldCheck],
                                ['Role-Based Access', Lock]
                            ].map(([label, Icon]) => (
                                <div key={label} className="border border-white/15 bg-white/10 p-4">
                                    <Icon className="mb-3 h-5 w-5 text-emerald-100" />
                                    <p className="text-xs font-black uppercase tracking-wider text-white">{label}</p>
                                </div>
                            ))}
                        </div>
                    </aside>

                    <div className="relative z-10 w-full p-6 sm:p-8 lg:p-10">
                    {/* Login Card */}
                    <div>
                            {/* Header */}
                            <div className="mb-8">
                                <div className="mb-5 flex h-14 w-14 items-center justify-center border border-emerald-900 bg-[#064E3B] shadow-sm">
                                    <ShieldCheck className="h-7 w-7 text-white" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Staff Portal</p>
                                <h1 className="mt-2 text-3xl font-black text-slate-950">Welcome Back</h1>
                                <p className="mt-2 text-sm font-semibold text-slate-500">Access your ImmuniCare workspace with your assigned staff credentials.</p>
                            </div>

                            <form onSubmit={handleStaffLogin} className="space-y-5">
                                {location.state?.securityMessage && (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        className="relative overflow-hidden border border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-slate-50 px-4 py-4 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-900/5"
                                    >
                                        <div className="absolute inset-y-0 left-0 w-1 bg-[#064E3B]" />
                                        <div className="flex items-start gap-3 pl-1">
                                            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center border border-emerald-200 bg-white text-emerald-800 shadow-sm">
                                                <ShieldCheck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800">
                                                    Security Update Complete
                                                </p>
                                                <p className="mt-1 text-base font-black text-slate-950">{location.state.securityMessage}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-600">
                                                    For your protection, your previous session has been closed.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* User ID Input */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-600">Staff ID</label>
                                    <div className="relative">
                                        <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                        <input
                                            type="text"
                                            value={userId}
                                            onChange={(e) => setUserId(e.target.value)}
                                            placeholder="Enter your staff ID"
                                            className="w-full border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-4 font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#064E3B] focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Password Input */}
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-600">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full border border-slate-200 bg-slate-50 py-3.5 pl-12 pr-12 font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#064E3B] focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Forgot Password */}
                                <div className="text-right">
                                    <a href="#" className="text-sm font-bold text-[#064E3B] transition-colors hover:text-emerald-700">
                                        Forgot password?
                                    </a>
                                </div>

                                {/* Login Button */}
                                <button
                                    type="submit"
                                    disabled={loading || !userId}
                                    className="group relative h-13 w-full overflow-hidden border border-[#064E3B] bg-[#064E3B] px-5 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    {loading ? (
                                        <Loader2 className="animate-spin w-5 h-5" />
                                    ) : (
                                        <div className="flex items-center justify-center relative z-10">
                                            <span>Sign In</span>
                                            <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    )}
                                </button>
                            </form>

                            {/* Footer */}
                            <div className="mt-8 border-t border-slate-200 pt-5 text-center">
                                <div className="flex items-center justify-center space-x-2 text-slate-400">
                                    <ShieldCheck size={16} />
                                    <span className="text-xs font-bold">Authorized healthcare staff only</span>
                                </div>
                            </div>
                    </div>

                    {/* Additional Info */}
                    <div className="mt-6 text-center">
                        <p className="text-sm font-semibold text-slate-500">
                            Need help? Contact your system administrator
                        </p>
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
};

export default AccessPortal;
