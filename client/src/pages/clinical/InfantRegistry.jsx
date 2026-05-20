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

/**
 * InfantRegistry – Master clinical directory with server-side pagination and search.
 * Uses Automated NIP Schedule Engine for dynamic status tracking.
 * Phase 4: Integrated intake pipeline visibility and registration gating.
 */
export default function InfantRegistry() {
    const navigate = useNavigate();
    const location = useLocation();
    
    const [infants, setInfants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ totalRecords: 0, totalPages: 1 });
    const [statusFilter, setStatusFilter] = useState('VALIDATED,PENDING_VALIDATION,NEEDS_REVISION');
    const limit = 15;
    
    // Parse urgency from URL search params safely
    const urgencyFilter = useMemo(() => {
        if (!location?.search) return '';
        const params = new URLSearchParams(location.search);
        return params.get('urgency') || '';
    }, [location?.search]);

    // Fetch data from backend
    const fetchRegistry = useCallback(async (search = '', currentPage = 1, status = '', urgency = '') => {
        setLoading(true);
        try {
            const statusParam = status ? `&status=${status}` : '';
            const urgencyParam = urgency ? `&urgency=${urgency}` : '';
            const res = await apiClient.get(`/infants?search=${encodeURIComponent(search)}&page=${currentPage}&limit=${limit}${statusParam}${urgencyParam}`);
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
            fetchRegistry(searchTerm, 1, statusFilter, urgencyFilter);
            setPage(1);
        }, 500);
        return () => clearTimeout(timeout);
    }, [searchTerm, statusFilter, urgencyFilter, fetchRegistry]);

    // Page change handler
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= meta.totalPages) {
            setPage(newPage);
            fetchRegistry(searchTerm, newPage, statusFilter);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Clinical Risk Tier Mapping
    const getRiskTierBadge = (urgency) => {
        switch (urgency) {
            case 'dropout':
            case 'defaulter':
                return (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                        <span className="text-red-600 font-black text-[10px] tracking-wider uppercase">High Risk</span>
                    </div>
                );
            case 'overdue':
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
            case 'VALIDATED':
                return (
                    <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        <ShieldCheck className="w-3 h-3" /> VALIDATED
                    </div>
                );
            case 'PENDING_VALIDATION':
                return (
                    <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                        <Clock className="w-3 h-3" /> PENDING REVIEW
                    </div>
                );
            case 'NEEDS_REVISION':
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
        const days = infant.days_overdue || 0;

        switch (urgency) {
            case 'overdue':
                if (days > 28 || infant.rankingStatus === 'DEFAULTER') {
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
            case 'completed':
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> Fully Immunized
                    </span>
                );
            default:
                return (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-1.5 w-fit">
                        <Activity className="w-3 h-3" /> Up-to-date
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

                        <button 
                            onClick={() => navigate('/clinical/registration')}
                            className="bg-emerald-800 hover:bg-emerald-900 text-white px-5 py-3 rounded-md flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-900/10 transition-all active:scale-95 w-full md:w-auto mb-2 md:mb-0"
                        >
                            <Plus className="w-4 h-4" />
                            Register New Infant
                        </button>
                        
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
                            <option value="overdue">Overdue Cases</option>
                            <option value="due_today">Due Today</option>
                            <option value="due_soon">Due Soon</option>
                        </select>

                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-white border-2 border-slate-100 px-4 py-3 rounded-md text-xs font-black uppercase tracking-widest text-slate-600 outline-none focus:border-emerald-800"
                        >
                            <option value="VALIDATED,PENDING_VALIDATION,NEEDS_REVISION">All Process Stages</option>
                            <option value="VALIDATED">Validated Only</option>
                            <option value="PENDING_VALIDATION">Pending Only</option>
                            <option value="NEEDS_REVISION">Revisions Only</option>
                            <option value="DRAFT">My Drafts</option>
                        </select>

                    </div>
                </div>
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
                                                Try adjusting your search terms or filters. No infants match the current health status or process stage selection.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                infants.map((infant) => (
                                    <tr
                                        key={infant.id}
                                        onClick={() => navigate(`/clinical/infants/${infant.reference_id}`)}
                                        className="hover:bg-emerald-50/40 transition-all cursor-pointer group border-l-4 border-transparent hover:border-emerald-800"
                                    >
                                        <td className="clinical-table-td py-5">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-slate-900 text-sm font-black group-hover:text-emerald-800 transition-colors leading-none uppercase">
                                                    {infant.first_name} {infant.last_name}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    REF: {infant.reference_id} • DOB: {new Date(infant.dob).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>

                                            </div>
                                        </td>

                                        <td className="clinical-table-td py-5">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-slate-700 text-[11px] font-black leading-none uppercase">
                                                    {infant.mothers_maiden_name || infant.mother_name || 'No Data Recorded'}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight italic">
                                                    {infant.barangay}, {infant.purok}
                                                </div>
                                            </div>
                                        </td>

                                        <td className="clinical-table-td py-5">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                                    {infant.next_due_vaccine || 'Fully Immunized'}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    {infant.next_due_date ? new Date(infant.next_due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No upcoming doses'}
                                                </span>

                                            </div>
                                        </td>

                                        <td className="clinical-table-td py-5">
                                            {getRiskTierBadge(infant.urgency)}
                                        </td>

                                        <td className="clinical-table-td py-5 text-right">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/clinical/infants/${infant.reference_id}`);
                                                }}
                                                className="bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap"
                                            >
                                                Manage Record
                                            </button>
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
                        Node {Math.min(meta.totalRecords, (page - 1) * limit + 1)}–{Math.min(meta.totalRecords, page * limit)} / Total {meta.totalRecords}
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
        </div>
    );
}
