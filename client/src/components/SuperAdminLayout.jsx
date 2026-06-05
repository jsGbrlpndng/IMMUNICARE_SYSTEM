import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BarChart3, FileText, Filter, LayoutDashboard, Menu, Settings, Target, Users } from 'lucide-react';
import SidebarNav from './SidebarNav';
import { useBarangayFilter } from '../contexts/BarangayFilterContext';
import { RHU2_BARANGAYS } from './reports/reportConfig';

const superAdminNavigation = [
    {
        group: 'Head Nurse Portal',
        items: [
            { name: 'Global Dashboard', path: '/superadmin/dashboard', icon: LayoutDashboard },
            { name: 'User Management', path: '/superadmin/users', icon: Users },
            { name: 'Target Configuration', path: '/superadmin/targets', icon: Target },
            { name: 'Municipal Reports', path: '/superadmin/reports', icon: BarChart3 },
            { name: 'Audit Trail', path: '/superadmin/audit', icon: FileText },
            { name: 'Account Settings', path: '/superadmin/account-settings', icon: Settings }
        ]
    }
];

const pageLabels = superAdminNavigation
    .flatMap((group) => group.items)
    .reduce((labels, item) => ({ ...labels, [item.path]: item.name }), {});

const SuperAdminLayout = ({ children }) => {
    const location = useLocation();
    const { selectedBarangay, setSelectedBarangay } = useBarangayFilter();
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('superadmin-sidebar-collapsed');
        return saved ? JSON.parse(saved) : false;
    });
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('superadmin-sidebar-collapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    const pageName = pageLabels[location.pathname] || 'Head Nurse Portal';

    useEffect(() => {
        document.title = `ImmuniCare - ${pageName}`;
    }, [pageName]);

    return (
        <div className="flex min-h-screen bg-[#F8FAFC]">
            <SidebarNav
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
                navItems={superAdminNavigation}
                accountSettingsPath="/superadmin/account-settings"
                brandSubtitle="HEAD NURSE"
                logoutRedirectPath="/portal"
            />

            <div className={`flex flex-1 flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                <nav className="sticky top-0 z-40 flex h-14 w-full items-center justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 shadow-sm backdrop-blur-lg">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => setIsMobileOpen(true)}
                            className="-ml-2 p-2 text-slate-500 transition-colors hover:bg-slate-50 lg:hidden"
                            aria-label="Open sidebar"
                        >
                            <Menu size={22} />
                        </button>

                        <div className="hidden sm:block">
                            <p className="text-sm font-medium text-slate-400">
                                Super Admin Portal <span className="font-bold text-slate-700">/ {pageName}</span>
                            </p>
                        </div>
                    </div>

                    <div className="hidden items-center border border-slate-200 bg-slate-50 px-3 py-1.5 lg:flex">
                        <Filter size={14} className="mr-2 text-[#064E3B]" />
                        <span className="mr-2 border-r border-slate-200 pr-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                            Global Filter
                        </span>
                        <select
                            value={selectedBarangay}
                            onChange={(event) => setSelectedBarangay(event.target.value)}
                            className="min-w-[210px] border-0 bg-transparent py-0 text-xs font-black uppercase text-slate-700 outline-none focus:ring-0"
                        >
                            <option value="all">All RHU 2 Barangays</option>
                            {RHU2_BARANGAYS.map((barangay) => (
                                <option key={barangay} value={barangay}>{barangay}</option>
                            ))}
                        </select>
                    </div>
                </nav>

                <main className="flex-1">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default SuperAdminLayout;
