import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    Download,
    Eye,
    Filter,
    Lock,
    Search,
    Shield,
    User,
    X
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { RHU2_BARANGAYS } from '../../components/reports/reportConfig';
import {
    buildAuditDeltaRows,
    buildAuditTechnicalRows,
    formatAuditAction,
    formatAuditField,
    formatAuditRole,
    formatAuditScope,
    formatAuditTarget,
    formatAuditValue,
    isAuditSystemField
} from '../../utils/auditFormatter';

const ROLE_OPTIONS = ['Super Admin', 'Admin', 'Midwife', 'Nurse', 'BHW'];

const initialFilters = {
    barangay: 'all',
    actorRole: '',
    actor: '',
    action: '',
    targetEntity: '',
    infantName: '',
    bhwName: '',
    startDate: '',
    endDate: ''
};

const formatDate = (raw) => {
    if (!raw) return '-';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return String(raw);
    return parsed.toLocaleString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const Field = ({ label, children }) => (
    <label className="block">
        <span className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            {label}
        </span>
        {children}
    </label>
);

const inputClass = 'h-9 border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-[#064E3B]';

const DeltaModal = ({ log, onClose }) => {
    if (!log) return null;
    const rows = buildAuditDeltaRows({
        action: log.action,
        oldValues: log.old_values,
        newValues: log.new_values
    }).filter((row) => !isAuditSystemField(row.key));
    const metadataRows = buildAuditTechnicalRows({
        oldValues: log.old_values,
        newValues: log.new_values,
        metadata: log.metadata
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
            <section className="max-h-[86vh] w-full max-w-5xl overflow-hidden border border-slate-400 bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-300 bg-[#064E3B] px-5 py-4 text-white">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">Activity Details</p>
                        <h2 className="text-lg font-black">{formatAuditAction(log.action)}</h2>
                        <p className="mt-1 text-xs font-semibold text-emerald-100">{formatAuditTarget(log.target_entity, log.target_record_id, log.target_name)}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="border border-white/40 p-2 text-white hover:bg-white/10"
                        aria-label="Close delta view"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-auto p-5">
                    <div className="mb-4 grid gap-3 text-xs font-bold text-slate-700 md:grid-cols-4">
                        <div className="border border-slate-300 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">Staff</p>
                            <p className="mt-1 text-slate-950">{log.actor_name || log.actor_user_id || '-'}</p>
                        </div>
                        <div className="border border-slate-300 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">Role</p>
                            <p className="mt-1 text-slate-950">{formatAuditRole(log.actor_role)}</p>
                        </div>
                        <div className="border border-slate-300 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">Area</p>
                            <p className="mt-1 text-slate-950">{formatAuditScope(log)}</p>
                        </div>
                        <div className="border border-slate-300 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500">Timestamp</p>
                            <p className="mt-1 text-slate-950">{formatDate(log.created_at)}</p>
                        </div>
                    </div>

                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 bg-[#064E3B] text-white">
                            <tr>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Detail</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Before</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">After</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="border border-slate-300 px-3 py-6 text-center font-bold text-slate-500">
                                        No before/after values recorded.
                                    </td>
                                </tr>
                            ) : rows.map((row) => (
                                <tr key={row.key} className={row.changed ? 'bg-emerald-50' : 'bg-white'}>
                                    <td className="border border-slate-300 px-3 py-2 font-black uppercase text-slate-700">{formatAuditField(row.key)}</td>
                                    <td className="border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-700">{formatAuditValue(row.key, row.oldValue)}</td>
                                    <td className="border border-slate-300 px-3 py-2 text-[11px] font-semibold text-slate-950">{formatAuditValue(row.key, row.newValue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {metadataRows.length > 0 ? (
                        <details className="mt-4 border border-slate-300 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.14em] text-slate-600">Show technical metadata</summary>
                            <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                                {metadataRows.map(([key, value]) => (
                                    <div key={key} className="border border-slate-200 bg-white p-2">
                                        <p className="font-black uppercase text-slate-500">{formatAuditField(key)}</p>
                                        <p className="mt-1 break-all text-[11px] font-semibold text-slate-700">{formatAuditValue(key, value)}</p>
                                    </div>
                                ))}
                            </div>
                        </details>
                    ) : null}
                </div>
            </section>
        </div>
    );
};

const AuditLogs = () => {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'Super Admin';
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedLog, setSelectedLog] = useState(null);
    const [filters, setFilters] = useState(initialFilters);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });

    const lockedBarangay = user?.assigned_barangay || 'Assigned Barangay';
    const visibleFilters = useMemo(() => {
        if (isSuperAdmin) return filters;
        return {
            ...filters,
            barangay: '',
            actorRole: ''
        };
    }, [filters, isSuperAdmin]);

    const buildQuery = useCallback((forExport = false) => {
        const params = new URLSearchParams();
        if (!forExport) {
            params.set('page', String(pagination.page));
            params.set('limit', String(pagination.limit));
        }
        Object.entries(visibleFilters).forEach(([key, value]) => {
            if (value && value !== 'all') params.set(key, value);
        });
        return params.toString();
    }, [pagination.limit, pagination.page, visibleFilters]);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await apiClient.get(`/audit-logs?${buildQuery(false)}`);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Unable to load audit logs.');
            }
            setLogs(Array.isArray(payload.logs) ? payload.logs : []);
            setPagination((current) => ({
                ...current,
                total: Number(payload?.pagination?.total || 0)
            }));
        } catch (requestError) {
            console.error('[AUDIT_LOGS]', requestError);
            setLogs([]);
            setError(requestError.message || 'Unable to load audit logs.');
        } finally {
            setLoading(false);
        }
    }, [buildQuery]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleFilter = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPagination((current) => ({ ...current, page: 1 }));
    };

    const clearFilters = () => {
        setFilters(initialFilters);
        setPagination((current) => ({ ...current, page: 1 }));
    };

    const exportCsv = async () => {
        const response = await apiClient.get(`/audit-logs/export.csv?${buildQuery(true)}`);
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `immunicare_audit_logs_${Date.now()}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pagination.limit));

    return (
        <div className="space-y-5">
            <section className="border border-slate-300 bg-white px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-[#064E3B] bg-[#064E3B] text-white">
                            <Shield className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">
                                {isSuperAdmin ? 'Head Nurse Audit Ledger' : 'Barangay Audit Ledger'}
                            </p>
                            <h1 className="text-2xl font-black text-slate-950">Immutable Activity History</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                {isSuperAdmin ? 'All RHU 2 barangays and system-level activity' : `Locked to ${lockedBarangay}`}
                            </p>
                        </div>
                    </div>
                    {isSuperAdmin ? (
                        <button
                            type="button"
                            onClick={exportCsv}
                            className="inline-flex h-10 items-center gap-2 border border-[#064E3B] bg-[#064E3B] px-4 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-[#043828]"
                        >
                            <Download className="h-4 w-4" />
                            Export CSV
                        </button>
                    ) : (
                        <div className="inline-flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#064E3B]">
                            <Lock className="h-4 w-4" />
                            Export disabled
                        </div>
                    )}
                </div>
            </section>

            <section className="border border-slate-300 bg-white p-4">
                <div className="grid gap-3 lg:grid-cols-6">
                    {isSuperAdmin ? (
                        <>
                            <Field label="Barangay">
                                <select className={`${inputClass} w-full`} value={filters.barangay} onChange={(event) => handleFilter('barangay', event.target.value)}>
                                    <option value="all">All RHU 2 + System</option>
                                    <option value="SYSTEM">System Events</option>
                                    {RHU2_BARANGAYS.map((barangay) => (
                                        <option key={barangay} value={barangay}>{barangay}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Staff Role">
                                <select className={`${inputClass} w-full`} value={filters.actorRole} onChange={(event) => handleFilter('actorRole', event.target.value)}>
                                    <option value="">All Roles</option>
                                    {ROLE_OPTIONS.map((role) => (
                                        <option key={role} value={role}>{formatAuditRole(role)}</option>
                                    ))}
                                </select>
                            </Field>
                        </>
                    ) : (
                        <>
                            <Field label="Infant Name">
                                <input className={`${inputClass} w-full`} value={filters.infantName} onChange={(event) => handleFilter('infantName', event.target.value)} placeholder="Search infant" />
                            </Field>
                            <Field label="BHW Name">
                                <input className={`${inputClass} w-full`} value={filters.bhwName} onChange={(event) => handleFilter('bhwName', event.target.value)} placeholder="Search BHW" />
                            </Field>
                        </>
                    )}
                    <Field label="Staff">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <input className={`${inputClass} w-full pl-8`} value={filters.actor} onChange={(event) => handleFilter('actor', event.target.value)} placeholder="Staff ID or name" />
                        </div>
                    </Field>
                    <Field label="Activity">
                        <input className={`${inputClass} w-full`} value={filters.action} onChange={(event) => handleFilter('action', event.target.value)} placeholder="Search activity type..." />
                    </Field>
                    <Field label="Start Date">
                        <input type="date" className={`${inputClass} w-full`} value={filters.startDate} onChange={(event) => handleFilter('startDate', event.target.value)} />
                    </Field>
                    <Field label="End Date">
                        <div className="flex gap-2">
                            <input type="date" className={`${inputClass} w-full`} value={filters.endDate} onChange={(event) => handleFilter('endDate', event.target.value)} />
                            <button type="button" onClick={clearFilters} className="border border-slate-300 px-3 text-slate-600 hover:border-[#064E3B] hover:text-[#064E3B]">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </Field>
                </div>
            </section>

            {error ? (
                <div className="border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>
            ) : null}

            <section className="border border-slate-300 bg-white">
                <div className="flex items-center justify-between border-b border-slate-300 px-4 py-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Audit Entries</p>
                        <p className="text-xs font-bold text-slate-500">{pagination.total.toLocaleString()} event(s)</p>
                    </div>
                    <Filter className="h-4 w-4 text-slate-400" />
                </div>
                <div className="max-w-full overflow-x-auto">
                    <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
                        <thead className="bg-[#064E3B] text-white">
                            <tr>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Timestamp</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Staff</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Role</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Area</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Activity</th>
                                <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-wider">Record</th>
                                <th className="border border-[#043828] px-3 py-2 text-center font-black uppercase tracking-wider">Details/Changes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="border border-slate-300 px-4 py-10 text-center font-bold text-slate-500">
                                        <Activity className="mx-auto mb-2 h-5 w-5 animate-pulse" />
                                        Loading audit logs...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="border border-slate-300 px-4 py-10 text-center font-bold text-slate-500">
                                        No audit records found.
                                    </td>
                                </tr>
                            ) : logs.map((log, index) => (
                                <tr key={log.id || index} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                                    <td className="border border-slate-300 px-3 py-2 font-mono text-[11px] font-bold text-slate-700">{formatDate(log.created_at)}</td>
                                    <td className="border border-slate-300 px-3 py-2 font-black text-slate-950">
                                        <span className="inline-flex items-center gap-1">
                                            <User className="h-3.5 w-3.5 text-slate-400" />
                                            {log.actor_name || log.actor_user_id || '-'}
                                        </span>
                                    </td>
                                    <td className="border border-slate-300 px-3 py-2 font-bold text-slate-700">{formatAuditRole(log.actor_role)}</td>
                                    <td className="border border-slate-300 px-3 py-2 font-bold text-slate-700">{formatAuditScope(log)}</td>
                                    <td className="border border-slate-300 px-3 py-2 font-black text-[#064E3B]">{formatAuditAction(log.action)}</td>
                                    <td className="border border-slate-300 px-3 py-2 font-bold text-slate-800">{formatAuditTarget(log.target_entity, log.target_record_id, log.target_name)}</td>
                                    <td className="border border-slate-300 px-3 py-2 text-center">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLog(log)}
                                            className="inline-flex h-8 items-center gap-1 border border-[#064E3B] px-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#064E3B] hover:bg-[#064E3B] hover:text-white"
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-300 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-slate-500">
                        Page {pagination.page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={pagination.page <= 1}
                            onClick={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}
                            className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={pagination.page >= totalPages}
                            onClick={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}
                            className="border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </section>

            <DeltaModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};

export default AuditLogs;
