import { useState, useEffect } from 'react';
import {
    ClipboardList,
    Search,
    ChevronLeft,
    ChevronRight,
    X,
    Clock,
    User,
    Activity,
    Building2,
    CheckCircle2,
    XCircle,
    Info,
    Users,
    Stethoscope,
    ChevronDown,
    ChevronUp,
    CalendarDays
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { useBarangayFilter } from '../../contexts/BarangayFilterContext';

/* ─── Helpers ─────────────────────────────────────────────── */

/**
 * Format a UTC/ISO timestamp into a local, human-readable string.
 * e.g. "Feb 21, 2026 – 11:48 AM"
 */
const formatDate = (raw) => {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${date} – ${time}`;
};

/**
 * Map raw action_type codes to plain-language descriptions.
 */
const friendlyAction = (action) => {
    if (!action) return '—';
    const map = {
        USER_CREATED: 'Created user',
        USER_UPDATED: 'Updated user',
        USER_DISABLED: 'Disabled user',
        USER_ENABLED: 'Enabled user',
        PASSWORD_RESET: 'Reset password',
        PASSWORD_CHANGED: 'Changed password',
        LOGIN_SUCCESS: 'Logged in',
        LOGIN_FAILED: 'Login failed',
        LOGIN: 'Logged in',
        LOGOUT: 'Logged out',
        ROLE_CHANGED: 'Changed role',
        SETTINGS_UPDATED: 'Updated settings',
        SCHEDULE_UPDATED: 'Updated schedule',
        VACCINATION_RECORDED: 'Recorded vaccination',
        VACCINATION_UPDATED: 'Updated vaccination',
        DOSAGE_VALIDATED: 'Validated dosage',
        INFANT_REGISTERED: 'Registered infant',
        INFANT_UPDATED: 'Updated infant record',
    };
    const key = action.toUpperCase().replace(/ /g, '_');
    return map[key] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Whether an action/status indicates success.
 */
const isSuccess = (log) => {
    const status = (log.status || log.result || '').toLowerCase();
    if (status.includes('fail') || status.includes('error') || status.includes('denied') || status.includes('invalid')) {
        return false;
    }
    const action = (log.action_type || '').toLowerCase();
    if (action.includes('fail') || action.includes('error')) return false;
    return true;
};

/**
 * Extract a friendly result/status label.
 */
const friendlyStatus = (log) => {
    const raw = log.status || log.result || '';
    if (!raw) return isSuccess(log) ? 'Success' : null;
    if (raw.toLowerCase() === 'success' || raw.toLowerCase() === 'ok') return 'Success';
    // Prefix with "Failed –" for error strings
    if (!isSuccess(log)) return `Failed – ${raw}`;
    return raw;
};

/**
 * Extract "target" text from a log entry.
 */
const friendlyTarget = (log) => {
    const target = log.target_entity || log.vaccine_name || '';
    if (!target) {
        // Try to extract from details object
        const d = log.details || {};
        if (d.target_name) return d.target_name;
        if (d.full_name) return `User: ${d.full_name}`;
        return '—';
    }
    return target;
};

/**
 * Render the details object as a set of friendly key-value rows.
 * Shows known fields with labels first, then any extras.
 */
const KNOWN_FIELDS = {
    role: 'Role',
    full_name: 'Full Name',
    target_id: 'Target ID',
    user_id: 'User ID',
    assigned_barangay: 'Assigned Barangay',
    barangay: 'Barangay',
    email: 'Email',
    action: 'Action',
    ip_address: 'IP Address',
    user_agent: 'Device / Browser',
    previous_role: 'Previous Role',
    new_role: 'New Role',
    reason: 'Reason',
};

const MetaSummaryCard = ({ details }) => {
    const [expanded, setExpanded] = useState(false);

    if (!details || typeof details !== 'object' || Object.keys(details).length === 0) {
        return (
            <p className="text-sm text-slate-400 italic">No additional details recorded.</p>
        );
    }

    const known = Object.entries(KNOWN_FIELDS)
        .filter(([key]) => details[key] !== undefined && details[key] !== null && details[key] !== '')
        .map(([key, label]) => ({ label, value: String(details[key]) }));

    const extra = Object.entries(details)
        .filter(([key]) => !(key in KNOWN_FIELDS))
        .map(([key, value]) => ({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            value: typeof value === 'object' ? JSON.stringify(value) : String(value)
        }));

    return (
        <div className="space-y-2">
            {known.map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                    <span className="text-sm font-semibold text-slate-800">{value}</span>
                </div>
            ))}
            {extra.length > 0 && (
                <>
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 mt-2 transition-colors"
                    >
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expanded ? 'Hide' : 'Show'} technical details ({extra.length})
                    </button>
                    {expanded && (
                        <div className="mt-2 bg-slate-50 rounded-lg border border-slate-100 p-3 space-y-2">
                            {extra.map(({ label, value }) => (
                                <div key={label} className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                                    <span className="text-xs font-mono text-slate-700 break-all">{value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

/* ─── Main Component ──────────────────────────────────────── */

const AuditLogs = () => {
    const { user } = useAuth();
    const { selectedBarangay } = useBarangayFilter();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('system');
    const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0 });
    const [selectedLog, setSelectedLog] = useState(null);
    const [filters, setFilters] = useState({
        actor: '',
        startDate: '',
        endDate: ''
    });

    useEffect(() => {
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, pagination.page, filters, selectedBarangay]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            // Remove empty params so backend doesn't get blank strings
            const raw = { page: pagination.page, limit: pagination.limit, ...filters };
            const queryParams = new URLSearchParams(
                Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''))
            );

            const endpoint = activeTab === 'system'
                ? `/admin/audit/system?${queryParams}`
                : `/admin/audit/clinical?${queryParams}`;

            const res = await apiClient.get(endpoint);
            if (!res.ok) {
                setLogs([]);
                setPagination(prev => ({ ...prev, total: 0 }));
                return;
            }
            const data = await res.json();

            setLogs(data?.logs ?? []);
            setPagination(prev => ({
                ...prev,
                total: data?.pagination?.total ?? 0
            }));
        } catch (error) {
            console.error('Audit log fetch error:', error);
            setLogs([]);
            setPagination(prev => ({ ...prev, total: 0 }));
        } finally {
            setLoading(false);
        }
    };

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setSelectedLog(null);
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const totalPages = Math.ceil((pagination.total ?? 0) / pagination.limit);

    return (
        <div className="space-y-5">
            {/* Page Header */}
            <div className="bg-white rounded-xl border border-slate-200 px-6 py-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Activity History</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {selectedBarangay === 'all' ? 'Municipal Overview' : `Barangay ${selectedBarangay}`} • A record of all actions taken by staff.
                        </p>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <div className="flex flex-wrap gap-4 items-end">
                    {/* Actor search */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <Search className="w-3 h-3" />
                            Search by Staff ID
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-300" />
                            <input
                                type="text"
                                placeholder="e.g. ADMIN-001"
                                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none transition"
                                value={filters.actor}
                                onChange={(e) => handleFilterChange('actor', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Date range */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            Date Range
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                            />
                            <span className="text-slate-400 text-xs font-medium">to</span>
                            <input
                                type="date"
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                            />
                            {(filters.actor || filters.startDate || filters.endDate) && (
                                <button
                                    onClick={() => {
                                        setFilters({ actor: '', startDate: '', endDate: '' });
                                        setPagination(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Panel */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Stream Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50/50">
                    <button
                        onClick={() => handleTabChange('system')}
                        className={`flex items-center gap-2.5 px-6 py-4 text-sm font-semibold transition-all border-b-2 ${activeTab === 'system'
                                ? 'border-slate-800 text-slate-900 bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
                            }`}
                    >
                        <Users className="w-4 h-4" />
                        <span>Staff &amp; System</span>
                        <span className="text-[10px] text-slate-400 font-normal">Stream A</span>
                    </button>
                    <button
                        onClick={() => handleTabChange('clinical')}
                        className={`flex items-center gap-2.5 px-6 py-4 text-sm font-semibold transition-all border-b-2 ${activeTab === 'clinical'
                                ? 'border-blue-600 text-blue-700 bg-white'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
                            }`}
                    >
                        <Stethoscope className="w-4 h-4" />
                        <span>Clinical Activity</span>
                        <span className="text-[10px] text-slate-400 font-normal">Stream B</span>
                    </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date &amp; Time</th>
                                <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Done By</th>
                                <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                                <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">What Was Changed</th>
                                <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-5 py-14 text-center">
                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                            <Activity className="w-6 h-6 animate-pulse" />
                                            <span className="text-sm">Loading activity history…</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-5 py-16 text-center">
                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                            <ClipboardList className="w-8 h-8 text-slate-200" />
                                            <p className="text-sm font-medium text-slate-500">No activity found</p>
                                            <p className="text-xs text-slate-400">
                                                {filters.actor || filters.startDate || filters.endDate
                                                    ? 'No activity found for this staff ID and date range.'
                                                    : 'There are no logged activities yet.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log, idx) => {
                                    const success = isSuccess(log);
                                    const statusLabel = friendlyStatus(log);
                                    return (
                                        <tr
                                            key={log.id || log.audit_id || idx}
                                            className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${selectedLog === log
                                                    ? 'bg-blue-50 border-l-2 border-blue-500'
                                                    : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                                                }`}
                                            onClick={() => setSelectedLog(selectedLog === log ? null : log)}
                                        >
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                                                    <span className="text-sm text-slate-600 font-medium whitespace-nowrap">
                                                        {formatDate(log.timestamp || log.created_at)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                                                    <User className="w-3 h-3 text-slate-400" />
                                                    {log.admin_id || log.midwife_id || '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold border ${activeTab === 'system'
                                                        ? 'bg-slate-50 text-slate-700 border-slate-200'
                                                        : 'bg-blue-50 text-blue-700 border-blue-100'
                                                    }`}>
                                                    {friendlyAction(log.action_type)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-sm text-slate-700 font-medium max-w-xs truncate">
                                                {activeTab === 'clinical' ? (
                                                    <span className="text-slate-400 italic text-xs">Protected – clinical data</span>
                                                ) : (
                                                    friendlyTarget(log)
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {statusLabel ? (
                                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${success ? 'text-emerald-700' : 'text-red-600'
                                                        }`}>
                                                        {success
                                                            ? <CheckCircle2 className="w-3.5 h-3.5" />
                                                            : <XCircle className="w-3.5 h-3.5" />}
                                                        {statusLabel}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Success
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">
                        {pagination.total === 0
                            ? 'No entries'
                            : `Showing ${Math.max(1, (pagination.page - 1) * pagination.limit + 1)}–${Math.min(pagination.page * pagination.limit, pagination.total ?? 0)} of ${pagination.total ?? 0}`}
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            disabled={pagination.page === 1}
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4 text-slate-600" />
                        </button>
                        <span className="text-xs font-semibold text-slate-600 px-2">
                            {pagination.page} / {Math.max(1, totalPages)}
                        </span>
                        <button
                            disabled={pagination.page >= totalPages}
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail Side Panel */}
            {selectedLog && (
                <>
                    {/* Backdrop overlay (click to close) */}
                    <div
                        className="fixed inset-0 z-40 bg-black/10"
                        onClick={() => setSelectedLog(null)}
                    />
                    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 border-l border-slate-200 flex flex-col">
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
                            <div>
                                <h2 className="text-sm font-bold text-slate-800">Activity Details</h2>
                                <p className="text-xs text-slate-400 mt-0.5">Full record for this log entry</p>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        {/* Panel Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {/* Key facts */}
                            <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-4">
                                {/* Date/Time */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Date &amp; Time</p>
                                    <div className="flex items-center gap-2 text-slate-800">
                                        <Clock className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm font-semibold">
                                            {formatDate(selectedLog.timestamp || selectedLog.created_at)}
                                        </span>
                                    </div>
                                </div>

                                {/* Done By */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Done By</p>
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm font-bold bg-slate-200 px-2.5 py-0.5 rounded-md text-slate-800">
                                            {selectedLog.admin_id || selectedLog.midwife_id || '—'}
                                        </span>
                                    </div>
                                </div>

                                {/* Action */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Action</p>
                                    <div className="flex items-center gap-2">
                                        <Activity className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm font-semibold text-slate-800">
                                            {friendlyAction(selectedLog.action_type)}
                                        </span>
                                    </div>
                                </div>

                                {/* Target (System stream only) */}
                                {activeTab === 'system' && (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">What Was Changed</p>
                                        <div className="flex items-start gap-2">
                                            <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                                            <span className="text-sm font-semibold text-slate-800">
                                                {friendlyTarget(selectedLog)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Result */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Result</p>
                                    {isSuccess(selectedLog) ? (
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                                            <CheckCircle2 className="w-4 h-4" />
                                            {friendlyStatus(selectedLog) || 'Success'}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600">
                                            <XCircle className="w-4 h-4" />
                                            {friendlyStatus(selectedLog)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Details Section */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Info className="w-3.5 h-3.5" />
                                    Additional Information
                                </h3>

                                {activeTab === 'clinical' ? (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
                                        <p className="font-semibold mb-1">Clinical Data Protected</p>
                                        <p className="text-xs text-amber-700 leading-relaxed">
                                            Patient identifiers and clinical details are not shown here to protect patient privacy. Only authorized clinical staff can view this information.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl border border-slate-100 p-4">
                                        <MetaSummaryCard details={selectedLog.details} />
                                    </div>
                                )}
                            </div>

                            {/* Log ID (for reference) */}
                            <p className="text-[10px] text-slate-300 font-mono">
                                Log ID: {selectedLog.id || selectedLog.audit_id || 'N/A'}
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AuditLogs;
