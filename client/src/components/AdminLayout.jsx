import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    LayoutDashboard,
    Users,
    Shield,
    FileText,
    Settings,
    LogOut,
    User,
    Menu,
    X,
    ChevronDown,
    BarChart3
} from 'lucide-react';

const AdminLayout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout, user } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const menuItems = [
        { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'User Management', path: '/admin/users', icon: Users },
        { name: 'M1 Reports', path: '/admin/reports/m1', icon: BarChart3 },
        { name: 'Audit Logs', path: '/admin/audit', icon: FileText },
        { name: 'System Settings', path: '/admin/settings', icon: Settings },
    ];


    const pageName = location.pathname
        .split('/')
        .pop()
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase()) || 'Dashboard';

    useEffect(() => {
        document.title = `ImmuniCare - ${pageName}`;
    }, [pageName]);

    return (
        <div className="min-h-screen bg-[#F1F5F9]">
            {/* Top Navigation Bar - Clean Minimalism */}
            <nav className="fixed top-0 w-full z-50 bg-white border-b border-slate-200 py-2">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="flex items-center justify-between h-14">
                        {/* Logo */}
                        <Link to="/admin/dashboard" className="flex items-center space-x-3 group">
                            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                                <Shield className="text-white w-5 h-5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-bold tracking-tight text-slate-900">ImmuniCare</span>
                                <span className="text-xs text-slate-500 font-medium tracking-wider uppercase">Admin</span>
                            </div>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden md:flex items-center space-x-1">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.name}
                                        to={item.path}
                                        className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg transition-colors ${isActive
                                            ? 'bg-slate-100 text-slate-900'
                                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="font-semibold text-sm">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Right Side - User Menu */}
                        <div className="flex items-center space-x-4">
                            {/* User Menu */}
                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center space-x-3 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-700 text-sm font-bold">
                                        {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'AD'}
                                    </div>
                                    <div className="hidden sm:block text-left">
                                        <p className="text-sm font-bold text-slate-900">{user?.name || 'Administrator'}</p>
                                    </div>
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                </button>

                                {/* User Dropdown */}
                                {userMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 text-slate-900">
                                        <div className="px-4 py-2 border-b border-slate-100">
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Session</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                logout();
                                                navigate('/');
                                            }}
                                            className="flex items-center space-x-2 w-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            <span>Sign Out</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-2 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                {mobileMenuOpen ? (
                                    <X className="w-5 h-5 text-slate-400" />
                                ) : (
                                    <Menu className="w-5 h-5 text-slate-400" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Mobile Menu */}
                    {mobileMenuOpen && (
                        <div className="md:hidden border-t border-slate-100 bg-white">
                            <div className="px-4 py-4 space-y-2">
                                {menuItems.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = location.pathname === item.path;
                                    return (
                                        <Link
                                            key={item.name}
                                            to={item.path}
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                                ? 'bg-slate-100 text-slate-900'
                                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                                }`}
                                        >
                                            <Icon className="w-5 h-5" />
                                            <span className="font-semibold">{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </nav>

            {/* Main Content */}
            <main className="pt-20 max-w-7xl mx-auto px-6 lg:px-8 py-8">
                {children}
            </main>

            {/* Click outside to close user menu */}
            {userMenuOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                />
            )}
        </div>
    );
};

export default AdminLayout;
