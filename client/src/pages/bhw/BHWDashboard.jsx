import { useState, useEffect } from 'react';
import {
    FileEdit,
    Clock,
    CheckCircle2,
    AlertCircle,
    Plus,
    ChevronRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';

const BHWDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        drafts: 0,
        pending: 0,
        approved: 0,
        needsCorrection: 0
    });
    const [recentInfants, setRecentInfants] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, [user]);

    const fetchDashboardData = async () => {
        if (!user) return;
        try {
            // 1. Fetch Stats from the new endpoint
            const statsRes = await apiClient.get('/registrations/stats');
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData.stats || {
                    drafts: 0,
                    pending: 0,
                    approved: 0,
                    needs_correction: 0
                });
            }

            // 2. Fetch Recent Submissions
            const submissionsRes = await apiClient.get('/registrations/my');
            if (submissionsRes.ok) {
                const subData = await submissionsRes.json();
                const items = subData.registrations || [];
                setRecentInfants(items.slice(0, 5));
            }

            setLoading(false);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
    }

    const statCards = [
        {
            label: 'Drafts',
            value: stats.drafts,
            icon: FileEdit,
            color: 'bg-gray-100 text-gray-600',
            desc: 'Incomplete registrations'
        },
        {
            label: 'Pending Validation',
            value: stats.pending,
            icon: Clock,
            color: 'bg-blue-100 text-blue-600',
            desc: 'Waiting for midwife'
        },
        {
            label: 'Approved',
            value: stats.approved,
            icon: CheckCircle2,
            color: 'bg-green-100 text-green-600',
            desc: 'Successfully registered'
        },
        {
            label: 'Needs Correction',
            value: stats.needs_correction || 0,
            icon: AlertCircle,
            color: 'bg-red-100 text-red-600',
            desc: 'Returned by midwife'
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-500">Welcome back, {user?.full_name}</p>
                </div>
                <Link
                    to="/bhw/register"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus className="w-5 h-5" />
                    Register New Infant
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center justify-between">
                                <div className={`p-3 rounded-lg ${stat.color}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <span className="text-2xl font-bold text-gray-900">{stat.value}</span>
                            </div>
                            <h3 className="mt-4 font-medium text-gray-900">{stat.label}</h3>
                            <p className="text-sm text-gray-500">{stat.desc}</p>
                        </div>
                    );
                })}
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-900">Recent Registrations</h2>
                    <Link to="/bhw/submissions" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        View All <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
                <div className="divide-y divide-gray-100">
                    {recentInfants.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No recent registrations found.
                        </div>
                    ) : (
                        recentInfants.map((infant) => (
                            <div key={infant.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition group">
                                <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => {
                                    const status = infant.status === 'PENDING_VALIDATION' ? 'Pending' :
                                                   infant.status === 'NEEDS_CORRECTION' ? 'Needs Correction' :
                                                   infant.status === 'APPROVED' ? 'Approved' : infant.status;
                                    
                                    if (status === 'Pending' || status === 'Needs Correction' || status === 'DRAFT' || status === 'Draft') {
                                        navigate(`/bhw/registrations/${infant.id}`);
                                    } else if (status === 'Approved') {
                                        const reference_number = infant.reference_id || infant.promoted_infant_id;
                                        navigate(`/bhw/infants/${reference_number}`);
                                    }
                                }}>
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                                        {infant.first_name[0]}{infant.last_name[0]}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 group-hover:text-blue-600 transition">{infant.first_name} {infant.last_name}</p>
                                        <p className="text-sm text-gray-500">Born {new Date(infant.dob).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`
                                            px-3 py-1 rounded-full text-xs font-medium
                                            ${infant.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                                              infant.status === 'PENDING_VALIDATION' ? 'bg-blue-100 text-blue-800' :
                                              infant.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                                              'bg-red-100 text-red-800'}
                                        `}>
                                        {infant.status === 'PENDING_VALIDATION' ? 'Pending' : infant.status}
                                    </span>
                                    {infant.status === 'DRAFT' || infant.status === 'NEEDS_CORRECTION' ? (
                                        <Link to={`/bhw/registrations/${infant.id}`} className="text-blue-600 hover:underline text-sm font-semibold uppercase tracking-wider">
                                            Continue
                                        </Link>
                                    ) : (
                                        <Link to={infant.status === 'APPROVED' ? `/bhw/infants/${infant.reference_id || infant.promoted_infant_id}` : `/bhw/registrations/${infant.id}`} className="p-2 text-gray-400 hover:text-blue-600 rounded-full hover:bg-blue-50 transition">
                                            <ChevronRight className="w-5 h-5" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default BHWDashboard;
