import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBarangayFilter } from '../contexts/BarangayFilterContext';
import {
    LayoutDashboard,
    Users,
    Shield,
    FileText,
    Settings,
    LogOut,
    ChevronDown,
    BarChart3,
    Filter,
    Menu,
    X,
    MapPin,
    Activity
} from 'lucide-react';

const BARANGAYS = [
    'LANGGAM', 'CALENDOLA', 'GSIS', 'MAGSAYSAY', 'SAMPAGUITA', 
    'UBL', 'UB', 'LARAM', 'ESTRELLA', 'BAGONG SILANG', 
    'RIVERSIDE', 'NARRA'
];

const SuperAdminLayout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout, user } = useAuth();
    const { selectedBarangay, setSelectedBarangay } = useBarangayFilter();
    
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const menuItems = [
        { name: 'Global Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard },
        { name: 'User Management', path: '/superadmin/users', icon: Users },
        { name: 'Municipal Reports', path: '/superadmin/reports', icon: BarChart3 },
        { name: 'Audit Trail', path: '/superadmin/audit', icon: FileText },
        { name: 'System Settings', path: '/superadmin/settings', icon: Settings },
    ];

    const pageName = menuItems.find(item => location.pathname.startsWith(item.path))?.name || 'Super Admin';

    useEffect(() => {
        document.title = `ImmuniCare - ${pageName}`;
    }, [pageName]);

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            {/* Top Navigation Bar */}
            <nav className="fixed top-0 w-full z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-[1600px] mx-auto px-6">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo & Filter Section */}
                        <div className="flex items-center gap-12">
                            <Link to="/superadmin/dashboard" className="flex items-center space-x-3 shrink-0">
                                <div className="w-9 h-9 bg-emerald-800 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/20">
                                    <Shield className="text-white w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-black tracking-tight text-slate-900 leading-none">ImmuniCare</span>
                                    <span className="text-[10px] text-emerald-700 font-black tracking-widest uppercase mt-1">Super Admin</span>
                                </div>
                            </Link>

                            {/* Global Barangay Filter - HARDCODED RHU 2 ENUMS */}
                            <div className="hidden lg:flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 shadow-inner">
                                <div className="flex items-center px-3 gap-2 text-slate-400 border-r border-slate-200 mr-2">
                                    <Filter size={14} className="text-emerald-700" />
                                    <span className="text-[10px] font-black uppercase tracking-wider whitespace-nowrap">Global Filter</span>
                                </div>
                                <select
                                    value={selectedBarangay}
                                    onChange={(e) => setSelectedBarangay(e.target.value)}
                                    className="bg-transparent border-none text-xs font-bold text-slate-700 focus:ring-0 cursor-pointer pr-8 py-1.5 min-w-[180px]"
                                >
                                    <option value="all">ALL BARANGAYS (MUNICIPAL)</option>
                                    {BARANGAYS.map(brgy => (
                                        <option key={brgy} value={brgy}>{brgy}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Desktop Menu Items */}
                        <div className="hidden md:flex items-center gap-1">
                            {menuItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.name}
                                        to={item.path}
                                        className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 ${isActive
                                            ? 'bg-emerald-50 text-emerald-800 shadow-sm border border-emerald-100'
                                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="font-bold text-xs uppercase tracking-wide">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Right Side - User Profile */}
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center space-x-3 p-1.5 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
                                >
                                    <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-md shadow-slate-900/20">
                                        {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'SA'}
                                    </div>
                                    <div className="hidden sm:block text-left">
                                        <p className="text-xs font-black text-slate-900 leading-none">{user?.name || 'Super Admin'}</p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">Municipal Oversight</p>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {userMenuOpen && (
                                    <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="px-4 py-2 border-b border-slate-100 mb-1">
                                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Admin Actions</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                logout();
                                                navigate('/portal');
                                            }}
                                            className="flex items-center space-x-3 w-full px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            <span>Terminate Session</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-2 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
                
                {/* Mobile Menu & Mobile Filter */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t border-slate-100 bg-white animate-in slide-in-from-top-2 duration-200">
                        <div className="px-6 py-6 space-y-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Area</label>
                                <select
                                    value={selectedBarangay}
                                    onChange={(e) => {
                                        setSelectedBarangay(e.target.value);
                                        setMobileMenuOpen(false);
                                    }}
                                    className="w-full bg-white border-slate-200 rounded-lg text-sm font-bold focus:ring-emerald-500"
                                >
                                    <option value="all">ALL BARANGAYS</option>
                                    {BARANGAYS.map(brgy => (
                                        <option key={brgy} value={brgy}>{brgy}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-2 pt-2">
                                {menuItems.map((item) => (
                                    <Link
                                        key={item.name}
                                        to={item.path}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center space-x-3 px-4 py-3 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-emerald-800 font-bold text-sm"
                                    >
                                        <item.icon className="w-5 h-5" />
                                        <span>{item.name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            <main className="pt-24 max-w-[1600px] mx-auto px-6 py-8">
                {children}
            </main>

            {userMenuOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
            )}
        </div>
    );
};

export default SuperAdminLayout;
