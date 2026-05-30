import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    ClipboardList,
    LogOut,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    MapPin,
    X,
    Menu,
    FolderCheck,
    Shield,
    Settings
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const BRAND = {
    green: '#0B6E4F',
    greenDark: '#084C39',
    greenTint: '#E9F6F0',
    greenLine: '#BFDFD1',
    bg: '#F3F6F8',
    panel: '#FFFFFF',
    panelMuted: '#F8FAFB',
    border: '#D9E2E7',
    text: '#102A43',
    textMuted: '#627D98',
    textSoft: '#829AB1'
};

const navItems = [
    { path: '/bhw/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/bhw/submissions', label: 'My Submissions', icon: FolderCheck },
    { path: '/bhw/follow-ups', label: 'Follow-Ups', icon: ClipboardList },
    { path: '/bhw/profile', label: 'Account Settings', icon: Settings }
];

const BHWLayout = () => {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
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

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (accountRef.current && !accountRef.current.contains(event.target)) {
                setAccountOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const initials = user?.full_name
        ? user.full_name.split(' ').map((name) => name[0]).join('').toUpperCase().slice(0, 2)
        : 'BH';

    const pageName = location.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/-/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase()) || 'Dashboard';

    const isActive = (path) => location.pathname === path;

    return (
        <div className="min-h-screen flex" style={{ backgroundColor: BRAND.bg }}>
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px] lg:hidden"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out
                    ${isCollapsed ? 'w-20' : 'w-64'}
                    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                `}
                style={{
                    backgroundColor: BRAND.panel,
                    borderColor: BRAND.border
                }}
            >
                <div
                    className={`h-20 border-b flex items-center ${isCollapsed ? 'justify-center px-4' : 'justify-between px-6'}`}
                    style={{ borderColor: BRAND.border }}
                >
                    {!isCollapsed ? (
                        <div className="flex items-center gap-3">
                            <div
                                className="h-10 w-10 rounded-md flex items-center justify-center"
                                style={{ backgroundColor: BRAND.green }}
                            >
                                <Shield className="h-5 w-5 text-white" strokeWidth={2.3} />
                            </div>
                            <div className="leading-tight">
                                <p className="text-[1.05rem] font-extrabold tracking-tight" style={{ color: BRAND.text }}>
                                    ImmuniCare
                                </p>
                                <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em]" style={{ color: BRAND.green }}>
                                    San Pedro RHU
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="h-10 w-10 rounded-md flex items-center justify-center"
                            style={{ backgroundColor: BRAND.green }}
                        >
                            <Shield className="h-5 w-5 text-white" strokeWidth={2.3} />
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5">
                    {!isCollapsed && (
                        <div className="mb-6">
                            <p className="px-2 text-[0.7rem] font-bold uppercase tracking-[0.18em]" style={{ color: BRAND.textSoft }}>
                                BHW Portal
                            </p>
                        </div>
                    )}

                    <nav className="space-y-1.5">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path);

                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    title={isCollapsed ? item.label : ''}
                                    onClick={() => setIsMobileOpen(false)}
                                    className={`
                                        relative flex items-center rounded-md border transition-all duration-150
                                        ${isCollapsed ? 'justify-center px-3 py-3' : 'justify-start px-4 py-3'}
                                    `}
                                    style={{
                                        backgroundColor: active ? BRAND.greenTint : 'transparent',
                                        borderColor: active ? BRAND.greenLine : 'transparent',
                                        color: active ? BRAND.greenDark : BRAND.textMuted
                                    }}
                                >
                                    {!isCollapsed && active && (
                                        <span
                                            className="absolute left-0 top-2.5 bottom-2.5 w-1"
                                            style={{ backgroundColor: BRAND.green }}
                                        />
                                    )}
                                    <Icon
                                        className={isCollapsed ? 'h-5 w-5' : 'mr-3 h-5 w-5'}
                                        strokeWidth={active ? 2.4 : 2}
                                        style={{ color: active ? BRAND.green : BRAND.textSoft }}
                                    />
                                    {!isCollapsed && (
                                        <span className="text-[0.95rem] font-semibold">{item.label}</span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {!isCollapsed && (
                        <div
                            className="mt-8 rounded-md border px-4 py-3"
                            style={{
                                backgroundColor: BRAND.panelMuted,
                                borderColor: BRAND.border
                            }}
                        >
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em]" style={{ color: BRAND.textSoft }}>
                                Assigned Barangay
                            </p>
                            <div className="mt-2 flex items-center gap-2" style={{ color: BRAND.text }}>
                                <MapPin className="h-4 w-4" style={{ color: BRAND.green }} />
                                <span className="text-base font-bold uppercase">
                                    {user?.assigned_barangay || 'Unassigned'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    ref={accountRef}
                    className="border-t px-4 py-4"
                    style={{ borderColor: BRAND.border, backgroundColor: BRAND.panel }}
                >
                    <div className="relative">
                        <button
                            onClick={() => setAccountOpen((open) => !open)}
                            className={`
                                flex w-full items-center rounded-md border px-4 py-3 text-left transition-all duration-150
                                ${isCollapsed ? 'justify-center' : 'justify-start'}
                            `}
                            style={{
                                backgroundColor: BRAND.greenDark,
                                borderColor: BRAND.greenDark,
                                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)'
                            }}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded border border-white/20 bg-white/10 text-sm font-bold text-white">
                                {initials}
                            </div>
                            {!isCollapsed && (
                                <>
                                    <div className="ml-3 min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-white">
                                            {user?.full_name || 'BHW User'}
                                        </p>
                                        <p className="truncate text-[0.68rem] font-bold uppercase tracking-[0.14em] text-emerald-100/90">
                                            BHW · {user?.assigned_barangay || 'San Pedro'}
                                        </p>
                                    </div>
                                    <ChevronDown
                                        className={`h-4 w-4 text-white/80 transition-transform duration-150 ${accountOpen ? 'rotate-180' : ''}`}
                                    />
                                </>
                            )}
                        </button>

                        {accountOpen && (
                            <div
                                className={`absolute bottom-full mb-2 rounded-md border bg-white py-2 shadow-sm ${
                                    isCollapsed ? 'left-14 w-56' : 'left-0 right-0'
                                }`}
                                style={{ borderColor: BRAND.border }}
                            >
                                <div className="border-b px-4 py-3" style={{ borderColor: BRAND.border }}>
                                    <p className="truncate text-sm font-bold" style={{ color: BRAND.text }}>
                                        {user?.full_name || 'BHW User'}
                                    </p>
                                    <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]" style={{ color: BRAND.textSoft }}>
                                        Barangay {user?.assigned_barangay || 'Unassigned'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => navigate('/bhw/profile')}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-50"
                                    style={{ color: BRAND.textMuted }}
                                >
                                    <Settings className="h-4 w-4" />
                                    Account Settings
                                </button>
                                <div className="px-3 pt-2">
                                    <button
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-50"
                                    >
                                        <LogOut className="h-4 w-4" />
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="hidden border-t px-4 py-3 lg:block" style={{ borderColor: BRAND.border }}>
                    <button
                        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
                        className="flex w-full items-center justify-center rounded-md border px-3 py-2.5 text-sm font-bold transition-colors"
                        style={{
                            backgroundColor: BRAND.panelMuted,
                            borderColor: BRAND.border,
                            color: BRAND.textMuted
                        }}
                    >
                        {isCollapsed ? (
                            <ChevronRight className="h-5 w-5" />
                        ) : (
                            <>
                                <ChevronLeft className="mr-2 h-5 w-5" />
                                <span>Collapse Sidebar</span>
                            </>
                        )}
                    </button>
                </div>
            </aside>

            <div className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                <header
                    className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur-sm"
                    style={{ borderColor: BRAND.border }}
                >
                    <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsMobileOpen((open) => !open)}
                                className="rounded p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
                            >
                                {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                            </button>
                            <div>
                                <p className="text-sm font-medium" style={{ color: BRAND.textSoft }}>
                                    BHW Portal <span style={{ color: BRAND.text }} className="font-bold">/ {pageName}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
                    <div className="mx-auto max-w-7xl">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default BHWLayout;
