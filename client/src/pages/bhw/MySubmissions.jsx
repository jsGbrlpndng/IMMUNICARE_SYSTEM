import { useState, useEffect } from 'react';
import {
    Search,
    Filter,
    Plus,
    FileEdit,
    Eye,
    AlertCircle,
    CheckCircle2,
    Clock
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';

const MySubmissions = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [infants, setInfants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    useEffect(() => {
        if (user) fetchSubmissions();
    }, [user]);

    const fetchSubmissions = async () => {
        try {
            const response = await apiClient.get('/registrations/my');
            if (response.ok) {
                const data = await response.json();
                setInfants(data.registrations || []);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching submissions:', error);
            setLoading(false);
        }
    };

    const filteredInfants = infants.filter(infant => {
        const matchesSearch =
            (infant.first_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (infant.last_name || '').toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = statusFilter === 'All' || 
            (statusFilter === 'Pending' && infant.status === 'PENDING_VALIDATION') ||
            (statusFilter === 'Draft' && infant.status === 'DRAFT') ||
            (statusFilter === 'Approved' && infant.status === 'APPROVED') ||
            (statusFilter === 'Needs Correction' && infant.status === 'NEEDS_CORRECTION');

        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'APPROVED': return 'bg-green-100 text-green-800';
            case 'PENDING_VALIDATION': return 'bg-blue-100 text-blue-800';
            case 'DRAFT': return 'bg-gray-100 text-gray-800';
            case 'NEEDS_CORRECTION': return 'bg-amber-100 text-amber-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'APPROVED': return CheckCircle2;
            case 'PENDING_VALIDATION': return Clock;
            case 'DRAFT': return FileEdit;
            case 'NEEDS_CORRECTION': return AlertCircle;
            default: return FileEdit;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Submissions</h1>
                    <p className="text-gray-500">Manage your infant registrations</p>
                </div>
                <Link
                    to="/bhw/register"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus className="w-5 h-5" />
                    Register New
                </Link>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                    {['All', 'Draft', 'Pending', 'Approved', 'Needs Correction'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`
                                px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                                ${statusFilter === status
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }
                            `}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Infant Name</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Date of Birth</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Last Updated</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">Loading records...</td>
                                </tr>
                            ) : filteredInfants.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500">No records found matching your criteria.</td>
                                </tr>
                            ) : (
                                filteredInfants.map((infant) => {
                                    const canEdit = infant.registration_status === 'Draft' || infant.registration_status === 'Needs Correction';
                                    const StatusIcon = getStatusIcon(infant.registration_status);

                                    return (
                                         <tr key={infant.id} className="hover:bg-gray-50 transition">
                                             <td className="px-6 py-4">
                                                 <div className="font-medium text-gray-900">{infant.first_name} {infant.last_name}</div>
                                                 <div className="text-xs text-gray-500">{infant.sex === 'M' ? 'Male' : 'Female'}</div>
                                             </td>
                                             <td className="px-6 py-4 text-gray-600">
                                                 {infant.dob ? new Date(infant.dob).toLocaleDateString() : 'N/A'}
                                             </td>
                                             <td className="px-6 py-4">
                                                 <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(infant.status)}`}>
                                                     <StatusIcon className="w-3.5 h-3.5" />
                                                     {infant.status === 'PENDING_VALIDATION' ? 'Pending Review' : 
                                                      infant.status === 'NEEDS_CORRECTION' ? 'Needs Correction' : 
                                                      infant.status === 'APPROVED' ? 'Approved' : infant.status}
                                                 </span>
                                             </td>
                                             <td className="px-6 py-4 text-gray-500 text-sm">
                                                 {new Date(infant.updated_at || infant.created_at).toLocaleDateString()}
                                             </td>
                                             <td className="px-6 py-4 text-right">
                                                 {infant.status === 'DRAFT' || infant.status === 'NEEDS_CORRECTION' ? (
                                                     <Link
                                                         to={`/bhw/register?id=${infant.id}`}
                                                         className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                                                     >
                                                         <FileEdit className="w-4 h-4" />
                                                         Edit
                                                     </Link>
                                                 ) : infant.status === 'APPROVED' ? (
                                                     <Link
                                                         to={`/bhw/infants/${infant.promoted_infant_id}`}
                                                         className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-100 transition"
                                                     >
                                                         <Eye className="w-4 h-4" />
                                                         View Profile
                                                     </Link>
                                                 ) : (
                                                     <Link
                                                         to={`/bhw/register?id=${infant.id}&view=true`}
                                                         className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                                                     >
                                                         <Eye className="w-4 h-4" />
                                                         View Details
                                                     </Link>
                                                 )}
                                             </td>
                                         </tr>
                                     );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default MySubmissions;
