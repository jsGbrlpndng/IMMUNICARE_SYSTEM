import { useState, useEffect } from 'react';
import {
    Users,
    ShieldAlert,
    FileText,
    Activity,
    TrendingUp,
    Shield,
    AlertCircle,
    CheckCircle2,

    Clock
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';

const AdminDashboard = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        total_users: 0,
        pending_approvals: 0,
        registered_infants: 0,
        overdue_cases: 0,
        approved_overrides: 0,
        active_rules: 0,
        system_health: 'Loading...'
    });
    const [loading, setLoading] = useState(true);
    const [auditLogs, setAuditLogs] = useState([]);

    useEffect(() => {
        if (user) {
            fetchDashboardData();
        }
    }, [user]);

    const fetchDashboardData = async () => {
        if (!user) return;
        try {
            setLoading(true);
            
            const statsRes = await apiClient.get('/admin/dashboard/stats');
            const statsData = await statsRes.json();

            const auditsRes = await apiClient.get('/admin/audit/system');
            const auditsData = await auditsRes.json();

            if (statsRes.ok) setStats(statsData);
            if (auditsRes.ok) setAuditLogs(auditsData.logs?.slice(0, 10) || []);

        } catch (error) {
            console.error('Error fetching admin dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const StatCard = ({ title, value, icon: Icon }) => (
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm shadow-slate-100/50">
            <div className="flex items-center space-x-4">
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <Icon className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                        {loading ? <div className="h-7 w-16 bg-slate-50 rounded animate-pulse" /> : value}
                    </h3>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bg-white p-6 rounded-lg border border-slate-200">
                <h1 className="text-2xl font-bold text-slate-900">System Governance</h1>
                <p className="text-sm text-slate-500 mt-1 uppercase tracking-tighter font-medium">Real-time status overview</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Active Staff"
                    value={stats.total_users}
                    icon={Users}
                />
                <StatCard
                    title="Pending Reg"
                    value={stats.pending_approvals}
                    icon={ShieldAlert}
                />
                <StatCard
                    title="Infants"
                    value={stats.registered_infants}
                    icon={Users}
                />
                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm shadow-slate-100/50">
                    <div className="flex items-center space-x-4">
                        <div className={`p-2.5 rounded-lg border ${stats.system_health === 'Operating Normally' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <Activity className={`w-5 h-5 ${stats.system_health === 'Operating Normally' ? 'text-emerald-600' : 'text-red-600'}`} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Health</p>
                            <h3 className={`text-sm font-bold mt-1 ${stats.system_health === 'Operating Normally' ? 'text-emerald-700' : 'text-red-700'}`}>
                                {loading ? '...' : stats.system_health}
                            </h3>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Recent System Activity */}
                <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Admin Action Logs</h2>
                        <FileText className="w-4 h-4 text-slate-400" />
                    </div>

                    <div className="divide-y divide-slate-100">
                        {loading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-50/30 animate-pulse" />)
                        ) : auditLogs.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 text-sm italic">
                                No admin activity yet
                            </div>
                        ) : (
                            auditLogs.map((log) => (
                                <div key={log.id} className="p-4 hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-600 rounded">
                                                {log.action_type}
                                            </span>
                                            <span className="text-sm font-semibold text-slate-900">{log.target_entity}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Staff ID: <span className="text-slate-700 font-bold">{log.admin_id}</span> updated configuration.
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Summary Panel */}
                <div className="space-y-6">
                    <div className="bg-white rounded-lg border border-slate-200">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Compliance Status</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600">Overdue Cases</span>
                                <span className="text-sm font-bold text-red-600">{stats.overdue_cases}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600">Approved Overrides</span>
                                <span className="text-sm font-bold text-emerald-600">{stats.approved_overrides}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600">Active Governance Rules</span>
                                <span className="text-sm font-bold text-slate-900">{loading ? '...' : stats.active_rules}</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400 uppercase font-bold text-center italic">
                                Source: National Immunization Program (NIP)
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
