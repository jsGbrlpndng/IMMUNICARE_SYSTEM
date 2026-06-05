import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Search,
    User,
    Calendar,
    MapPin,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Filter,
    Users,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Activity,
    Clock,
    FileText,
    ShieldCheck,
    Plus,
    Phone
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatFullNameFromObject } from '../../utils/formatFullName';

/**
 * InfantRegistry - Master clinical directory with server-side pagination and search.
 * Uses Automated NIP Schedule Engine for dynamic status tracking.
 * Phase 4: Integrated intake pipeline visibility and registration gating.
 */
export default function InfantRegistry() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    
    const [infants, setInfants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ totalRecords: 0, totalPages: 1 });
    const [view, setView] = useState('Active');
    const [statusFilter, setStatusFilter] = useState('APPROVED,PENDING_VALIDATION,NEEDS_CORRECTION');
    const [confirmArchiveInfant, setConfirmArchiveInfant] = useState(null);
    const [archiveReason, setArchiveReason] = useState('');
    const [archiveNotes, setArchiveNotes] = useState('');
    const [archiveError, setArchiveError] = useState('');
    const [updatingStatusId, setUpdatingStatusId] = useState(null);
    const limit = 15;
    
    // Parse urgency from URL search params safely
    const urgencyFilter = useMemo(() => {
        if (!location?.search) return '';
        const params = new URLSearchParams(location.search);
        return params.get('urgency') || '';
    }, [location?.search]);

    // Fetch data from backend
    const fetchRegistry = useCallback(async (search = '', currentPage = 1, registrationStatus = '', urgency = '', lifecycleStatus = 'Active') => {
        setLoading(true);
        try {
            const statusParam = `&status=${encodeURIComponent(lifecycleStatus || 'Active')}`;
            const registrationStatusParam = registrationStatus ? `&registration_status=${registrationStatus}` : '';
            const urgencyParam = urgency ? `&urgency=${urgency}` : '';
            const res = await apiClient.get(`/infants?search=${encodeURIComponent(search)}&page=${currentPage}&limit=${limit}${statusParam}${registrationStatusParam}${urgencyParam}`);
            if (res.ok) {
                const data = await res.json();
                setInfants(data.infants);
                setMeta(data.pagination);
            }
        } catch (error) {
            console.error('Registry Fetch Error:', error);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    // Debounced search effect
    useEffect(() => {
        const timeout = setTimeout(() => {
            fetchRegistry(searchTerm, 1, statusFilter, urgencyFilter, view);
            setPage(1);
        }, 500);
        return () => clearTimeout(timeout);
    }, [searchTerm, statusFilter, urgencyFilter, view, fetchRegistry]);

    // Page change handler
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= meta.totalPages) {
            setPage(newPage);
            fetchRegistry(searchTerm, newPage, statusFilter, urgencyFilter, view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleViewChange = (nextView) => {
        setView(nextView);
        setPage(1);
    };

    const refreshCurrentView = () => fetchRegistry(searchTerm, page, statusFilter, urgencyFilter, view);

    const archiveRecord = async () => {
        if (!confirmArchiveInfant?.id || !archiveReason) return;
        setUpdatingStatusId(confirmArchiveInfant.id);
        setArchiveError('');
        try {
            const res = await apiClient.put(`/infants/${confirmArchiveInfant.id}`, {
                status: 'Archived',
                archive_reason: archiveReason,
                archive_notes: archiveNotes
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.message || errorData.error || 'Failed to archive record');
            }
            setConfirmArchiveInfant(null);
            setArchiveReason('');
            setArchiveNotes('');
            setArchiveError('');
            await refreshCurrentView();
        } catch (error) {
            setArchiveError(error.message || 'Failed to archive record');
        } finally {
            setUpdatingStatusId(null);
        }
    };

    const restoreRecord = async (infant) => {
        if (!infant?.id) return;
        setUpdatingStatusId(infant.id);
        try {
            const res = await apiClient.put(`/infants/${infant.id}`, { status: 'Active' });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to restore record');
            await refreshCurrentView();
        } catch (error) {
            alert(error.message);
        } finally {
            setUpdatingStatusId(null);
        }
    };

    // Clinical Risk Tier Mapping
    const getRiskTierBadge = (urgency) => {
        switch (urgency) {
            case 'defaulter':
                return (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                        <span className="text-red-600 font-black text-[10px] tracking-wider uppercase">High Risk</span>
                    </div>
                );
            case 'overdue':
            case 'due_today':
            case 'due_soon':
                return (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-orange-600 font-black text-[10px] tracking-wider uppercase">Medium Risk</span>
                    </div>
                );
            default:
                return (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-emerald-600 font-black text-[10px] tracking-wider uppercase">Low Risk</span>
                    </div>
                );
        }
    };

    // Registration Status Badge
    const getRegStatusBadge = (status) => {
        switch (status) {
            case 'APPROVED':
                return (
                    <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        <ShieldCheck className="w-3 h-3" /> APPROVED
                    </div>
                );
            case 'PENDING_VALIDATION':
                return (
                    <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                        <Clock className="w-3 h-3" /> PENDING REVIEW
                    </div>
                );
            case 'NEEDS_CORRECTION':
                return (
                    <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        <RefreshCw className="w-3 h-3" /> REVISION
                    </div>
                );
            case 'DRAFT':
                return (
                    <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <FileText className="w-3 h-3" /> DRAFT
                    </div>
                );
            default:
                return null;
        }
    };

    // Dynamic NIP Status Badge Mapping
    const getStatusBadge = (infant) => {
        const urgency = infant.urgency;
        const computedStatus = infant.computed_schedule_status;
        const days = infant.days_overdue || 0;

        switch (urgency) {
            case 'defaulter':
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white border border-red-700 flex items-center gap-1.5 w-fit">
                        <AlertCircle className="w-3 h-3" /> Defaulter
                    </span>
                );
            case 'overdue':
                if (days > 42 || computedStatus === 'DEFAULTER') {
                    return (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white border border-red-700 flex items-center gap-1.5 w-fit">
                            <AlertCircle className="w-3 h-3" /> Defaulter
                        </span>
                    );
                }
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-red-700 border border-red-100 flex items-center gap-1.5 w-fit">
                        <AlertCircle className="w-3 h-3" /> Overdue
                    </span>
                );
            case 'due_today':
            case 'due_soon':
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1.5 w-fit">
                        <Clock className="w-3 h-3" /> Due Soon
                    </span>
                );
            case 'completed':
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> Fully Immunized
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-1.5 w-fit">
                        <Activity className="w-3 h-3" /> On Track
                    </span>
                );
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="clinical-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">

                        <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 tracking-tight leading-none">
                                Infant Registry
                            </h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Master Clinical Directory</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">

                        {user?.role === 'BHW' && (
                            <button
                                onClick={() => navigate('/bhw/register')}
                                className="bg-emerald-800 hover:bg-emerald-900 text-white px-5 py-3 rounded-md flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-900/10 transition-all active:scale-95 w-full md:w-auto mb-2 md:mb-0"
                            >
                                <Plus className="w-4 h-4" />
                                Register New Infant
                            </button>
                        )}
                        
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search registry..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-4 focus:ring-emerald-800/10 focus:border-emerald-800 transition-all outline-none font-bold text-slate-700 text-sm"
                            />
                        </div>

                        <select 
                            value={urgencyFilter}
                            onChange={(e) => {
                                const newParams = new URLSearchParams(location.search);
                                if (e.target.value) newParams.set('urgency', e.target.value);
                                else newParams.delete('urgency');
                                navigate(`${location.pathname}?${newParams.toString()}`);
                            }}
                            className="bg-white border-2 border-slate-100 px-4 py-3 rounded-md text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:border-emerald-800"
                        >
                            <option value="">All Health Status</option>
                            <option value="defaulter">Defaulters</option>
                            <option value="due_today">Due Today</option>
                            <option value="due_soon">Due Soon</option>
                            <option value="upcoming">On Track</option>
                        </select>

                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-white border-2 border-slate-100 px-4 py-3 rounded-md text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:border-emerald-800"
                        >
                            <option value="APPROVED,PENDING_VALIDATION,NEEDS_CORRECTION">All Process Stages</option>
                            <option value="APPROVED">Approved Only</option>
                            <option value="PENDING_VALIDATION">Pending Only</option>
                            <option value="NEEDS_CORRECTION">Needs Correction</option>
                            <option value="DRAFT">My Drafts</option>
                        </select>

                    </div>
                </div>
            </div>

            <div className="flex w-fit overflow-hidden rounded-md border border-slate-200 bg-white">
                {['Active', 'Archived'].map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => handleViewChange(tab)}
                        className={`px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                            view === tab
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                    >
                        {tab === 'Active' ? 'Active Roster' : 'Archived Records'}
                    </button>
                ))}
            </div>

            {/* Main Table Content */}
            <div className="clinical-card !p-0 overflow-hidden flex flex-col max-h-[600px] border border-slate-200 shadow-xl shadow-slate-200/40">
                <div className="overflow-y-auto custom-scrollbar flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur shadow-sm">
                            <tr className="border-b border-slate-200">
                                <th className="clinical-table-th">Patient Details</th>
                                <th className="clinical-table-th">Caregiver & Locality</th>
                                <th className="clinical-table-th">Next Due Vaccine</th>
                                <th className="clinical-table-th">Risk Tier</th>
                                <th className="clinical-table-th text-right">Clinical Action</th>
                            </tr>

                        </thead>
                        <tbody className="divide-y divide-slate-100 uppercase text-[11px] font-bold">
                            {loading ? (
                                Array(6).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={7} className="px-4 py-3 bg-slate-50/50 h-10" />
                                    </tr>
                                ))
                            ) : infants.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                                <Search size={32} className="text-slate-200" />
                                            </div>
                                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No infants found</h3>
                                            <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                                {view === 'Archived'
                                                    ? 'No archived infant records match the current selection.'
                                                    : 'Try adjusting your search terms or filters. No infants match the current health status or process stage selection.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                infants.map((infant) => (
                                    <tr
                                        key={infant.id}
                                        onClick={() => {
                                            if (view !== 'Archived' && infant.status !== 'Archived') {
                                                navigate(`/clinical/registry/${infant.id}`);
                                            }
                                        }}
                                        className="hover:bg-emerald-50/40 transition-all cursor-pointer group border-l-4 border-transparent hover:border-emerald-800"
                                    >
                                        <td className="clinical-table-td py-5">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-slate-900 text-sm font-black group-hover:text-emerald-800 transition-colors leading-none uppercase">
                                                    {formatFullNameFromObject(infant)}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    REF: {infant.reference_id} &bull; DOB: {new Date(infant.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>

                                            </div>
                                        </td>

                                        <td className="clinical-table-td py-5">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-slate-700 text-[11px] font-black leading-none uppercase">
                                                    {infant.mothers_maiden_name || infant.mother_name || infant.guardian_name || 'Caregiver Pending'}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight italic">
                                                    {infant.barangay}, {infant.purok}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="clinical-table-td py-5">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                                    {infant.next_due_vaccine || (infant.computed_schedule_status === 'COMPLETED' ? 'Completed' : 'No Active Dose')}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {infant.next_due_date
                                                        ? new Date(infant.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                        : (infant.computed_schedule_status === 'COMPLETED' ? 'All schedule rows complete' : 'Awaiting schedule data')}
                                                </span>

                                            </div>
                                        </td>

                                        <td className="clinical-table-td py-5">
                                                    {getRiskTierBadge(infant.urgency)}
                                                    <div className="mt-2">{getStatusBadge(infant)}</div>
                                                </td>

                                        <td className="clinical-table-td py-5 text-right">
                                            {view === 'Archived' || infant.status === 'Archived' ? (
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/clinical/registry/${infant.id}`);
                                                        }}
                                                        className="border border-slate-300 bg-white px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest text-slate-700 transition-all hover:bg-slate-50 active:scale-95 whitespace-nowrap"
                                                    >
                                                        View Profile
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            restoreRecord(infant);
                                                        }}
                                                        disabled={updatingStatusId === infant.id}
                                                        className="border border-emerald-800 bg-white px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest text-emerald-800 transition-all hover:bg-emerald-50 active:scale-95 disabled:opacity-60 whitespace-nowrap"
                                                    >
                                                        {updatingStatusId === infant.id ? 'Restoring...' : 'Restore Record'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/clinical/registry/${infant.id}`);
                                                        }}
                                                        className="bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap"
                                                    >
                                                        Manage Record
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfirmArchiveInfant(infant);
                                                            setArchiveReason('');
                                                            setArchiveNotes('');
                                                            setArchiveError('');
                                                        }}
                                                        className="border border-slate-300 bg-white px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest text-slate-700 transition-all hover:bg-slate-50 active:scale-95 whitespace-nowrap"
                                                    >
                                                        Archive Record
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}

                        </tbody>
                    </table>
                </div>

                {/* Professional Pagination Controls */}
                <div className="px-6 py-5 bg-slate-50/80 backdrop-blur border-t border-slate-200 flex items-center justify-between">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Node {Math.min(meta.totalRecords, (page - 1) * limit + 1)}-{Math.min(meta.totalRecords, page * limit)} / Total {meta.totalRecords}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            disabled={page === 1 || loading}
                            onClick={() => handlePageChange(page - 1)}
                            className="p-2.5 bg-white border border-slate-200 rounded-md hover:shadow-md disabled:opacity-30 transition-all text-slate-600"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-1.5">
                            {[...Array(meta.totalPages)].map((_, i) => (
                                <button
                                    key={i + 1}
                                    onClick={() => handlePageChange(i + 1)}
                                    className={`w-9 h-9 rounded-md text-[10px] font-black transition-all ${
                                        page === i + 1 
                                            ? 'bg-emerald-800 text-white shadow-lg shadow-emerald-900/20 scale-110' 
                                            : 'bg-white border border-slate-200 text-slate-500 hover:border-emerald-800 hover:text-emerald-800'
                                    }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>

                        <button
                            disabled={page === meta.totalPages || loading}
                            onClick={() => handlePageChange(page + 1)}
                            className="p-2.5 bg-white border border-slate-200 rounded-md hover:shadow-md disabled:opacity-30 transition-all text-slate-600"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {confirmArchiveInfant && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 px-4">
                    <div className="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-6 py-5">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-amber-100 bg-amber-50 text-amber-700">
                                    <AlertCircle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-900">Archive Record</h3>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        {formatFullNameFromObject(confirmArchiveInfant)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <form id="archive-record-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); archiveRecord(); }}>
                                <p className="text-sm font-semibold leading-6 text-slate-700">
                                    Are you sure you want to archive this record? It will be removed from all active reports and follow-up queues.
                                </p>
                                {archiveError && (
                                    <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold leading-5 text-rose-800">
                                        {archiveError}
                                    </div>
                                )}
                                <label className="block">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Archive Reason</span>
                                    <select
                                        required
                                        value={archiveReason}
                                        onChange={(event) => setArchiveReason(event.target.value)}
                                        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-800"
                                    >
                                        <option value="">Select archive reason</option>
                                        <option value="Relocated / Moved Away">Relocated / Moved Away</option>
                                        <option value="Deceased">Deceased</option>
                                        <option value="Duplicate Record">Duplicate Record</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Archive Notes</span>
                                    <textarea
                                        value={archiveNotes}
                                        onChange={(event) => setArchiveNotes(event.target.value)}
                                        rows={4}
                                        className="mt-2 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-800"
                                        placeholder="Add supporting context for the archive action."
                                    />
                                </label>
                            </form>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmArchiveInfant(null);
                                    setArchiveReason('');
                                    setArchiveNotes('');
                                    setArchiveError('');
                                }}
                                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="archive-record-form"
                                disabled={updatingStatusId === confirmArchiveInfant.id || !archiveReason}
                                className="rounded-md bg-rose-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-rose-800 disabled:opacity-60"
                            >
                                {updatingStatusId === confirmArchiveInfant.id ? 'Archiving...' : 'Confirm Archive'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
