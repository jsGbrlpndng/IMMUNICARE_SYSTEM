import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import RecordVaccinationModal from '../../components/RecordVaccinationModal';
import DelegationModal from '../../components/DelegationModal';
import LogVisitModal from '../../components/LogVisitModal';
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
    X,
    ChevronDown,
    ChevronRight
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
    const [showClustersOnly, setShowClustersOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showIndividualsOnly, setShowIndividualsOnly] = useState(false);
    const [showUrgentOnly, setShowUrgentOnly] = useState(false);
    const [delegationTarget, setDelegationTarget] = useState(null);
    const [expandedClusters, setExpandedClusters] = useState({});

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

    const filteredFollowUps = useMemo(() => {
        let results = followUps;
        if (searchQuery) {
            const query = searchQuery.trim().toLowerCase();
            results = results.filter(item => {
                const fullName = `${item.first_name || ''} ${item.middle_name || ''} ${item.last_name || ''}`.toLowerCase();
                const refId = (item.reference_id || '').toLowerCase();
                return fullName.includes(query) || refId.includes(query);
            });
        }
        if (isMidwifeView) {
            if (showClustersOnly) {
                results = results.filter(item => item?.cluster_priority);
            }
            if (showIndividualsOnly) {
                results = results.filter(item => !item?.cluster_priority);
            }
        }
        if (isBhw) {
            if (showUrgentOnly) {
                results = results.filter(item => item?.is_midwife_delegated);
            }
        }
        return results;
    }, [followUps, searchQuery, showClustersOnly, showIndividualsOnly, showUrgentOnly, isMidwifeView, isBhw]);

    const sortedFollowUps = useMemo(() => {
        return [...filteredFollowUps].sort((a, b) => {
            if (Boolean(a?.is_midwife_delegated) !== Boolean(b?.is_midwife_delegated)) {
                return a?.is_midwife_delegated ? -1 : 1;
            }
            if (Boolean(a?.cluster_priority) !== Boolean(b?.cluster_priority)) {
                return a?.cluster_priority ? -1 : 1;
            }
            return (b?.days_overdue || 0) - (a?.days_overdue || 0);
        });
    }, [filteredFollowUps]);

    const groupedFollowUps = useMemo(() => {
        if (!isMidwifeView || showIndividualsOnly) {
            return { clusters: [], isolated: sortedFollowUps };
        }

        const clustersMap = {};
        const isolated = [];

        sortedFollowUps.forEach(item => {
            if (item?.cluster_priority && item?.cluster_assignment_id) {
                const clusterId = item.cluster_assignment_id;
                if (!clustersMap[clusterId]) {
                    clustersMap[clusterId] = {
                        id: clusterId,
                        label: item.cluster_label || `Cluster ${clusterId}`,
                        items: []
                    };
                }
                clustersMap[clusterId].items.push(item);
            } else {
                isolated.push(item);
            }
        });

        return {
            clusters: Object.values(clustersMap),
            isolated
        };
    }, [sortedFollowUps, isMidwifeView, showIndividualsOnly]);

    const toggleCluster = (clusterId) => {
        setExpandedClusters(prev => ({
            ...prev,
            [clusterId]: !prev[clusterId]
        }));
    };

    // Visit logging is handled directly by the LogVisitModal component

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

    const renderInfantRow = (infant, isNested = false) => {
        const isUrgent = isBhw && infant?.is_midwife_delegated;
        
        let rowClass = "align-top transition-colors ";
        if (isUrgent) {
            rowClass += "border-l-4 border-l-amber-500 bg-amber-50/40 hover:bg-amber-100/40";
        } else if (infant?.cluster_priority) {
            rowClass += "bg-rose-50/30 hover:bg-rose-100/30";
        } else {
            rowClass += "hover:bg-slate-50";
        }

        return (
            <tr key={infant?.infant_id || infant?.id} className={rowClass}>
                <td className="px-5 py-4 border-b border-slate-200">
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
                                {isBhw && infant?.is_midwife_delegated && (
                                    <span className="inline-flex border border-amber-300 bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-800">
                                        URGENT: Midwife Requested
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

                <td className="px-5 py-4 font-semibold text-slate-700 border-b border-slate-200">
                    {infant?.reference_id || '-'}
                </td>

                <td className="px-5 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2 font-semibold text-slate-700">
                        <Phone size={14} className="text-slate-400" />
                        {infant?.parent_contact || infant?.caregiver_phone || '-'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                        {infant?.caregiver_relationship || 'Parent / guardian'}
                    </div>
                </td>

                <td className="px-5 py-4 border-b border-slate-200">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <MapPin size={14} className="text-slate-400 shrink-0" />
                        <span>
                            {[
                                infant?.street_address || infant?.exact_address || infant?.street || null,
                                infant?.purok ? `Purok ${infant.purok}` : null,
                                (infant?.sitio && infant?.sitio !== infant?.purok) ? `Sitio ${infant.sitio}` : null,
                                infant?.barangay || null
                            ].filter(Boolean).join(', ') || '-'}
                        </span>
                    </div>
                    {infant?.landmark && (
                        <div className="mt-1 text-xs text-slate-500 font-semibold italic">
                            Landmark: {infant.landmark}
                        </div>
                    )}
                    {isMidwifeView && (
                        <div className="mt-1.5 text-xs text-emerald-800 font-bold border-t border-slate-100 pt-1">
                            BHW: {infant?.assigned_bhw_name || 'Unassigned'}
                        </div>
                    )}
                </td>

                <td className="px-5 py-4 border-b border-slate-200">
                    <span className={`inline-flex border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClasses(infant?.status)}`}>
                        {infant?.status || '-'}
                    </span>
                </td>

                <td className="px-5 py-4 border-b border-slate-200">
                    <div className="font-semibold text-slate-700">
                        {(infant?.due_vaccines || []).slice(0, 2).join(', ') || '-'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                        Earliest due {formatDate(infant?.earliest_recommended_date)}
                    </div>
                </td>

                <td className="px-5 py-4 text-right border-b border-slate-200">
                    <div className="flex flex-wrap justify-end items-center gap-2">
                        {isBhw ? (
                            infant?.assigned_cluster_bhw_role === 'Midwife' ? (
                                <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-800 shadow-sm">
                                    Midwife Deployed
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setSelectedInfant(infant)}
                                    className="inline-flex items-center gap-2 bg-[#084C39] px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-emerald-900"
                                >
                                    <Stethoscope size={14} />
                                    Log Visit
                                </button>
                            )
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => openHistory(infant)}
                                    className="inline-flex items-center gap-2 bg-[#084C39] px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-emerald-900"
                                >
                                    View History
                                </button>
                                {isMidwifeView && !infant?.cluster_priority && (
                                    <button
                                        type="button"
                                        onClick={() => setDelegationTarget(infant)}
                                        className="inline-flex items-center gap-2 border border-emerald-800 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800 transition-colors hover:bg-emerald-50"
                                    >
                                        Delegate/Nudge
                                    </button>
                                )}
                            </>
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
        );
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
                    {!isBhw && (
                        <div className="border border-rose-300 bg-rose-50 px-4 py-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Cluster Priority</span>
                            <span className="ml-3 text-sm font-black text-rose-700">{stats.clusterPriority}</span>
                        </div>
                    )}

                    {/* Search Bar */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search name or reference ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700 placeholder-slate-400 focus:border-emerald-800 outline-none w-56"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {isMidwifeView && (
                        <>
                            <label className="inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 cursor-pointer hover:bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={showClustersOnly}
                                    onChange={(e) => {
                                        setShowClustersOnly(e.target.checked);
                                        if (e.target.checked) setShowIndividualsOnly(false);
                                    }}
                                    className="h-3.5 w-3.5 border-slate-300 text-emerald-800 focus:ring-emerald-800"
                                />
                                Clusters Only
                            </label>
                            <label className="inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 cursor-pointer hover:bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={showIndividualsOnly}
                                    onChange={(e) => {
                                        setShowIndividualsOnly(e.target.checked);
                                        if (e.target.checked) setShowClustersOnly(false);
                                    }}
                                    className="h-3.5 w-3.5 border-slate-300 text-emerald-800 focus:ring-emerald-800"
                                />
                                Individuals Only
                            </label>
                        </>
                    )}

                    {isBhw && (
                        <label className="inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 cursor-pointer hover:bg-slate-50">
                            <input
                                type="checkbox"
                                checked={showUrgentOnly}
                                onChange={(e) => setShowUrgentOnly(e.target.checked)}
                                className="h-3.5 w-3.5 border-slate-300 text-emerald-800 focus:ring-emerald-800"
                            />
                            Urgent Only
                        </label>
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
                    <table className="min-w-full text-left text-sm border-collapse">
                        <thead className="bg-[#084C39] text-white text-[11px] font-black uppercase tracking-[0.14em]">
                            <tr>
                                <th className="px-5 py-3.5">Infant</th>
                                <th className="px-5 py-3.5">Reference ID</th>
                                <th className="px-5 py-3.5">Parent Contact</th>
                                <th className="px-5 py-3.5">Address / Location</th>
                                <th className="px-5 py-3.5">Current Status</th>
                                <th className="px-5 py-3.5">Due Vaccines</th>
                                <th className="px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200">
                            {isMidwifeView ? (
                                groupedFollowUps.clusters.length === 0 && groupedFollowUps.isolated.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-12 text-center text-sm font-medium text-slate-500">
                                            No active follow-up alerts.
                                        </td>
                                    </tr>
                                ) : (
                                    <>
                                        {groupedFollowUps.clusters.map((cluster) => {
                                            const isExpanded = !!expandedClusters[cluster.id];
                                            return (
                                                <React.Fragment key={cluster.id}>
                                                    <tr
                                                        onClick={() => toggleCluster(cluster.id)}
                                                        className="cursor-pointer select-none"
                                                    >
                                                        <td colSpan={7} className="px-4 py-2.5">
                                                            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors px-4 py-3 shadow-sm rounded-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-200 text-rose-700">
                                                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                                    </div>
                                                                    <span className="text-xs font-black uppercase tracking-widest text-rose-800 font-sans">
                                                                        {cluster.label}
                                                                    </span>
                                                                    <span className="inline-flex items-center justify-center rounded bg-rose-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-800">
                                                                        {cluster.items.length} {cluster.items.length === 1 ? 'Infant Defaulter' : 'Infant Defaulters'}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700 font-bold">
                                                                    {isExpanded ? 'Click to Collapse' : 'Click to Expand'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {isExpanded && cluster.items.map(infant => renderInfantRow(infant, true))}
                                                </React.Fragment>
                                            );
                                        })}
                                        {groupedFollowUps.isolated.map(infant => renderInfantRow(infant, false))}
                                    </>
                                )
                            ) : (
                                sortedFollowUps.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-12 text-center text-sm font-medium text-slate-500">
                                            No active follow-up alerts.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedFollowUps.map(infant => renderInfantRow(infant, false))
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <LogVisitModal
                isOpen={!!selectedInfant}
                onClose={() => setSelectedInfant(null)}
                infant={selectedInfant}
                onLogSuccess={async () => {
                    await loadData();
                    window.dispatchEvent(new CustomEvent('immunicare:followups-updated'));
                }}
            />

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
            <DelegationModal
                isOpen={!!delegationTarget}
                onClose={() => setDelegationTarget(null)}
                infant={delegationTarget}
                onDelegateSuccess={async (bhwName) => {
                    alert(`Follow-up task successfully delegated to ${bhwName || 'BHW'}.`);
                    await loadData();
                }}
            />
        </div>
    );
};

export default FollowUpTasks;
