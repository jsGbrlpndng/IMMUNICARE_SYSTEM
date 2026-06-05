import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import RecordVaccinationModal from '../../components/RecordVaccinationModal';
import { formatFullNameFromObject } from '../../utils/formatFullName';
import {
    AlertCircle,
    Archive,
    ClipboardList,
    Loader2,
    MapPin,
    Phone,
    RefreshCw,
    Stethoscope,
    UserRound,
    X
} from 'lucide-react';

const today = new Date().toISOString().slice(0, 10);
const VISIT_OUTCOME_OPTIONS = [
    { value: 'NOT_HOME', label: 'Not Home' },
    { value: 'REFUSED', label: 'Refused' },
    { value: 'PROMISED_TO_VISIT', label: 'Promised to Visit' },
    { value: 'TRANSFERRED', label: 'Transferred' },
    { value: 'RELOCATED', label: 'Relocated' },
    { value: 'NOT_FOUND', label: 'Not Found' }
];

const formatDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString();
};

const infantName = (infant) => formatFullNameFromObject(infant) || 'Unnamed infant';

const statusClasses = (status) => {
    if (status === 'DEFAULTER') return 'border-rose-200 bg-rose-50 text-rose-700';
    if (status === 'DUE_SOON') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
};

const FollowUpTasks = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [followUps, setFollowUps] = useState([]);
    const [selectedInfant, setSelectedInfant] = useState(null);
    const [historyInfant, setHistoryInfant] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [doseTarget, setDoseTarget] = useState(null);
    const [archiveTarget, setArchiveTarget] = useState(null);
    const [archiveReason, setArchiveReason] = useState('');
    const [archiveNotes, setArchiveNotes] = useState('');
    const [archiveError, setArchiveError] = useState('');
    const [archivingId, setArchivingId] = useState(null);
    const [visitForm, setVisitForm] = useState({
        visit_date: today,
        parent_contact: '',
        outcome: 'NOT_HOME',
        notes: ''
    });

    const isBhw = user?.role === 'BHW';
    const isMidwifeView = user?.role === 'Midwife' || user?.role === 'Super Admin';

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/follow-ups');
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to load follow-ups');
            const data = await res.json();
            const items = Array.isArray(data?.follow_ups) ? data.follow_ups : [];
            setFollowUps(items);
        } catch (error) {
            console.error('Failed to load follow-ups:', error);
            setFollowUps([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const stats = useMemo(() => ({
        total: followUps.length,
        defaulters: followUps.filter(item => item?.status === 'DEFAULTER').length,
        dueSoon: followUps.filter(item => item?.status === 'DUE_SOON').length,
        clusterPriority: followUps.filter(item => item?.cluster_priority).length
    }), [followUps]);

    const sortedFollowUps = useMemo(() => {
        const urgencyOrder = { DEFAULTER: 0, DUE_SOON: 1 };
        return [...followUps].sort((a, b) => {
            if (Boolean(a?.cluster_priority) !== Boolean(b?.cluster_priority)) {
                return a?.cluster_priority ? -1 : 1;
            }

            const statusDiff = (urgencyOrder[a?.status] ?? 9) - (urgencyOrder[b?.status] ?? 9);
            if (statusDiff !== 0) return statusDiff;

            const aDate = a?.earliest_recommended_date ? new Date(a.earliest_recommended_date).getTime() : Number.MAX_SAFE_INTEGER;
            const bDate = b?.earliest_recommended_date ? new Date(b.earliest_recommended_date).getTime() : Number.MAX_SAFE_INTEGER;
            return aDate - bDate;
        });
    }, [followUps]);

    const openVisitModal = (infant) => {
        setSelectedInfant(infant);
        setVisitForm({
            visit_date: today,
            parent_contact: infant?.parent_contact || infant?.caregiver_phone || '',
            outcome: 'NOT_HOME',
            notes: ''
        });
    };

    const closeVisitModal = () => {
        setSelectedInfant(null);
        setSaving(false);
    };

    const submitVisit = async (event) => {
        event.preventDefault();
        if (!selectedInfant?.infant_id) return;

        setSaving(true);
        try {
            const res = await apiClient.post(`/follow-ups/${selectedInfant.infant_id}/logs`, visitForm);
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to log visit');
            closeVisitModal();
            await loadData();
        } catch (error) {
            alert(error.message);
        } finally {
            setSaving(false);
        }
    };

    const openHistory = async (infant) => {
        setHistoryInfant(infant);
        setHistoryLoading(true);
        setHistoryLogs([]);
        try {
            const res = await apiClient.get(`/follow-ups/${infant?.infant_id}/logs`);
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to load history');
            const data = await res.json();
            setHistoryLogs(data?.logs || []);
        } catch (error) {
            console.error('Failed to load follow-up history:', error);
            setHistoryLogs([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const openDoseModal = (infant) => {
        setDoseTarget({
            infant: {
                ...infant,
                id: infant?.infant_id,
                name: infantName(infant),
                registration_status: infant?.registration_status || 'APPROVED'
            },
            selectedVaccine: {
                infantId: infant?.infant_id,
                scheduleId: infant?.missing_schedule_id,
                vaccineCode: infant?.missing_vaccine_code,
                vaccineName: infant?.missing_vaccine_name || infant?.due_vaccines?.[0],
                doseNumber: infant?.missing_dose_number || 1,
                dueDate: infant?.earliest_recommended_date
            }
        });
    };

    const closeDoseModal = () => setDoseTarget(null);

    const handleDoseSuccess = async () => {
        closeDoseModal();
        await loadData();
        window.dispatchEvent(new CustomEvent('immunicare:followups-updated'));
    };

    const openArchiveModal = (infant) => {
        setArchiveTarget(infant);
        setArchiveReason('');
        setArchiveNotes('');
        setArchiveError('');
    };

    const closeArchiveModal = () => {
        setArchiveTarget(null);
        setArchiveReason('');
        setArchiveNotes('');
        setArchiveError('');
        setArchivingId(null);
    };

    const archiveRecord = async (event) => {
        event.preventDefault();
        if (!archiveTarget?.infant_id || !archiveReason || archivingId) return;
        setArchivingId(archiveTarget.infant_id);
        setArchiveError('');
        try {
            const res = await apiClient.put(`/infants/${archiveTarget.infant_id}`, {
                status: 'Archived',
                archive_reason: archiveReason,
                archive_notes: archiveNotes
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.message || errorData.error || 'Failed to archive record');
            }
            closeArchiveModal();
            await loadData();
            window.dispatchEvent(new CustomEvent('immunicare:followups-updated'));
        } catch (error) {
            setArchiveError(error.message || 'Failed to archive record');
        } finally {
            setArchivingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center border border-slate-200 bg-white text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading follow-ups...
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-800">
                        {isBhw ? 'Ground Follow-Up Execution' : 'Supervisory Follow-Up Audit'}
                    </p>
                    <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                        Follow-Ups
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {isBhw
                            ? 'Local infants needing field tracing before vaccine completion clears the alert.'
                            : 'Barangay-wide defaulter and due-soon supervision with BHW accountability.'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="border border-slate-200 bg-white px-4 py-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Total</span>
                        <span className="ml-3 text-sm font-black text-slate-900">{stats.total}</span>
                    </div>
                    <div className="border border-rose-200 bg-rose-50 px-4 py-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Defaulter</span>
                        <span className="ml-3 text-sm font-black text-rose-700">{stats.defaulters}</span>
                    </div>
                    <div className="border border-amber-200 bg-amber-50 px-4 py-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Due Soon</span>
                        <span className="ml-3 text-sm font-black text-amber-700">{stats.dueSoon}</span>
                    </div>
                    {isBhw && (
                        <div className="border border-rose-300 bg-rose-50 px-4 py-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Cluster Priority</span>
                            <span className="ml-3 text-sm font-black text-rose-700">{stats.clusterPriority}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={loadData}
                        className="inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50"
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </section>

            <section className="overflow-hidden border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-slate-700">
                        <ClipboardList size={15} />
                        {isBhw ? 'Local Follow-Up List' : 'Municipal Follow-Up Queue'}
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                            <tr>
                                <th className="px-5 py-3">Infant</th>
                                <th className="px-5 py-3">Reference ID</th>
                                <th className="px-5 py-3">Parent Contact</th>
                                {isMidwifeView && <th className="px-5 py-3">Barangay / Assigned BHW</th>}
                                <th className="px-5 py-3">Current Status</th>
                                <th className="px-5 py-3">Due Vaccines</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200">
                            {sortedFollowUps.length === 0 ? (
                                <tr>
                                    <td colSpan={isMidwifeView ? 7 : 6} className="px-5 py-12 text-center text-sm font-medium text-slate-500">
                                        No active follow-up alerts.
                                    </td>
                                </tr>
                            ) : sortedFollowUps.map((infant) => (
                                <tr key={infant?.infant_id || infant?.id} className={`align-top transition-colors hover:bg-slate-50 ${infant?.cluster_priority ? 'bg-rose-50/30' : ''}`}>
                                    <td className="px-5 py-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center border border-slate-200 bg-slate-50 text-slate-600">
                                                <UserRound size={16} />
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-slate-900">{infantName(infant)}</span>
                                                    {infant?.cluster_priority && (
                                                        <span className="inline-flex border border-rose-300 bg-rose-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-rose-700">
                                                            Cluster Priority
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500">
                                                    DOB {formatDate(infant?.dob)}
                                                </div>
                                                {infant?.cluster_label && (
                                                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-600">
                                                        {infant.cluster_label}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-5 py-4 font-semibold text-slate-700">
                                        {infant?.reference_id || '-'}
                                    </td>

                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2 font-semibold text-slate-700">
                                            <Phone size={14} className="text-slate-400" />
                                            {infant?.parent_contact || infant?.caregiver_phone || '-'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {infant?.caregiver_relationship || 'Parent / guardian'}
                                        </div>
                                    </td>

                                    {isMidwifeView && (
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2 font-bold text-slate-800">
                                                <MapPin size={14} className="text-slate-400" />
                                                {infant?.barangay || '-'}
                                            </div>
                                            <div className="mt-1 text-xs font-semibold text-slate-500">
                                                {infant?.assigned_bhw_name || 'No active BHW assigned'}
                                            </div>
                                        </td>
                                    )}

                                    <td className="px-5 py-4">
                                        <span className={`inline-flex border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClasses(infant?.status)}`}>
                                            {infant?.status || '-'}
                                        </span>
                                    </td>

                                    <td className="px-5 py-4">
                                        <div className="font-semibold text-slate-700">
                                            {(infant?.due_vaccines || []).slice(0, 2).join(', ') || '-'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            Earliest due {formatDate(infant?.earliest_recommended_date)}
                                        </div>
                                    </td>

                                    <td className="px-5 py-4 text-right">
                                        <div className="flex flex-wrap justify-end gap-2">
                                            {isBhw ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openVisitModal(infant)}
                                                    className="inline-flex items-center gap-2 bg-emerald-800 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-emerald-900"
                                                >
                                                    <Stethoscope size={14} />
                                                    Log Visit
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => openHistory(infant)}
                                                    className="inline-flex items-center gap-2 bg-emerald-800 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-emerald-900"
                                                >
                                                    View History
                                                </button>
                                            )}

                                            {isMidwifeView && (
                                                <button
                                                    type="button"
                                                    onClick={() => openDoseModal(infant)}
                                                    disabled={!infant?.missing_vaccine_code}
                                                    className="inline-flex items-center gap-2 border border-emerald-800 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                                >
                                                    Record Dose
                                                </button>
                                            )}

                                            {isMidwifeView && (
                                                <button
                                                    type="button"
                                                    onClick={() => openArchiveModal(infant)}
                                                    disabled={archivingId === infant?.infant_id}
                                                    className="inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                                                >
                                                    <Archive size={14} />
                                                    {archivingId === infant?.infant_id ? 'Archiving...' : 'Archive Record'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {selectedInfant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
                    <form onSubmit={submitVisit} className="w-full max-w-lg border border-slate-200 bg-white">
                        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Log Visit</h3>
                                <p className="mt-1 text-sm text-slate-500">{infantName(selectedInfant)}</p>
                            </div>
                            <button type="button" onClick={closeVisitModal} className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Visit Date</span>
                                <input
                                    type="date"
                                    value={visitForm.visit_date}
                                    onChange={(e) => setVisitForm(prev => ({ ...prev, visit_date: e.target.value }))}
                                    required
                                    className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Parent Contact Update</span>
                                <input
                                    value={visitForm.parent_contact}
                                    onChange={(e) => setVisitForm(prev => ({ ...prev, parent_contact: e.target.value }))}
                                    className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Outcome</span>
                                <select
                                    value={visitForm.outcome}
                                    onChange={(e) => setVisitForm(prev => ({ ...prev, outcome: e.target.value }))}
                                    required
                                    className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800"
                                >
                                    {VISIT_OUTCOME_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Notes</span>
                                <textarea
                                    value={visitForm.notes}
                                    onChange={(e) => setVisitForm(prev => ({ ...prev, notes: e.target.value }))}
                                    rows={4}
                                    className="mt-2 w-full resize-none border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800"
                                />
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                            <button type="button" onClick={closeVisitModal} className="border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50">
                                Cancel
                            </button>
                            <button type="submit" disabled={saving} className="bg-emerald-800 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-emerald-900 disabled:opacity-60">
                                {saving ? 'Saving...' : 'Save Visit Log'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {historyInfant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
                    <div className="w-full max-w-2xl border border-slate-200 bg-white">
                        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Follow-Up History</h3>
                                <p className="mt-1 text-sm text-slate-500">{infantName(historyInfant)} · {historyInfant?.barangay || '-'}</p>
                            </div>
                            <button type="button" onClick={() => setHistoryInfant(null)} className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-10 text-sm text-slate-500">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading history...
                                </div>
                            ) : historyLogs.length === 0 ? (
                                <div className="border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
                                    No BHW visit logs have been recorded.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-200 border border-slate-200">
                                    {historyLogs.map((log) => (
                                        <div key={log?.id} className="px-4 py-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-sm font-black text-slate-900">{formatDate(log?.visit_date)}</div>
                                                <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                                                    {log?.outcome || '-'}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-xs font-semibold text-slate-500">
                                                Logged by {log?.bhw_name || 'BHW'} · Contact {log?.parent_contact || '-'}
                                            </div>
                                            <p className="mt-3 text-sm leading-6 text-slate-700">
                                                {log?.notes || 'No notes provided.'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {archiveTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
                    <form onSubmit={archiveRecord} className="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Archive Record</h3>
                                <p className="mt-1 text-sm font-semibold text-slate-500">{infantName(archiveTarget)}</p>
                            </div>
                            <button type="button" onClick={closeArchiveModal} className="rounded-md border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                            <p className="text-sm font-semibold leading-6 text-slate-700">
                                Are you sure you want to archive this record? It will be removed from all active reports and follow-up queues.
                            </p>

                            {archiveError && (
                                <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold leading-5 text-rose-800">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                    <span>{archiveError}</span>
                                </div>
                            )}

                            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Latest BHW Field Context</div>
                                <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                                    {archiveTarget?.last_bhw_note || archiveTarget?.last_visit_outcome || 'No BHW note or visit outcome has been recorded.'}
                                </p>
                            </div>

                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Archive Reason</span>
                                <select
                                    required
                                    value={archiveReason}
                                    onChange={(e) => setArchiveReason(e.target.value)}
                                    className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800"
                                >
                                    <option value="">Select archive reason</option>
                                    <option value="Relocated / Moved Away">Relocated / Moved Away</option>
                                    <option value="Deceased">Deceased</option>
                                    <option value="Duplicate Record">Duplicate Record</option>
                                    <option value="Other">Other</option>
                                </select>
                            </label>

                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Archive Notes</span>
                                <textarea
                                    value={archiveNotes}
                                    onChange={(e) => setArchiveNotes(e.target.value)}
                                    rows={4}
                                    className="mt-2 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800"
                                    placeholder="Add supporting context for the archive action."
                                />
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                            <button type="button" onClick={closeArchiveModal} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50">
                                Cancel
                            </button>
                            <button type="submit" disabled={archivingId === archiveTarget?.infant_id || !archiveReason} className="rounded-md bg-rose-700 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-rose-800 disabled:opacity-60">
                                {archivingId === archiveTarget?.infant_id ? 'Archiving...' : 'Confirm Archive'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <RecordVaccinationModal
                isOpen={!!doseTarget}
                onClose={closeDoseModal}
                infant={doseTarget?.infant}
                selectedVaccine={doseTarget?.selectedVaccine}
                user={user}
                onRecordSuccess={handleDoseSuccess}
            />
        </div>
    );
};

export default FollowUpTasks;
