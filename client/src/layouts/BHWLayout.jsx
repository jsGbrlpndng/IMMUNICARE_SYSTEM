import { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    UserPlus,
    ClipboardList,
    LogOut,
    ChevronLeft,
    ChevronRight,
    User,
    ChevronDown,
    Settings,
    MapPin,
    X,
    Menu
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/* ─── BHW Layout ─────────────────────────────────────────────
   Uses the same sidebar shell as the Midwife (StaffLayout/SidebarNav)
   to give both roles a visually consistent experience.
   The only difference is the nav items (BHW-specific).
──────────────────────────────────────────────────────────── */

const BHWLayout = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Collapse state – persisted across page loads
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            const saved = localStorage.getItem('bhw-sidebar-collapsed');
            return saved ? JSON.parse(saved) : false;
        } catch {
            return false;
        }
    });

    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const accountRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('bhw-sidebar-collapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    // Close account menu on outside click
    useEffect(() => {
        const handler = (e) => {
            if (accountRef.current && !accountRef.current.contains(e.target)) {
                setAccountOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        {
            group: 'BHW Portal',
            items: [
                { path: '/bhw/dashboard', label: 'Dashboard', icon: LayoutDashboard },
                { path: '/bhw/register', label: 'Register Infant', icon: UserPlus },
                { path: '/bhw/submissions', label: 'My Submissions', icon: ClipboardList },
            ],
        },
    ];

    const initials = user?.full_name
        ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'BH';

    const isActive = (path) => location.pathname === path;

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex">

            {/* ── Mobile overlay ────────────────────────────────── */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* ── Sidebar ───────────────────────────────────────── */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-200
                    transition-all duration-300 ease-in-out
                    ${isCollapsed ? 'w-20' : 'w-64'}
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
            >
                {/* Logo / header */}
                <div className="flex items-center justify-between h-16 px-5 border-b border-slate-100 flex-shrink-0">
                    {!isCollapsed && (
                        <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-[#059669] rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-white/10">
                                <span className="text-white font-bold text-sm">I</span>
                            </div>
                            <div className="flex flex-col leading-tight">
                                <span className="text-sm font-extrabold text-slate-900 tracking-tight">ImmuniCare</span>
                                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">San Pedro RHU</span>
                            </div>
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="mx-auto">
                            <div className="w-8 h-8 bg-[#059669] rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-white/10">
                                <span className="text-white font-bold text-sm">I</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
                    {navItems.map((group) => (
                        <div key={group.group}>
                            {!isCollapsed && (
                                <h3 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                    {group.group}
                                </h3>
                            )}
                            <div className="space-y-1">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.path);
                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            onClick={() => setIsMobileOpen(false)}
                                            title={isCollapsed ? item.label : ''}
                                            className={`
                                                group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200
                                                ${active
                                                    ? 'bg-white border-slate-200 text-emerald-700 shadow-sm'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-emerald-600'
                                                }
                                            `}
                                        >
                                            {active && (
                                                <span className="absolute left-0 top-[15%] h-[70%] w-1 bg-emerald-600 rounded-r-full" />
                                            )}
                                            <Icon
                                                className={`
                                                    flex-shrink-0 w-5 h-5
                                                    ${active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-emerald-600'}
                                                    ${isCollapsed ? 'mx-auto' : 'mr-3'}
                                                `}
                                                strokeWidth={active ? 2.5 : 2}
                                            />
                                            {!isCollapsed && <span>{item.label}</span>}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Assigned barangay chip */}
                    {!isCollapsed && user?.assigned_barangay && (
                        <div className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned Barangay</p>
                            <div className="flex items-center gap-1.5 text-slate-700">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-sm font-semibold">{user.assigned_barangay}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Account section */}
                <div className="px-3 pb-2 border-t border-slate-100 pt-3 flex-shrink-0" ref={accountRef}>
                    <div className="relative">
                        <button
                            onClick={() => setAccountOpen(!accountOpen)}
                            className={`
                                w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-emerald-900 transition-all duration-300 text-left
                                border border-white/5 shadow-lg shadow-emerald-950/20
                                ${isCollapsed ? 'justify-center' : ''}
                                hover:translate-y-[-1px] hover:shadow-xl
                            `}
                        >
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                {initials}
                            </div>
                            {!isCollapsed && (
                                <>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{user?.full_name || 'BHW User'}</p>
                                        <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider truncate opacity-80">BHW · {user?.id?.slice(0, 8) || 'STAFF'}</p>
                                    </div>
                                    <ChevronDown
                                        className={`w-4 h-4 text-white/70 flex-shrink-0 transition-transform duration-200 ${accountOpen ? 'rotate-180' : ''}`}
                                    />
                                </>
                            )}
                        </button>

                        {/* Account dropdown */}
                        {accountOpen && (
                            <div
                                className={`
                                    absolute bottom-full mb-2 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-10 w-52
                                    ${isCollapsed ? 'left-14' : 'left-0 right-0'}
                                `}
                            >
                                <div className="px-4 py-2.5 border-b border-slate-50 mb-1">
                                    <p className="text-xs font-bold text-slate-900 truncate">{user?.full_name}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">BHW – {user?.assigned_barangay || 'No Barangay'}</p>
                                </div>
                                <button
                                    onClick={() => navigate('/bhw/profile')}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition-colors"
                                >
                                    <Settings className="w-4 h-4" />
                                    Account Settings
                                </button>
                                <div className="px-3 mt-1">
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span className="font-bold">Sign Out</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Collapse toggle */}
                <div className="p-3 border-t border-slate-100 hidden lg:block flex-shrink-0">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="flex items-center justify-center w-full py-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                        {isCollapsed ? (
                            <ChevronRight size={18} />
                        ) : (
                            <div className="flex items-center space-x-2 text-sm font-bold">
                                <ChevronLeft size={18} strokeWidth={2.5} />
                                <span>Collapse Sidebar</span>
                            </div>
                        )}
                    </button>
                </div>
            </aside>

            {/* ── Main content ──────────────────────────────────── */}
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>

                {/* Mobile top bar */}
                <header className="lg:hidden h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4">
                    <button
                        onClick={() => setIsMobileOpen(!isMobileOpen)}
                        className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                    <span className="font-bold text-slate-900 text-sm">BHW Portal</span>
                    <div className="w-8" />
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-y-auto p-5 lg:p-8">
                    <div className="max-w-6xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default BHWLayout;
