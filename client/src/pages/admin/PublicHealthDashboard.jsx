import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Baby,
    FileClock,
    MapPinned,
    Percent,
    ShieldAlert,
    Users
} from 'lucide-react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { formatAuditAction, formatAuditTarget } from '../../utils/auditFormatter';

const DEFAULT_KPIS = {
    target_population: 0,
    dose1_count: 0,
    final_dose_count: 0,
    dropout_count: 0,
    dropout_rate: 0,
    utilization_rate: 0
};

const DEFAULT_SCOPE = {
    barangay: '',
    barangay_id: null
};

const safeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const formatTimestamp = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'No timestamp available';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
};

const formatAuditTime = (value) => {
    if (!value) return 'No timestamp';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No timestamp';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const formatAuditSentence = (event) => {
    const actor = event?.user_name || 'A staff member';
    const action = formatAuditAction(event?.action_type || event?.action);
    const target = formatAuditTarget(event);
    return `${actor}: ${action}${target ? ` (${target})` : ''}.`;
};

const isEnterOrSpace = (event) => event.key === 'Enter' || event.key === ' ';

const PublicHealthDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [sessionUser, setSessionUser] = useState(user);
    const [liveTimestamp, setLiveTimestamp] = useState(() => new Date());
    const [scope, setScope] = useState(DEFAULT_SCOPE);
    const [kpis, setKpis] = useState(DEFAULT_KPIS);
    const [clusters, setClusters] = useState({ cluster_count: 0, defaulters_in_clusters: 0, clusters: [] });
    const [audit, setAudit] = useState({ total_events: 0, recent_events: [] });
    const [users, setUsers] = useState({ total_active_personnel: 0, bhw_count: 0, midwife_count: 0, personnel: [] });
    const [trends, setTrends] = useState([]);
    const [targetStatus, setTargetStatus] = useState({ has_required_targets: true, system_message: null });
    const [refreshNonce, setRefreshNonce] = useState(0);
    const [loading, setLoading] = useState({
        kpis: true,
        clusters: true,
        audit: true,
        users: true,
        trends: true
    });

    const Maps = (path) => navigate(path);

    useEffect(() => {
        setSessionUser(user);
    }, [user]);

    useEffect(() => {
        const timer = window.setInterval(() => setLiveTimestamp(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setRefreshNonce((current) => current + 1);
        }, 10000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (user?.assigned_barangay && user?.barangay_id) return;

        let active = true;
        const refreshSessionScope = async () => {
            try {
                const response = await apiClient.get('/auth/verify');
                const payload = response.ok ? await response.json() : {};
                if (!response.ok) {
                    console.error('[ADMIN_DASHBOARD_SESSION_SCOPE] verify failed', {
                        status: response.status,
                        payload
                    });
                    return;
                }
                if (!active || !payload?.user) return;

                setSessionUser(payload.user);
                localStorage.setItem('user', JSON.stringify(payload.user));
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_SESSION_SCOPE]', error);
            }
        };

        refreshSessionScope();
        return () => {
            active = false;
        };
    }, [user?.assigned_barangay, user?.barangay_id, user?.id]);

    const requestOptions = useMemo(() => {
        const headers = {};
        const barangay = sessionUser?.assigned_barangay || scope.barangay;
        const barangayId = sessionUser?.barangay_id || scope.barangay_id;

        if (barangay) headers['x-admin-barangay'] = barangay;
        if (barangayId) headers['x-admin-barangay-id'] = String(barangayId);

        return Object.keys(headers).length > 0 ? { headers } : {};
    }, [scope.barangay, scope.barangay_id, sessionUser?.assigned_barangay, sessionUser?.barangay_id]);

    const mergeScope = (payload) => {
        const payloadScope = payload?.scope || {};
        setScope((current) => ({
            barangay: payloadScope.barangay || payload?.barangay || current.barangay,
            barangay_id: payloadScope.barangay_id || payload?.barangay_id || current.barangay_id
        }));
    };

    const logFetchIssue = (section, response, payload) => {
        if (!response?.ok) {
            console.error(`[ADMIN_DASHBOARD_${section}] request failed`, {
                status: response?.status,
                statusText: response?.statusText,
                scope,
                payload
            });
            return;
        }

        if (payload && payload.success === false) {
            console.error(`[ADMIN_DASHBOARD_${section}] backend rejected request`, { scope, payload });
        }
    };

    useEffect(() => {
        let active = true;
        const loadCoverageDashboard = async () => {
            setLoading((current) => ({ ...current, kpis: true, trends: true }));
            try {
                const response = await apiClient.get('/reports/coverage-dashboard', requestOptions);
                const payload = response.ok ? await response.json() : {};
                logFetchIssue('COVERAGE', response, payload);
                if (!active) return;
                mergeScope(payload);
                setKpis({ ...DEFAULT_KPIS, ...(payload?.kpis || {}) });
                setTargetStatus(payload?.target_status || { has_required_targets: true, system_message: null });
                setTrends(Array.isArray(payload?.monthlySeries) ? payload.monthlySeries : []);
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_COVERAGE]', error);
                if (active) {
                    setKpis(DEFAULT_KPIS);
                    setTrends([]);
                    setTargetStatus({ has_required_targets: false, system_message: 'Target Population Not Set' });
                }
            } finally {
                if (active) setLoading((current) => ({ ...current, kpis: false, trends: false }));
            }
        };

        loadCoverageDashboard();
        return () => {
            active = false;
        };
    }, [requestOptions, refreshNonce]);

    useEffect(() => {
        let active = true;
        const loadClusters = async () => {
            setLoading((current) => ({ ...current, clusters: true }));
            try {
                const response = await apiClient.get('/admin/dashboard/clusters', requestOptions);
                const payload = response.ok ? await response.json() : {};
                logFetchIssue('CLUSTERS', response, payload);
                if (!active) return;
                mergeScope(payload);
                setClusters({
                    cluster_count: safeNumber(payload?.cluster_count),
                    defaulters_in_clusters: safeNumber(payload?.defaulters_in_clusters),
                    clusters: Array.isArray(payload?.clusters) ? payload.clusters : []
                });
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_CLUSTERS]', error);
                if (active) setClusters({ cluster_count: 0, defaulters_in_clusters: 0, clusters: [] });
            } finally {
                if (active) setLoading((current) => ({ ...current, clusters: false }));
            }
        };

        loadClusters();
        return () => {
            active = false;
        };
    }, [requestOptions, refreshNonce]);

    useEffect(() => {
        let active = true;
        const loadAudit = async () => {
            setLoading((current) => ({ ...current, audit: true }));
            try {
                const response = await apiClient.get('/admin/dashboard/audit-summary', requestOptions);
                const payload = response.ok ? await response.json() : {};
                logFetchIssue('AUDIT', response, payload);
                if (!active) return;
                mergeScope(payload);
                setAudit({
                    total_events: safeNumber(payload?.audit?.total_events),
                    recent_events: Array.isArray(payload?.audit?.recent_events) ? payload.audit.recent_events : []
                });
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_AUDIT]', error);
                if (active) setAudit({ total_events: 0, recent_events: [] });
            } finally {
                if (active) setLoading((current) => ({ ...current, audit: false }));
            }
        };

        loadAudit();
        return () => {
            active = false;
        };
    }, [requestOptions, refreshNonce]);

    useEffect(() => {
        let active = true;
        const loadUsers = async () => {
            setLoading((current) => ({ ...current, users: true }));
            try {
                const response = await apiClient.get('/admin/dashboard/user-summary', requestOptions);
                const payload = response.ok ? await response.json() : {};
                logFetchIssue('USERS', response, payload);
                if (!active) return;
                mergeScope(payload);
                setUsers({
                    total_active_personnel: safeNumber(payload?.users?.total_active_personnel),
                    bhw_count: safeNumber(payload?.users?.bhw_count),
                    midwife_count: safeNumber(payload?.users?.midwife_count),
                    personnel: Array.isArray(payload?.users?.personnel) ? payload.users.personnel : []
                });
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_USERS]', error);
                if (active) setUsers({ total_active_personnel: 0, bhw_count: 0, midwife_count: 0, personnel: [] });
            } finally {
                if (active) setLoading((current) => ({ ...current, users: false }));
            }
        };

        loadUsers();
        return () => {
            active = false;
        };
    }, [requestOptions, refreshNonce]);

    const assignedBarangay = scope.barangay || sessionUser?.assigned_barangay || 'No barangay assigned';
    const assignedBarangayId = scope.barangay_id || sessionUser?.barangay_id || 'Session scoped';
    const topHotspot = clusters.clusters[0] || null;
    const topHotspotName = topHotspot?.locality || topHotspot?.label || assignedBarangay;
    const topHotspotCount = safeNumber(topHotspot?.total_infants || topHotspot?.count);

    const kpiCards = [
        {
            label: 'Cumulative Target',
            value: safeNumber(kpis.target_population),
            icon: Baby,
            tone: 'bg-green-50 text-green-800',
            route: '/admin/reports/m1'
        },
        {
            label: 'Dose 1 Count',
            value: safeNumber(kpis.dose1_count),
            icon: FileClock,
            tone: 'bg-emerald-50 text-emerald-800',
            route: '/admin/reports/m1'
        },
        {
            label: 'Final Dose Count',
            value: safeNumber(kpis.final_dose_count),
            icon: ShieldAlert,
            tone: 'bg-teal-50 text-teal-800',
            route: '/admin/reports/m1'
        },
        {
            label: 'Dropout Rate',
            value: `${safeNumber(kpis.dropout_rate).toFixed(1)}%`,
            helper: `Utilization ${safeNumber(kpis.utilization_rate).toFixed(1)}%`,
            icon: Percent,
            tone: 'bg-slate-100 text-slate-700',
            route: '/admin/reports/m1'
        }
    ];

    const trendData = useMemo(() => (
        trends.map((point) => ({
            month: point?.month || point?.month_key || 'No data',
            target: safeNumber(point?.penta_target_cumulative),
            final_dose: safeNumber(point?.penta3_cumulative),
            dropout_rate: safeNumber(point?.penta_dropout_rate),
            utilization_rate: safeNumber(point?.penta_utilization_rate)
        }))
    ), [trends]);
    const targetsMissing = targetStatus?.has_required_targets === false;

    return (
        <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="border border-green-900 bg-green-800 px-8 py-6 text-white shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.24em] text-green-100">
                                IMMUNICARE Administrative Oversight
                            </p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight">
                                Admin Decision Support Dashboard
                            </h1>
                            <p className="mt-2 text-sm font-semibold text-green-100">
                                Barangay {assignedBarangay} - Barangay ID {assignedBarangayId}
                            </p>
                        </div>
                        <div className="border border-green-700 bg-green-900 px-5 py-4">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-100">Live Timestamp</p>
                            <p className="mt-1 text-base font-black text-white">{formatTimestamp(liveTimestamp)}</p>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {kpiCards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <button
                                key={card.label}
                                type="button"
                                onClick={() => Maps(card.route)}
                                className="group border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className={`p-3 ${card.tone}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-3xl font-black text-slate-950">
                                            {loading.kpis ? '...' : card.value}
                                        </p>
                                        {card.helper ? <p className="mt-1 text-xs font-semibold text-slate-500">{card.helper}</p> : null}
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                                    <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-green-800" />
                                </div>
                            </button>
                        );
                    })}
                </section>

                {targetsMissing ? (
                    <section className="border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                            <div>
                                <p className="text-sm font-black">Target Population Not Set</p>
                                <p className="mt-1 text-xs font-semibold text-amber-800">
                                    {targetStatus.system_message || 'Set official target populations before interpreting coverage charts.'}
                                </p>
                            </div>
                        </div>
                    </section>
                ) : null}

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <button
                        type="button"
                        onClick={() => Maps('/admin/spatial-analysis')}
                        className="group overflow-hidden rounded-sm border border-slate-200 bg-white text-left shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-800 xl:col-span-2"
                    >
                        <div className="border-b-2 border-emerald-800 bg-white p-6">
                            <div className="mb-1 flex items-center gap-2">
                                <MapPinned size={16} className="text-emerald-800" />
                                <h2 className="text-xs font-black uppercase tracking-[0.15em] text-emerald-800">Local Cluster Map</h2>
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Top 1 Hotspot Location</p>
                        </div>
                        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.4fr_0.8fr]">
                            <div className="relative min-h-[280px] overflow-hidden border-b border-slate-200 bg-[#eef3ef] lg:border-b-0 lg:border-r">
                                <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
                                <div className="absolute left-[-12%] top-[42%] h-6 w-[130%] -rotate-12 bg-white shadow-sm" />
                                <div className="absolute left-[18%] top-[-10%] h-[125%] w-5 rotate-[18deg] bg-white shadow-sm" />
                                <div className="absolute bottom-[12%] left-[6%] h-5 w-[90%] rotate-[4deg] bg-white shadow-sm" />
                                {topHotspot ? (
                                    <div className="absolute left-[46%] top-[42%]">
                                        <div className="flex h-14 w-14 items-center justify-center border-4 border-white bg-rose-600 text-base font-black text-white shadow-sm">
                                            {topHotspotCount}
                                        </div>
                                    </div>
                                ) : null}
                                {!topHotspot ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <p className="border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500">
                                            No hotspot detected
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                            <div className="p-6">
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <span className="rounded-sm border border-rose-600 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-rose-700">
                                            Priority Area
                                        </span>
                                        <div className="rounded-sm bg-rose-50 p-2">
                                            <MapPinned size={16} className="text-rose-500" />
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-800">
                                        {loading.clusters ? 'Loading location...' : topHotspotName}
                                    </h3>
                                    <p className="text-[11px] font-medium leading-relaxed text-slate-500">
                                        {topHotspot
                                            ? 'Concentrated follow-up need detected. Coordinated home visits are recommended for this sector.'
                                            : 'No concentrated follow-up location is currently identified for this barangay.'}
                                    </p>
                                    <div className="rounded-sm border-l-4 border-emerald-800 bg-emerald-50 p-4">
                                        <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">Operational Directive</p>
                                        <p className="text-[11px] font-bold leading-tight text-emerald-600">
                                            Address {loading.clusters ? '...' : topHotspotCount} priority cases in this locality.
                                        </p>
                                    </div>
                                </div>
                                <span className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-green-800">
                                    View full map <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                                </span>
                            </div>
                        </div>
                    </button>

                    <div className="border border-slate-200 bg-white p-6 text-left shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operational Follow-Through</p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">Recent Audit Activity</h2>
                            </div>
                            <div className="bg-green-50 p-3 text-green-800">
                                <Activity className="h-5 w-5" />
                            </div>
                        </div>
                        <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
                            {loading.audit ? (
                                <p className="text-sm font-semibold text-slate-500">Loading audit activity...</p>
                            ) : audit.recent_events.length === 0 ? (
                                <p className="text-sm font-semibold text-slate-500">No recent audit activity</p>
                            ) : (
                                audit.recent_events.slice(0, 3).map((event) => (
                                    <button
                                        type="button"
                                        key={event?.id}
                                        onClick={() => Maps(`/admin/audit?entry=${encodeURIComponent(event?.id || '')}`)}
                                        className="w-full border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800"
                                    >
                                        <p className="text-sm font-black text-slate-950">{formatAuditSentence(event)}</p>
                                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">{formatAuditTime(event?.timestamp)}</p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                <section className="border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Barangay User Summary</p>
                            <h2 className="mt-1 text-xl font-black text-slate-950">Active BHWs and Midwives in {assignedBarangay}</h2>
                        </div>
                        <div className="bg-green-50 p-3 text-green-800">
                            <Users className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {[
                            ['Active Personnel', users.total_active_personnel],
                            ['BHWs', users.bhw_count],
                            ['Midwives', users.midwife_count]
                        ].map(([label, value]) => (
                            <div key={label} className="border border-slate-200 bg-slate-50 p-5">
                                <p className="text-3xl font-black text-slate-950">{loading.users ? '...' : safeNumber(value)}</p>
                                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {loading.users ? (
                            <p className="text-sm font-semibold text-slate-500">Loading personnel records...</p>
                        ) : users.personnel.length === 0 ? (
                            <p className="text-sm font-semibold text-slate-500">No active personnel records</p>
                        ) : (
                            users.personnel.slice(0, 6).map((person) => (
                                <button
                                    type="button"
                                    key={person?.id}
                                    onClick={() => Maps(`/admin/users?user=${encodeURIComponent(person?.id || '')}`)}
                                    className="flex items-center justify-between border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800"
                                >
                                    <p className="font-black text-slate-950">{person?.full_name || person?.id || 'No name available'}</p>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{person?.role || 'No role'}</p>
                                </button>
                            ))
                        )}
                    </div>
                </section>

                <section
                    role="button"
                    tabIndex={0}
                    onClick={() => Maps('/admin/reports/m1')}
                    onKeyDown={(event) => {
                        if (isEnterOrSpace(event)) Maps('/admin/reports/m1');
                    }}
                    className="cursor-pointer border border-slate-200 bg-white shadow-sm transition hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800"
                >
                    <div className="border-b border-slate-200 px-6 py-5">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Coverage Trend</p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">
                                    Target, Final Dose, Drop-out, and Utilization
                                </h2>
                            </div>
                            <span className="hidden items-center gap-2 text-xs font-black uppercase tracking-wider text-green-800 sm:inline-flex">
                                Open M1 report <ArrowRight className="h-4 w-4" />
                            </span>
                        </div>
                    </div>
                    <div className="h-[360px] p-6">
                        {loading.trends ? (
                            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                                Loading trend records...
                            </div>
                        ) : targetsMissing ? (
                            <div className="flex h-full items-center justify-center text-sm font-semibold text-amber-800">
                                Target Population Not Set
                            </div>
                        ) : trendData.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                                No trend records available
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trendData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value, name) => [
                                            String(name).includes('Rate')
                                                ? `${safeNumber(value).toFixed(1)}%`
                                                : safeNumber(value).toLocaleString(),
                                            name
                                        ]}
                                        contentStyle={{ border: '1px solid #CBD5E1', borderRadius: 0 }}
                                    />
                                    <Legend />
                                    <Line type="monotone" name="Cumulative Target" dataKey="target" stroke="#64748B" strokeWidth={2} dot={false} />
                                    <Line type="monotone" name="Cumulative Final Dose" dataKey="final_dose" stroke="#047857" strokeWidth={3} dot={{ r: 3, fill: '#047857' }} activeDot={{ r: 5 }} />
                                    <Line type="monotone" name="Drop-out Rate" dataKey="dropout_rate" stroke="#B91C1C" strokeWidth={3} dot={{ r: 3, fill: '#B91C1C' }} activeDot={{ r: 5 }} />
                                    <Line type="monotone" name="Utilization Rate" dataKey="utilization_rate" stroke="#0F766E" strokeWidth={3} dot={{ r: 3, fill: '#0F766E' }} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PublicHealthDashboard;
