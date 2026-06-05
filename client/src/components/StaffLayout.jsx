import React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BarChart2, CalendarDays, ClipboardList, Map as MapIcon, Menu, MessageSquare, Settings, ShieldCheck, LayoutDashboard } from 'lucide-react';
import SidebarNav from './SidebarNav';

const clinicalNavigation = [
    {
        group: 'Clinical',
        items: [
            { name: 'Dashboard', path: '/clinical/dashboard', icon: LayoutDashboard },
            { name: 'Infant Registry', path: '/clinical/registry', icon: ClipboardList },
            { name: 'Validation', path: '/clinical/validation', icon: ShieldCheck },
            { name: 'NIP Schedule', path: '/clinical/schedule', icon: CalendarDays }
        ]
    },
    {
        group: 'Insights',
        items: [
            { name: 'Reports', path: '/clinical/reports', icon: BarChart2 },
            { name: 'Heatmap', path: '/clinical/map', icon: MapIcon },
            { name: 'Follow-Ups', path: '/clinical/follow-ups', icon: ClipboardList }
        ]
    },
    {
        group: 'Messaging',
        items: [
            { name: 'SMS', path: '/clinical/sms', icon: MessageSquare }
        ]
    },
    {
        group: 'Security',
        items: [
            { name: 'Account Settings', path: '/clinical/profile', icon: Settings }
        ]
    }
];

/**
 * StaffLayout - Midwife clinical portal shell.
 * Route authorization is handled by App.jsx / ProtectedRoute.
 */
const StaffLayout = ({ children }) => {
    const location = useLocation();

    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved ? JSON.parse(saved) : false;
    });
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    const pathParts = location.pathname.split('/').filter(Boolean);
    let lastPart = pathParts.pop() || 'Dashboard';

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(lastPart)) {
        lastPart = 'Patient Record';
    }

    const pageName = lastPart
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    useEffect(() => {
        document.title = `ImmuniCare - ${pageName}`;
    }, [pageName]);

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex">
            <SidebarNav
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
                navItems={clinicalNavigation}
                accountSettingsPath="/clinical/profile"
                logoutRedirectPath="/portal"
            />

            <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                <nav className="sticky top-0 z-40 w-full h-14 bg-white/95 backdrop-blur-lg border-b border-slate-100 px-5 flex items-center gap-4 shadow-sm">
                    <button
                        onClick={() => setIsMobileOpen(true)}
                        className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                        <Menu size={22} />
                    </button>

                    <div className="hidden sm:block">
                        <p className="text-sm text-slate-400 font-medium">
                            Clinical Portal <span className="text-slate-700 font-bold">/ {pageName}</span>
                        </p>
                    </div>
                </nav>

                <main className={`flex-1 ${location.pathname === '/clinical/map' ? '' : 'p-5 lg:p-8'}`}>
                    <div className={location.pathname === '/clinical/map' ? 'h-full w-full' : 'max-w-7xl mx-auto'}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default StaffLayout;
