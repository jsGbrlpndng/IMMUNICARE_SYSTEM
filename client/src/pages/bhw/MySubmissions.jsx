import React, { useEffect, useState } from 'react';
import {
    Search,
    Plus,
    FileEdit,
    Eye,
    AlertCircle,
    CheckCircle2,
    Clock3,
    ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_FILTERS = ['All', 'Draft', 'Pending', 'Approved', 'Needs Correction'];

const MySubmissions = () => {
    const { user } = useAuth();
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

    const filteredInfants = infants.filter((infant) => {
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

    const getStatusIcon = (status) => {
        switch (status) {
            case 'APPROVED':
                return CheckCircle2;
            case 'PENDING_VALIDATION':
                return Clock3;
            case 'NEEDS_CORRECTION':
                return AlertCircle;
            case 'DRAFT':
            default:
                return FileEdit;
        }
    };

    const getStatusClasses = (status) => {
        switch (status) {
            case 'APPROVED':
                return 'bg-[#E9F6F0] text-[#0B6E4F]';
            case 'PENDING_VALIDATION':
                return 'bg-amber-50 text-amber-700';
            case 'NEEDS_CORRECTION':
                return 'bg-rose-50 text-rose-700';
            case 'DRAFT':
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'PENDING_VALIDATION':
                return 'Pending Review';
            case 'NEEDS_CORRECTION':
                return 'Needs Correction';
            case 'APPROVED':
                return 'Approved';
            default:
                return status;
        }
    };

    const getRegistrationRoute = (infant) => `/bhw/registrations/${infant.id}`;

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0B6E4F]">
                        Registration Management
                    </p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                        My Submissions
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        Review staged infant registrations under your barangay workflow.
                    </p>
                </div>

                <Link
                    to="/bhw/register"
                    className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#084C39] px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-colors hover:bg-[#07362A]"
                >
                    <Plus className="h-5 w-5" />
                    Register New
                </Link>
            </section>

            <section className="rounded border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by infant name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white py-2.5 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                        />
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
                        {STATUS_FILTERS.map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`whitespace-nowrap rounded px-4 py-2 text-sm font-bold transition-colors ${
                                    statusFilter === status
                                        ? 'bg-[#084C39] text-white hover:bg-[#07362A]'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[840px] text-left">
                        <thead className="border-b border-slate-200 bg-slate-50">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Infant Name</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date of Birth</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Last Updated</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                                        Loading records...
                                    </td>
                                </tr>
                            ) : filteredInfants.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                                        No records found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredInfants.map((infant) => {
                                    const StatusIcon = getStatusIcon(infant.status);
                                    const statusLabel = getStatusLabel(infant.status);
                                    const actionLabel = infant.status === 'DRAFT' || infant.status === 'NEEDS_CORRECTION' ? 'Continue' : 'Open';

                                    return (
                                        <tr key={infant.id} className="transition-colors hover:bg-slate-50">
                                            <td className="px-6 py-5">
                                                <div className="font-bold text-slate-900">
                                                    {infant.first_name} {infant.last_name}
                                                </div>
                                                <div className="mt-1 text-xs font-medium text-slate-500">
                                                    {infant.sex === 'M' ? 'Male' : 'Female'}
                                                </div>
                                            </td>

                                            <td className="px-6 py-5 text-sm font-medium text-slate-700">
                                                {infant.dob ? new Date(infant.dob).toLocaleDateString() : 'N/A'}
                                            </td>

                                            <td className="px-6 py-5">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${getStatusClasses(infant.status)}`}>
                                            <StatusIcon className="h-3.5 w-3.5" />
                                            {statusLabel}
                                        </span>
                                            </td>

                                            <td className="px-6 py-5 text-sm font-medium text-slate-500">
                                                {new Date(infant.updated_at || infant.created_at).toLocaleDateString()}
                                            </td>

                                            <td className="px-6 py-5 text-right">
                                                <Link
                                                    to={getRegistrationRoute(infant)}
                                                    className={`inline-flex items-center gap-1 rounded px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${
                                                        actionLabel === 'Open'
                                                            ? 'border border-[#084C39] bg-[#084C39] text-white hover:bg-[#07362A]'
                                                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {infant.status === 'DRAFT' || infant.status === 'NEEDS_CORRECTION' ? (
                                                        <FileEdit className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                    {actionLabel}
                                                    <ChevronRight className="h-4 w-4" />
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default MySubmissions;
