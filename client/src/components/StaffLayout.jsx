import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu } from 'lucide-react';
import SidebarNav from './SidebarNav';

/**
 * StaffLayout – Midwife / Nurse clinical portal shell.
 * Account dropdown (Settings + Sign Out) lives inside SidebarNav,
 * so we keep the top bar minimal: just the breadcrumb + mobile toggle.
 */
const StaffLayout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Sidebar state – persisted
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved ? JSON.parse(saved) : false;
    });
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    // RBAC: redirect non-Midwife/Nurse roles out of clinical layout
    useEffect(() => {
        if (user) {
            const allowedBhwRoutes = ['/clinical/infants', '/clinical/registrations'];
            const isBhwAllowedRoute = allowedBhwRoutes.some(route => location.pathname.startsWith(route));

            if (user.role === 'BHW' && !isBhwAllowedRoute) {
                navigate('/bhw/dashboard', { replace: true });
            } else if ((user.role === 'Admin' || user.role === 'Administrator')) {
                navigate('/admin/dashboard', { replace: true });
            }
        }
    }, [user, navigate, location.pathname]);

    if (user && user.role === 'BHW') {
        const allowedBhwRoutes = ['/clinical/infants', '/clinical/registrations'];
        const isBhwAllowedRoute = allowedBhwRoutes.some(route => location.pathname.startsWith(route));
        if (!isBhwAllowedRoute) {
            return null;
        }
    } else if (user && (user.role === 'Admin' || user.role === 'Administrator')) {
        return null;
    }

    // Derive human-readable page name for breadcrumb
    const pathParts = location.pathname.split('/').filter(Boolean);
    let lastPart = pathParts.pop() || 'Dashboard';
    
    // UUID detection (simple regex for 8-4-4-4-12)
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
            {/* Sidebar Navigation (account + collapse inside) */}
            <SidebarNav
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                isMobileOpen={isMobileOpen}
                setIsMobileOpen={setIsMobileOpen}
            />

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
                {/* Minimal Top Bar */}
                <nav className="sticky top-0 z-40 w-full h-14 bg-white/95 backdrop-blur-lg border-b border-slate-100 px-5 flex items-center gap-4 shadow-sm">
                    {/* Mobile hamburger */}
                    <button
                        onClick={() => setIsMobileOpen(true)}
                        className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                        <Menu size={22} />
                    </button>

                    {/* Breadcrumb */}
                    <div className="hidden sm:block">
                        <p className="text-sm text-slate-400 font-medium">
                            Clinical Portal{' '}
                            <span className="text-slate-700 font-bold">/ {pageName}</span>
                        </p>
                    </div>
                </nav>

                {/* Page Body */}
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
