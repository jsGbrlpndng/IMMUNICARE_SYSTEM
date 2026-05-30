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
        <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-500/10 relative overflow-hidden">
            {/* Background Elements - matching landing page style */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
            <div className="absolute top-1/2 -left-20 w-72 h-72 bg-emerald-50 rounded-full blur-3xl opacity-40 pointer-events-none" />

            {/* Header */}
            <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-lg border-b border-slate-100 py-4">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
                    {/* Logo */}
                    <Link to="/" className="flex items-center space-x-2 group">
                        <div className="w-8 h-8 bg-[#0061FF] rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                            <Activity className="text-white w-5 h-5" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-slate-900">ImmuniCare</span>
                    </Link>

                    {/* Back to Home */}
                    <Link
                        to="/"
                        className="flex items-center space-x-2 text-slate-500 hover:text-[#0061FF] transition-colors group"
                    >
                        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">Back to Home</span>
                    </Link>
                </div>
            </nav>

            {/* Main Content */}
            <div className="flex items-center justify-center min-h-screen pt-20 pb-12 px-6">
                <div className="w-full max-w-md relative z-10">
                    {/* Login Card */}
                    <div className="bg-white rounded-[2.5rem] shadow-large border border-slate-50 p-10 relative overflow-hidden">
                        {/* Subtle gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-transparent pointer-events-none" />

                        <div className="relative z-10">
                            {/* Header */}
                            <div className="text-center mb-10">
                                <div className="w-16 h-16 bg-[#0061FF] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 mx-auto mb-6">
                                    <ShieldCheck className="text-white w-8 h-8" />
                                </div>
                                <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Welcome Back</h1>
                                <p className="text-slate-500 text-sm">Access your ImmuniCare portal</p>
                            </div>

                            <form onSubmit={handleStaffLogin} className="space-y-6">
                                {location.state?.securityMessage && (
                                    <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                                        {location.state.securityMessage}
                                    </div>
                                )}

                                {/* User ID Input */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Staff ID</label>
                                    <div className="relative">
                                        <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                        <input
                                            type="text"
                                            value={userId}
                                            onChange={(e) => setUserId(e.target.value)}
                                            placeholder="Enter your staff ID"
                                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder-slate-400 focus:border-[#0061FF] focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Password Input */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 placeholder-slate-400 focus:border-[#0061FF] focus:bg-white focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
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
                                    <a href="#" className="text-sm text-[#0061FF] hover:text-blue-700 font-medium transition-colors">
                                        Forgot password?
                                    </a>
                                </div>

                                {/* Login Button */}
                                <button
                                    type="submit"
                                    disabled={loading || !userId}
                                    className="w-full btn-primary h-14 !rounded-xl text-base font-semibold shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
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
                            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                                <div className="flex items-center justify-center space-x-2 text-slate-400">
                                    <ShieldCheck size={16} />
                                    <span className="text-xs font-medium">Secure Healthcare Portal</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-500">
                            Need help? Contact your system administrator
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccessPortal;
