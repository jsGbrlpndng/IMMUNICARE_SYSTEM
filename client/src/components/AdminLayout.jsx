import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BarChart2, FileText, LayoutDashboard, Map as MapIcon, Menu, Users, Layers, Settings } from 'lucide-react';
import SidebarNav from './SidebarNav';

const adminNavigation = [
    {
        group: 'Administration',
        items: [
            { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
            { name: 'Population Heatmap', path: '/admin/population-heatmap', icon: Layers },
            { name: 'Spatial Analysis', path: '/admin/spatial-analysis', icon: MapIcon },
            { name: 'M1 Reports', path: '/admin/reports/m1', icon: BarChart2 },
            { name: 'User Management', path: '/admin/users', icon: Users },
            { name: 'Audit Logs', path: '/admin/audit', icon: FileText },
            { name: 'Account Settings', path: '/admin/account-settings', icon: Settings }
        ]
    }
];

const AdminLayout = ({ children }) => {
    const location = useLocation();
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('admin-sidebar-collapsed');
        return saved ? JSON.parse(saved) : false;
    });
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('admin-sidebar-collapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    const pathParts = location.pathname.split('/').filter(Boolean);
    const pageName = (pathParts.pop() || 'Dashboard')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());

    useEffect(() => {
        document.title = `ImmuniCare - ${pageName}`;
    }, [pageName]);

    return (
        <div className="flex min-h-screen overflow-x-hidden bg-[#F8FAFC]">
            <SidebarNav
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
                navItems={adminNavigation}
                accountSettingsPath="/admin/account-settings"
                logoutRedirectPath="/portal"
            />

            <div className={`flex min-w-0 flex-1 flex-col overflow-x-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                <nav className="sticky top-0 z-40 w-full h-14 bg-white/95 backdrop-blur-lg border-b border-slate-100 px-5 flex items-center gap-4 shadow-sm">
                    <button
                        onClick={() => setIsMobileOpen(true)}
                        className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                        <Menu size={22} />
                    </button>

                    <div className="hidden sm:block">
                        <p className="text-sm text-slate-400 font-medium">
                            Admin Portal <span className="text-slate-700 font-bold">/ {pageName}</span>
                        </p>
                    </div>
                </nav>

                <main className="flex min-w-0 flex-1 overflow-x-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
