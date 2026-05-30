import React from 'react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
    Calendar, RefreshCw, TriangleAlert, Clock, CircleCheck,
    Search, X
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import RecordVaccinationModal from '../../components/RecordVaccinationModal';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/formatters';

/* Urgency config */
const URGENCY = {
    overdue: {
        label:     'Overdue',
        pill:      'bg-red-50 text-red-700 border-red-200',
        dot:       'bg-red-500',
        row:       'bg-red-50/30',
        kpiText:   'text-red-600',
        kpiBorder: 'border-l-red-500',
    },
    defaulter: {
        label:     'Defaulter',
        pill:      'bg-red-600 text-white border-red-700',
        dot:       'bg-red-700',
        row:       'bg-red-100/40',
        kpiText:   'text-red-700',
        kpiBorder: 'border-l-red-700',
    },
    due_today: {
        label:     'Due today',
        pill:      'bg-orange-50 text-orange-700 border-orange-200',
        dot:       'bg-orange-500',
        row:       'bg-orange-50/20',
        kpiText:   'text-orange-600',
        kpiBorder: 'border-l-orange-400',
    },
    due_soon: {
        label:     'Due soon',
        pill:      'bg-amber-50 text-amber-700 border-amber-200',
        dot:       'bg-amber-400',
        row:       'bg-amber-50/10',
        kpiText:   'text-amber-600',
        kpiBorder: 'border-l-amber-400',
    },
    upcoming: {
        label:     'On track',
        pill:      'bg-blue-50 text-blue-700 border-blue-200',
        dot:       'bg-blue-400',
        row:       '',
        kpiText:   'text-blue-600',
        kpiBorder: 'border-l-blue-400',
    },
    on_track: {
        label:     'On track',
        pill:      'bg-teal-50 text-teal-700 border-teal-200',
        dot:       'bg-teal-400',
        row:       '',
        kpiText:   'text-teal-600',
        kpiBorder: 'border-l-teal-400',
    },
    completed: {
        label:     'Completed',
        pill:      'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot:       'bg-emerald-400',
        row:       '',
        kpiText:   'text-emerald-600',
        kpiBorder: 'border-l-emerald-500',
    },
    pending_validation: {
        label:     'Pending review',
        pill:      'bg-purple-50 text-purple-700 border-purple-200',
        dot:       'bg-purple-400',
        row:       '',
        kpiText:   'text-purple-600',
        kpiBorder: 'border-l-purple-400',
    },
};

const getUrgencyConfig = (urgency) => URGENCY[urgency] || URGENCY.upcoming;

const toDateOnlyString = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    const raw = value.toString().trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
};

const dateStringToDayNumber = (value) => {
    const dateString = toDateOnlyString(value);
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day) / 86400000;
};

const getDaysLateFromDate = (value) => {
    const targetDay = dateStringToDayNumber(value);
    const todayDay = dateStringToDayNumber(new Date());
    if (targetDay === null || todayDay === null) return 0;
    return Math.max(todayDay - targetDay, 0);
};

const getActionableDate = (item) => (
    item?.earliest_allowed_date ||
    item?.earliestAllowedDate ||
    item?.dueDate ||
    item?.scheduled_date ||
    item?.scheduledDate ||
    item?.target_date ||
    null
);

const getItemKey = (item, fallback = '') => (
    item?.scheduleId ||
    item?.id ||
    `${item?.vaccineCode || item?.vaccine_code || item?.vaccine || 'dose'}-${item?.doseNumber || item?.dose_number || fallback}-${getActionableDate(item) || fallback}`
);

const getDoseNumber = (item) => {
    const explicit = Number(item?.doseNumber || item?.dose_number);
    if (Number.isInteger(explicit) && explicit > 0) return explicit;

    const raw = `${item?.vaccineCode || item?.vaccine_code || item?.vaccine || ''} ${item?.vaccineName || item?.vaccine_name || ''}`;
    const match = raw.toUpperCase().match(/(?:PENTA|OPV|PCV|IPV|MCV|MEASLES)[-\s_]*(\d)/);
    return match ? Number(match[1]) : 1;
};

const getSeriesKey = (item) => {
    const raw = `${item?.vaccineCode || item?.vaccine_code || item?.vaccine || ''} ${item?.vaccineName || item?.vaccine_name || ''}`
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

    if (raw.includes('PENTA') || raw.includes('PENTAVALENT')) return 'PENTA';
    if (raw.includes('OPV') || raw.includes('ORALPOLIO')) return 'OPV';
    if (raw.includes('PCV') || raw.includes('PNEUMOCOCCAL')) return 'PCV';
    if (raw.includes('IPV') || raw.includes('INACTIVATEDPOLIO')) return 'IPV';
    if (raw.includes('MCV') || raw.includes('MEASLES') || raw.includes('MMR')) return 'MCV';
    if (raw.includes('HEPB') || raw.includes('HEPATITISB')) return 'HEPB';
    if (raw.includes('BCG')) return 'BCG';
    return raw || 'UNKNOWN';
};

const isRecordedDose = (item) => (
    item?.status === 'COMPLETED' ||
    item?.urgency === 'completed' ||
    !!item?.administeredDate ||
    !!item?.actual_date
);

const isPendingDose = (item) => (
    item?.status === 'PENDING_VALIDATION' ||
    item?.urgency === 'pending_validation'
);

const isHepatitisBBirthDose = (item) => {
    const raw = `${item?.vaccineCode || item?.vaccine_code || item?.vaccine || ''} ${item?.vaccineName || item?.vaccine_name || ''}`
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

    return raw.includes('HEPB') || raw.includes('HEPATITISB');
};

const isHepatitisBBirthDoseExpired = (item, dob) => {
    if (!isHepatitisBBirthDose(item) || isRecordedDose(item)) return false;

    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return false;

    const hoursSinceBirth = (Date.now() - birthDate.getTime()) / (1000 * 60 * 60);
    return hoursSinceBirth > 24;
};

const buildSequenceState = (items = []) => {
    const firstOpenBySeries = new Map();
    const sequenceState = new Map();

    const ordered = items
        .map((item, idx) => ({
            item,
            idx,
            itemKey: getItemKey(item, idx),
            seriesKey: getSeriesKey(item),
            doseNumber: getDoseNumber(item),
            blockedFromRecording: isRecordedDose(item) || isPendingDose(item) || item?.status === 'INELIGIBLE' || item?.urgency === 'ineligible'
        }))
        .sort((a, b) => (
            a.seriesKey.localeCompare(b.seriesKey) ||
            a.doseNumber - b.doseNumber ||
            dateStringToDayNumber(getActionableDate(a.item)) - dateStringToDayNumber(getActionableDate(b.item)) ||
            a.idx - b.idx
        ));

    for (const entry of ordered) {
        if (!entry.blockedFromRecording && !firstOpenBySeries.has(entry.seriesKey)) {
            firstOpenBySeries.set(entry.seriesKey, entry);
        }
    }

    for (const entry of ordered) {
        const firstOpen = firstOpenBySeries.get(entry.seriesKey);
        const isFirstOpenDose = !firstOpen || firstOpen.itemKey === entry.itemKey;
        sequenceState.set(entry.itemKey, {
            isFirstOpenDose,
            blockingDoseLabel: firstOpen && firstOpen.itemKey !== entry.itemKey
                ? `Dose ${firstOpen.doseNumber}`
                : null
        });
    }

    return sequenceState;
};

/*
   NIP TIMELINE MODAL
   Rendered via ReactDOM.createPortal into document.body so the
   overlay escapes StaffLayout's stacking context and covers the
   full viewport including the sidebar and top navigation bar.
*/
const NIPTimelineModal = ({ infant, onClose, onRecordDose }) => {
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const sequenceState = useMemo(() => buildSequenceState(schedule), [schedule]);

    useEffect(() => {
        if (!infant?.id) return;

        const fetchSchedule = async () => {
            try {
                setLoading(true);
                setFetchError(null);

                const response = await apiClient.get(`/schedule/${infant.id}`);

                // Surface non-ok responses explicitly instead of silently falling through
                if (!response.ok) {
                    throw new Error(`Server returned HTTP ${response.status}`);
                }

                const data = await response.json();

                // Log raw shape so key mismatches are immediately visible in console
                console.log('[NIPTimelineModal] raw schedule response:', data);

                // GET /api/schedule/:infantId returns { infant, schedule: { due_now[], overdue[], upcoming[], completed[] } }
                // Items are camelCase per NIPScheduleService._mapRowToFrontend
                const src = data.schedule || data;  // graceful fallback if shape ever changes
                const timeline = [
                    ...(src.defaulter          || []).map(v => ({ ...v, urgency: 'defaulter',          status: 'DEFAULTER' })),
                    ...(src.overdue            || []).map(v => ({ ...v, urgency: 'overdue',            status: 'OVERDUE'   })),
                    ...(src.due_now            || []).map(v => ({ ...v, urgency: 'due_today',          status: 'DUE_TODAY' })),
                    ...(src.due_soon           || []).map(v => ({ ...v, urgency: 'due_soon',           status: 'DUE_SOON'  })),
                    ...(src.upcoming           || []).map(v => ({ ...v, urgency: 'upcoming',           status: 'UPCOMING'  })),
                    ...(src.completed          || []).map(v => ({ ...v, urgency: 'completed',          status: 'COMPLETED' })),
                    ...(src.pending_validation || []).map(v => ({ ...v, urgency: 'pending_validation', status: 'PENDING_VALIDATION' })),
                    ...(src.ineligible         || []).map(v => ({ ...v, urgency: 'ineligible',         status: 'INELIGIBLE' })),
                ].map(v => ({
                    ...v,
                    // Use the backend clinical floor as the actionable target date.
                    earliest_allowed_date: v.earliestAllowedDate || v.earliest_allowed_date || v.dueDate || v.scheduled_date,
                    scheduled_date: v.earliestAllowedDate || v.earliest_allowed_date || v.dueDate || v.administeredDate || v.scheduled_date,
                    recommended_date: v.dueDate || v.recommendedDate || v.recommended_date || v.scheduled_date,
                })).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

                console.log('[NIPTimelineModal] built timeline:', timeline.length, 'items');
                setSchedule(timeline);

            } catch (err) {
                console.error('[NIPTimelineModal] fetch error:', err);
                setFetchError(err.message || 'Failed to load schedule');
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [infant.id]);

    // Portal target - escapes StaffLayout stacking context
    const modalContent = (
        <div
            className="fixed top-0 left-0 w-screen h-screen z-[9999] bg-black/50 flex items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white border border-slate-200 rounded-sm w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 capitalize">
                            {infant.last_name}, {infant.first_name}
                        </h2>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">
                            {infant.reference_id} · Vaccination Timeline
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-[4px] transition-colors flex-shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                            <p className="text-xs font-semibold text-slate-500">
                                Loading schedule...
                            </p>
                        </div>
                    ) : fetchError ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-2">
                            <p className="text-sm font-bold text-red-600">Failed to load schedule</p>
                            <p className="text-xs text-slate-500">{fetchError}</p>
                        </div>
                    ) : schedule.length === 0 ? (
                        <div className="flex items-center justify-center py-20">
                            <p className="text-sm text-slate-400">No schedule data available for this infant.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {schedule.map((item, idx) => {
                                const itemKey = getItemKey(item, idx);
                                const sequenceInfo = sequenceState.get(itemKey) || { isFirstOpenDose: true, blockingDoseLabel: null };
                                const isCompleted  = item?.status === 'COMPLETED';
                                const isOverdue    = item?.urgency === 'overdue' || item?.status === 'OVERDUE';
                                const actionableDate = getActionableDate(item);
                                const daysLate = getDaysLateFromDate(actionableDate);
                                const isDefaulter  = item?.urgency === 'defaulter' || item?.status === 'DEFAULTER' || item?.status === 'DEFAULTED' || daysLate > 42;
                                const needsCatchUp = isDefaulter || isOverdue;
                                const isIneligible = item?.urgency === 'ineligible' || item?.status === 'INELIGIBLE';
                                const isPending = isPendingDose(item);
                                const isExpiredHepB = isHepatitisBBirthDoseExpired(item, infant?.dob);

                                let badgeClass = 'bg-slate-50 text-slate-600 border-slate-200';
                                let badgeLabel = 'Upcoming';
                                if (isCompleted) {
                                    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                    badgeLabel = 'Completed';
                                } else if (isExpiredHepB) {
                                    badgeClass = 'bg-slate-900 text-white border-slate-950';
                                    badgeLabel = 'Expired';
                                } else if (isDefaulter) {
                                    badgeClass = 'bg-red-600 text-white border-red-700';
                                    badgeLabel = 'Defaulter';
                                } else if (isOverdue) {
                                    badgeClass = 'bg-red-50 text-red-700 border-red-200';
                                    badgeLabel = 'Overdue';
                                } else if (item?.urgency === 'due_today' || item?.status === 'DUE_TODAY') {
                                    badgeClass = 'bg-orange-50 text-orange-700 border-orange-200';
                                    badgeLabel = 'Due today';
                                } else if (item?.urgency === 'due_soon' || item?.status === 'DUE_SOON') {
                                    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
                                    badgeLabel = 'Due soon';
                                } else if (isIneligible) {
                                    badgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                                    badgeLabel = 'Ineligible';
                                }

                                return (
                                    <div key={itemKey} className="relative pl-8">
                                        {/* Vertical connector line */}
                                        {idx !== schedule.length - 1 && (
                                            <div className="absolute left-[11px] top-7 bottom-[-24px] w-0.5 bg-slate-100" />
                                        )}

                                        {/* Timeline node dot */}
                                        <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 ${
                                            isCompleted ? 'bg-emerald-500' : isExpiredHepB ? 'bg-slate-900' : isDefaulter ? 'bg-red-600' : isOverdue ? 'bg-amber-500' : isIneligible ? 'bg-slate-400' : 'bg-slate-300'
                                        }`}>
                                            {isCompleted
                                                ? <CircleCheck className="w-3 h-3 text-white" />
                                                : <Clock className="w-3 h-3 text-white" />
                                            }
                                        </div>

                                        {/* Content card */}
                                        <div className={`p-4 border rounded-[4px] ${
                                            isCompleted ? 'bg-white border-slate-100' : 'bg-white border-slate-200'
                                        }`}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                        {item?.vaccineName || item?.vaccine_name || 'Vaccine'}
                                                    </h4>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1 flex items-center gap-2">
                                                        <Calendar className="w-3 h-3" />
                                                        Target: {formatDate(actionableDate)}
                                                        {isCompleted && (item?.administeredDate || item?.actual_date) &&
                                                            ` · Given: ${formatDate(item.administeredDate || item.actual_date)}`
                                                        }
                                                        {needsCatchUp && daysLate > 0 && (
                                                            <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-black ${
                                                                isDefaulter ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700'
                                                            }`}>
                                                                {daysLate}d late
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border flex-shrink-0 ${badgeClass}`}>
                                                    {badgeLabel}
                                                </span>
                                            </div>

                                            {!isCompleted && (!isIneligible || isExpiredHepB) && !isPending && (
                                                <div className="mt-3">
                                                    {(() => {
                                                        const allowedDate = getActionableDate(item);
                                                        const isPremature = allowedDate && dateStringToDayNumber(new Date()) < dateStringToDayNumber(allowedDate);
                                                        const isSequenceLocked = !sequenceInfo.isFirstOpenDose;
                                                        const isDisabled = isExpiredHepB || isPremature || isSequenceLocked;
                                                        return (
                                                            <button
                                                                onClick={() => onRecordDose(item)}
                                                                disabled={isDisabled}
                                                                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                                                    isDisabled
                                                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                                        : needsCatchUp
                                                                            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                                                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                                }`}
                                                            >
                                                                {isExpiredHepB
                                                                    ? 'Expired / Ineligible'
                                                                    : isSequenceLocked
                                                                    ? `${sequenceInfo.blockingDoseLabel || 'Previous dose'} required first`
                                                                    : isPremature
                                                                        ? `Available ${formatDate(allowedDate)}`
                                                                        : needsCatchUp
                                                                            ? 'Record Catch-up Dose'
                                                                            : 'Record dose'}
                                                            </button>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                            {isPending && (
                                                <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-purple-700">
                                                    Awaiting validation before the next dose opens
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // Render via portal so the overlay covers the full viewport,
    // escaping StaffLayout's CSS stacking context entirely
    return ReactDOM.createPortal(modalContent, document.body);
};

/* Main page component */
const NIPSchedulePage = () => {
    const { user } = useAuth();

    // Data
    const [allInfants, setAllInfants] = useState([]);
    const [stats, setStats]           = useState({ overdue: 0, due_today: 0, due_soon: 0, upcoming: 0, completed_today: 0 });
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const hasLoadedRef = useRef(false);

    // Filters
    const [urgencyFilter, setUrgencyFilter] = useState('all');
    const [searchQuery, setSearchQuery]     = useState('');

    // Modals
    const [timelineModal, setTimelineModal] = useState(null); // infant object -> opens NIPTimelineModal
    const [vacModal, setVacModal]           = useState(null); // { infant, vaccine } -> opens RecordVaccinationModal

    // KPI card definitions
    const kpiDefs = [
        { key: 'overdue',         label: 'Overdue',         icon: TriangleAlert, colorText: 'text-red-600',     colorBorder: 'border-l-red-500'     },
        { key: 'due_today',       label: 'Due today',       icon: Clock,         colorText: 'text-orange-600',  colorBorder: 'border-l-orange-400'   },
        { key: 'due_soon',        label: 'Due soon',        icon: Clock,         colorText: 'text-amber-600',   colorBorder: 'border-l-amber-400'    },
        { key: 'completed_today', label: 'Completed today', icon: CircleCheck,   colorText: 'text-emerald-600', colorBorder: 'border-l-emerald-500'  },
    ];

    /* Fetch queue */
    const fetchQueue = useCallback(async ({ silent = false } = {}) => {
        const showBlockingLoader = !silent && !hasLoadedRef.current;
        try {
            if (showBlockingLoader) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }
            const response = await apiClient.get('/schedule/queue');
            if (!response.ok) throw new Error('Failed to fetch queue');
            const data = await response.json();
            if (data.success) {
                setAllInfants(data.infants || []);
                // Ensure defaulter is counted as overdue for the KPI if not provided separately
                const counts = data.counts || { overdue: 0, due_today: 0, due_soon: 0, upcoming: 0, completed_today: 0 };
                if (data.counts?.defaulter) {
                    counts.overdue = (counts.overdue || 0) + data.counts.defaulter;
                }
                setStats(counts);
            }
        } catch (err) {
            console.error('[NIPSchedule] fetch error:', err);
        } finally {
            hasLoadedRef.current = true;
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);

    // 30-second polling
    useEffect(() => {
        const interval = setInterval(() => fetchQueue({ silent: true }), 30000);
        return () => clearInterval(interval);
    }, [fetchQueue]);

    /* Filtering */
    const filtered = useMemo(() => {
        let list = [...allInfants];
        if (urgencyFilter !== 'all') {
            const normalizedFilter = urgencyFilter === 'upcoming' ? 'on_track' : urgencyFilter;
            list = list.filter(i => i.urgency === normalizedFilter);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(i =>
                `${i.first_name} ${i.last_name}`.toLowerCase().includes(q) ||
                (i.reference_id || '').toLowerCase().includes(q) ||
                (i.barangay    || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [allInfants, urgencyFilter, searchQuery]);

    /* Handlers */
    // Called from inside NIPTimelineModal when "Record Dose" is clicked on a vaccine item.
    // Items are camelCase per NIPScheduleService._mapRowToFrontend:
    //   vaccineName, vaccineCode, doseNumber, scheduleId, dueDate
    const handleRecordDose = (item) => {
        if (!timelineModal) return;
        setVacModal({
            // Ensure infant.name is available - RecordVaccinationModal uses this for display
            infant: {
                ...timelineModal,
                name: `${timelineModal.first_name} ${timelineModal.last_name}`,
            },
            vaccine: {
                vaccineName: item.vaccineName  || item.vaccine_name,
                vaccineCode: item.vaccineCode  || item.vaccine_code || item.vaccine,
                doseNumber:  item.doseNumber   || item.dose_number,
                scheduleId:  item.scheduleId   || item.id,
                dueDate:     item.earliestAllowedDate || item.earliest_allowed_date || item.dueDate || item.scheduled_date,
                earliestAllowedDate: item.earliestAllowedDate || item.earliest_allowed_date || item.dueDate || item.scheduled_date,
                recommendedDate: item.dueDate || item.recommended_date || item.recommendedDate,
            },
        });
    };

    const handleKPIClick = (key) => {
        setUrgencyFilter(prev => prev === key ? 'all' : key);
    };

    // After a successful dose record: close both modals, refresh the table
    const afterAction = () => {
        setVacModal(null);
        setTimelineModal(null);
        fetchQueue({ silent: true });
    };

    /* Render */
    return (
        <div className="space-y-6">

            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Vaccination Schedule</h1>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Due, upcoming, and overdue vaccinations
                    </p>
                </div>
                <button
                    onClick={() => fetchQueue({ silent: true })}
                    disabled={loading || refreshing}
                    className="bg-white border border-slate-200 p-2 rounded-[4px] hover:bg-slate-50 transition-colors disabled:opacity-50"
                    title="Refresh"
                >
                    <RefreshCw className={`w-4 h-4 text-slate-500 ${loading || refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiDefs.map(kpi => {
                    const isActive = urgencyFilter === kpi.key;
                    const Icon = kpi.icon;
                    return (
                        <button
                            key={kpi.key}
                            onClick={() => handleKPIClick(kpi.key)}
                            className={`text-left bg-white border border-slate-200 border-l-4 ${kpi.colorBorder} p-4 rounded-sm hover:bg-slate-50 transition-colors ${
                                isActive ? 'ring-1 ring-inset ring-[#2E7D32]' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-bold text-slate-500">
                                    {kpi.label}
                                </p>
                                <Icon className={`w-4 h-4 ${kpi.colorText} opacity-50`} />
                            </div>
                            <p className={`text-3xl font-extrabold ${kpi.colorText}`}>
                                {loading && allInfants.length === 0 ? '-' : (stats[kpi.key] ?? 0)}
                            </p>
                            {isActive && (
                                <p className="text-xs text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active filter
                                </p>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Search and filters */}
            <div className="bg-white border border-slate-200 rounded-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                {/* Search input */}
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name, ID, or barangay..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-[4px] text-xs font-semibold text-slate-700 focus:border-[#2E7D32] focus:bg-white outline-none transition-colors"
                    />
                </div>

                {/* Quick-filter pills */}
                <div className="flex flex-wrap items-center gap-2">
                    {['all', 'defaulter', 'due_soon', 'upcoming', 'completed'].map(f => {
                        const labels = {
                            all: 'All',
                            defaulter: 'Defaulter',
                            due_soon: 'Due soon',
                            upcoming: 'On track',
                            completed: 'Completed'
                        };
                        return (
                            <button
                                key={f}
                                onClick={() => setUrgencyFilter(f)}
                                className={`px-4 py-1.5 mr-2 mb-1 rounded-md text-xs font-semibold border transition-all ${
                                    urgencyFilter === f
                                        ? 'bg-emerald-800 border-emerald-800 text-white shadow-sm'
                                        : 'bg-white border-gray-300 text-gray-600 hover:bg-emerald-50'
                                }`}
                            >
                                {labels[f]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Queue table */}
            <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="max-h-[calc(100vh-420px)] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-slate-200">
                                    <th className="clinical-table-th">Ref. ID</th>
                                    <th className="clinical-table-th">Infant</th>
                                    <th className="clinical-table-th">Location</th>
                                    <th className="clinical-table-th">Next vaccine</th>
                                    <th className="clinical-table-th">Status</th>
                                    <th className="clinical-table-th">Delay</th>
                                    <th className="clinical-table-th text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && allInfants.length === 0 ? (
                                    Array(6).fill(0).map((_, i) => (
                                        <tr key={`skeleton-${i}`} className="animate-pulse">
                                            <td colSpan={7} className="px-4 py-2 bg-slate-50/50 h-10" />
                                        </tr>
                                    ))
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-20 text-center">
                                             <div className="flex flex-col items-center gap-3">
                                                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                                                     <Calendar size={32} className="text-slate-200" />
                                                 </div>
                                                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">No matching records</h3>
                                                 <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                                     No schedule records match your selection. This list is based on validated NIP schedules for active infants.
                                                 </p>
                                             </div>
                                         </td>
                                    </tr>
                                ) : (
                                    filtered.map(infant => {
                                        const cfg = getUrgencyConfig(infant.urgency);
                                        const statusLabel = infant.computed_schedule_status || cfg.label;
                                        return (
                                            <tr
                                                key={infant.id}
                                                className={`hover:bg-slate-50/80 transition-colors group ${cfg.row}`}
                                            >
                                                {/* Ref. ID */}
                                                <td className="clinical-table-td font-mono text-[10px] font-bold text-slate-500">
                                                    {infant.reference_id}
                                                </td>

                                                {/* Infant Name + guardian subtext */}
                                                <td className="clinical-table-td">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-slate-900 capitalize">
                                                            {infant.last_name}, {infant.first_name}
                                                        </span>
                                                        <span className="text-xs text-slate-500 font-medium mt-0.5">
                                                            {infant.guardian_name || infant.mothers_maiden_name || infant.mother_name || '-'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Location */}
                                                <td className="clinical-table-td">
                                                    <div className="flex flex-col text-xs">
                                                        <span className="text-slate-700 font-semibold">{infant.exact_address || infant.barangay}</span>
                                                    </div>
                                                </td>

                                                {/* Next vaccine due */}
                                                <td className="clinical-table-td text-xs font-bold text-slate-700">
                                                    {infant.next_due_vaccine || infant.next_due_date || '-'}
                                                </td>

                                                {/* Status badge */}
                                                <td className="clinical-table-td">
                                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border shadow-sm ${cfg.pill}`}>
                                                        {statusLabel.replace(/_/g, ' ')}
                                                    </span>
                                                </td>

                                                {/* Delay - days overdue */}
                                                <td className="clinical-table-td">
                                                    {(infant.urgency === 'overdue' || infant.urgency === 'defaulter') && (infant.days_overdue > 0) ? (
                                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black border ${
                                                            infant.days_overdue > 28
                                                                ? 'bg-red-600 text-white border-red-700'
                                                                : 'bg-red-50 text-red-700 border-red-200'
                                                        }`}>
                                                            {infant.days_overdue}d late
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">-</span>
                                                    )}
                                                </td>

                                                {/* Actions */}
                                                <td className="clinical-table-td text-right">
                                                    <button
                                                        onClick={() => setTimelineModal(infant)}
                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md transition-colors"
                                                    >
                                                        Manage dose
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Table footer */}
                {!loading && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                        <p className="text-xs font-medium text-slate-500">
                            Showing {filtered.length} of {allInfants.length} records
                        </p>
                    </div>
                )}
            </div>

            {/* NIP timeline modal */}
            {timelineModal && (
                <NIPTimelineModal
                    infant={timelineModal}
                    onClose={() => setTimelineModal(null)}
                    onRecordDose={handleRecordDose}
                />
            )}

            {/* Record vaccination modal */}
            {vacModal && (
                <RecordVaccinationModal
                    isOpen={!!vacModal}
                    onClose={() => setVacModal(null)}
                    infant={vacModal.infant}
                    selectedVaccine={vacModal.vaccine}
                    user={user}
                    onRecordSuccess={afterAction}
                />
            )}
        </div>
    );
};

export default NIPSchedulePage;
