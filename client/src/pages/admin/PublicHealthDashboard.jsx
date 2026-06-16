import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Popup, ScaleControl, useMap } from 'react-leaflet';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Baby,
    Loader2,
    MapPinned,
    Percent,
    ShieldAlert,
    Users
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../contexts/AuthContext';
import { useBarangayFilter } from '../../contexts/BarangayFilterContext';
import apiClient from '../../services/apiClient';
import { formatAuditAction, formatAuditTarget } from '../../utils/auditFormatter';
import { getBarangayCenter } from '../../utils/barangayConfig';
import { barangayBoundaryStyle, getBarangayBoundaryGeoJson } from '../../utils/barangayBoundaries';

const DEFAULT_KPIS = {
    total_active_infants: 0,
    pending_midwife_validations: 0,
    total_current_defaulters: 0,
    target_population: 0,
    dose1_count: 0,
    final_dose_count: 0,
    dropout_count: 0,
    dropout_rate: 0,
    utilization_rate: 0
};

const DEFAULT_SCOPE = {
    barangay: '',
    barangay_id: null,
    label: '',
    type: ''
};

const DEFAULT_SUPERADMIN_METRICS = {
    total_registered_infants: 0,
    active_bhws: 0,
    active_midwives: 0,
    active_barangay_admins: 0,
    managed_barangays: 0,
    overall_nip_compliance_rate: 0,
    active_hotspots: 0,
    current_defaulters: 0,
    pending_validations: 0
};

const DEFAULT_TARGET_RANKING = {
    rows: [],
    summary: {
        target: 0,
        actual: 0,
        gap: 0
    }
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

const getRankingStatusClassName = (status = '') => {
    if (status === 'On Track') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'Monitor') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (status === 'Target Missing') return 'border-slate-200 bg-slate-100 text-slate-600';
    return 'border-rose-200 bg-rose-50 text-rose-800';
};

const toMapFloat = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const FlyToHotspot = ({ center, fallbackCenter }) => {
    const map = useMap();

    useEffect(() => {
        if (center) {
            map.flyTo(center, 18, { duration: 0.6 });
        } else if (fallbackCenter) {
            map.setView(fallbackCenter, 16);
        }
    }, [center, fallbackCenter, map]);

    return null;
};

const PublicHealthDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { selectedBarangay } = useBarangayFilter();
    const [sessionUser, setSessionUser] = useState(user);
    const [liveTimestamp, setLiveTimestamp] = useState(() => new Date());
    const [scope, setScope] = useState(DEFAULT_SCOPE);
    const [kpis, setKpis] = useState(DEFAULT_KPIS);
    const [clusters, setClusters] = useState({ cluster_count: 0, defaulters_in_clusters: 0, clusters: [] });
    const [audit, setAudit] = useState({ total_events: 0, recent_events: [] });
    const [users, setUsers] = useState({ total_active_personnel: 0, bhw_count: 0, midwife_count: 0, personnel: [] });
    const [superAdminMetrics, setSuperAdminMetrics] = useState(DEFAULT_SUPERADMIN_METRICS);
    const [targetRanking, setTargetRanking] = useState(DEFAULT_TARGET_RANKING);
    const [trends, setTrends] = useState([]);
    const [targetStatus, setTargetStatus] = useState({ has_required_targets: true, system_message: null });
    const [refreshNonce, setRefreshNonce] = useState(0);
    const loadedSectionsRef = useRef({
        coverage: false,
        summary: false,
        ranking: false,
        clusters: false,
        audit: false,
        users: false
    });
    const [loading, setLoading] = useState({
        kpis: true,
        clusters: true,
        audit: true,
        users: true,
        trends: true,
        ranking: false
    });
    const [errors, setErrors] = useState({
        kpis: '',
        clusters: '',
        audit: '',
        users: '',
        trends: '',
        summary: '',
        ranking: ''
    });

    const Maps = (path) => navigate(path);
    const isSuperAdmin = sessionUser?.role === 'Super Admin';
    const routePrefix = isSuperAdmin ? '/superadmin' : '/admin';
    const reportsRoute = isSuperAdmin ? '/superadmin/reports' : '/admin/reports/m1';
    const spatialRoute = isSuperAdmin ? '/superadmin/geospatial' : '/admin/spatial-analysis';
    const auditRoute = `${routePrefix}/audit`;
    const usersRoute = `${routePrefix}/users`;

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
        const barangay = sessionUser?.assigned_barangay;
        const barangayId = sessionUser?.barangay_id;

        if (barangay) {
            headers['x-admin-barangay'] = barangay;
        } else if (sessionUser?.role === 'Super Admin' && selectedBarangay && selectedBarangay !== 'all') {
            headers['x-admin-barangay'] = selectedBarangay;
        }

        if (barangayId) headers['x-admin-barangay-id'] = String(barangayId);

        return Object.keys(headers).length > 0 ? { headers } : {};
    }, [sessionUser?.assigned_barangay, sessionUser?.barangay_id, sessionUser?.role, selectedBarangay]);

    const mergeScope = useCallback((payload) => {
        const payloadScope = payload?.scope || {};
        setScope((current) => ({
            barangay: payloadScope.barangay ?? payload?.barangay ?? current.barangay,
            barangay_id: payloadScope.barangay_id ?? payload?.barangay_id ?? current.barangay_id,
            label: payloadScope.label || current.label,
            type: payloadScope.type || payload?.scope_type || current.type
        }));
    }, []);

    const readDashboardPayload = useCallback(async (response, fallbackMessage) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
            throw new Error(payload?.error || payload?.message || fallbackMessage || `Request failed with HTTP ${response.status}`);
        }
        return payload;
    }, []);

    const withCacheBust = useCallback((endpoint) => {
        const separator = endpoint.includes('?') ? '&' : '?';
        return `${endpoint}${separator}t=${Date.now()}`;
    }, []);

    const noCacheRequestOptions = useMemo(() => ({
        ...requestOptions,
        headers: {
            ...(requestOptions.headers || {}),
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            Expires: '0'
        }
    }), [requestOptions]);

    const logFetchIssue = useCallback((section, response, payload) => {
        if (!response?.ok) {
            console.error(`[ADMIN_DASHBOARD_${section}] request failed`, {
                status: response?.status,
                statusText: response?.statusText,
                payload
            });
            return;
        }

        if (payload && payload.success === false) {
            console.error(`[ADMIN_DASHBOARD_${section}] backend rejected request`, { payload });
        }
    }, []);

    useEffect(() => {
        let active = true;
        const loadCoverageDashboard = async () => {
            const firstLoad = !loadedSectionsRef.current.coverage;
            if (firstLoad) {
                setLoading((current) => ({ ...current, kpis: !isSuperAdmin, trends: true }));
            }
            setErrors((current) => ({ ...current, kpis: '', trends: '' }));
            try {
                const reportYear = new Date().getFullYear();
                const [coverageResponse, kpiResponse] = await Promise.all([
                    apiClient.get(
                        withCacheBust(`/reports/coverage-dashboard?year=${reportYear}`),
                        noCacheRequestOptions
                    ),
                    isSuperAdmin
                        ? Promise.resolve(null)
                        : apiClient.get(withCacheBust('/admin/dashboard/kpis'), noCacheRequestOptions)
                ]);
                const payload = await readDashboardPayload(coverageResponse, 'Unable to load coverage dashboard.');
                const kpiPayload = kpiResponse
                    ? await readDashboardPayload(kpiResponse, 'Unable to load operational dashboard metrics.')
                    : null;
                logFetchIssue('COVERAGE', coverageResponse, payload);
                if (kpiResponse) logFetchIssue('KPI', kpiResponse, kpiPayload);
                if (!active) return;
                mergeScope(payload);
                setKpis({ ...DEFAULT_KPIS, ...(payload?.kpis || {}), ...(kpiPayload?.kpis || {}) });
                setTargetStatus(payload?.target_status || { has_required_targets: true, system_message: null });
                setTrends(Array.isArray(payload?.monthlySeries) ? payload.monthlySeries : []);
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_COVERAGE]', error);
                if (active) {
                    setKpis(DEFAULT_KPIS);
                    setTrends([]);
                    setTargetStatus({ has_required_targets: false, system_message: 'Target Population Not Set' });
                    setErrors((current) => ({ ...current, kpis: error.message || 'Unable to load coverage dashboard.', trends: error.message || 'Unable to load coverage trend.' }));
                }
            } finally {
                if (active) {
                    loadedSectionsRef.current.coverage = true;
                    setLoading((current) => ({ ...current, kpis: isSuperAdmin ? current.kpis : false, trends: false }));
                }
            }
        };

        loadCoverageDashboard();
        return () => {
            active = false;
        };
    }, [isSuperAdmin, logFetchIssue, mergeScope, noCacheRequestOptions, readDashboardPayload, refreshNonce, withCacheBust]);

    useEffect(() => {
        if (!isSuperAdmin) {
            setSuperAdminMetrics(DEFAULT_SUPERADMIN_METRICS);
            setErrors((current) => ({ ...current, summary: '' }));
            return undefined;
        }

        let active = true;
        const loadSuperAdminSummary = async () => {
            if (!loadedSectionsRef.current.summary) {
                setLoading((current) => ({ ...current, kpis: true, audit: true, users: true, clusters: true }));
            }
            setErrors((current) => ({ ...current, summary: '' }));
            try {
                const response = await apiClient.get(withCacheBust('/admin/dashboard/superadmin-summary'), noCacheRequestOptions);
                const payload = await readDashboardPayload(response, 'Unable to load Super Admin dashboard metrics.');
                if (!active) return;
                mergeScope(payload);
                setSuperAdminMetrics({ ...DEFAULT_SUPERADMIN_METRICS, ...(payload?.metrics || {}) });
                if (Array.isArray(payload?.hotspots)) {
                    setClusters({
                        cluster_count: safeNumber(payload.hotspots.length),
                        defaulters_in_clusters: safeNumber(payload.hotspots.reduce((sum, cluster) => sum + Number(cluster.total_infants || cluster.count || 0), 0)),
                        clusters: payload.hotspots
                    });
                }
                if (Array.isArray(payload?.personnel)) {
                    setUsers((current) => ({
                        ...current,
                        total_active_personnel: safeNumber(payload?.users?.total_active_personnel, payload.personnel.length),
                        bhw_count: safeNumber(payload?.users?.bhw_count),
                        midwife_count: safeNumber(payload?.users?.midwife_count),
                        admin_count: safeNumber(payload?.users?.admin_count, payload.personnel.length),
                        managed_barangay_count: safeNumber(payload?.users?.managed_barangay_count),
                        personnel: payload.personnel
                    }));
                }
                if (Array.isArray(payload?.recent_audit_events)) {
                    setAudit((current) => ({ ...current, recent_events: payload.recent_audit_events }));
                }
            } catch (error) {
                console.error('[SUPERADMIN_DASHBOARD_SUMMARY]', error);
                if (active) {
                    setSuperAdminMetrics(DEFAULT_SUPERADMIN_METRICS);
                    setErrors((current) => ({ ...current, summary: error.message || 'Unable to load Super Admin dashboard metrics.' }));
                }
            } finally {
                if (active) {
                    loadedSectionsRef.current.summary = true;
                    setLoading((current) => ({ ...current, kpis: false, audit: false, users: false, clusters: false }));
                }
            }
        };

        loadSuperAdminSummary();
        return () => {
            active = false;
        };
    }, [isSuperAdmin, mergeScope, noCacheRequestOptions, readDashboardPayload, refreshNonce, withCacheBust]);

    useEffect(() => {
        if (!isSuperAdmin) {
            setTargetRanking(DEFAULT_TARGET_RANKING);
            setErrors((current) => ({ ...current, ranking: '' }));
            return undefined;
        }

        let active = true;
        const loadTargetRanking = async () => {
            if (!loadedSectionsRef.current.ranking) {
                setLoading((current) => ({ ...current, ranking: true }));
            }
            setErrors((current) => ({ ...current, ranking: '' }));
            try {
                const response = await apiClient.get('/admin/dashboard/target-ranking', requestOptions);
                const payload = await readDashboardPayload(response, 'Unable to load barangay target ranking.');
                if (!active) return;
                mergeScope(payload);
                setTargetRanking({
                    rows: Array.isArray(payload?.rows) ? payload.rows : [],
                    summary: {
                        target: safeNumber(payload?.summary?.target),
                        actual: safeNumber(payload?.summary?.actual),
                        gap: safeNumber(payload?.summary?.gap)
                    }
                });
            } catch (error) {
                console.error('[SUPERADMIN_TARGET_RANKING]', error);
                if (active) {
                    setTargetRanking(DEFAULT_TARGET_RANKING);
                    setErrors((current) => ({ ...current, ranking: error.message || 'Unable to load barangay target ranking.' }));
                }
            } finally {
                if (active) {
                    loadedSectionsRef.current.ranking = true;
                    setLoading((current) => ({ ...current, ranking: false }));
                }
            }
        };

        loadTargetRanking();
        return () => {
            active = false;
        };
    }, [isSuperAdmin, mergeScope, readDashboardPayload, requestOptions, refreshNonce]);

    useEffect(() => {
        if (isSuperAdmin) return undefined;

        let active = true;
        const loadClusters = async () => {
            if (!loadedSectionsRef.current.clusters) {
                setLoading((current) => ({ ...current, clusters: true }));
            }
            setErrors((current) => ({ ...current, clusters: '' }));
            try {
                const response = await apiClient.get('/admin/dashboard/clusters', requestOptions);
                const payload = await readDashboardPayload(response, 'Unable to load cluster metrics.');
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
                if (active) {
                    setClusters({ cluster_count: 0, defaulters_in_clusters: 0, clusters: [] });
                    setErrors((current) => ({ ...current, clusters: error.message || 'Unable to load cluster metrics.' }));
                }
            } finally {
                if (active) {
                    loadedSectionsRef.current.clusters = true;
                    setLoading((current) => ({ ...current, clusters: false }));
                }
            }
        };

        loadClusters();
        return () => {
            active = false;
        };
    }, [isSuperAdmin, logFetchIssue, mergeScope, readDashboardPayload, requestOptions, refreshNonce]);

    useEffect(() => {
        if (isSuperAdmin) return undefined;

        let active = true;
        const loadAudit = async () => {
            if (!loadedSectionsRef.current.audit) {
                setLoading((current) => ({ ...current, audit: true }));
            }
            setErrors((current) => ({ ...current, audit: '' }));
            try {
                const response = await apiClient.get(withCacheBust('/admin/dashboard/audit-summary'), noCacheRequestOptions);
                const payload = await readDashboardPayload(response, 'Unable to load audit activity.');
                logFetchIssue('AUDIT', response, payload);
                if (!active) return;
                mergeScope(payload);
                setAudit({
                    total_events: safeNumber(payload?.audit?.total_events),
                    recent_events: Array.isArray(payload?.audit?.recent_events) ? payload.audit.recent_events : []
                });
            } catch (error) {
                console.error('[ADMIN_DASHBOARD_AUDIT]', error);
                if (active) {
                    setAudit({ total_events: 0, recent_events: [] });
                    setErrors((current) => ({ ...current, audit: error.message || 'Unable to load audit activity.' }));
                }
            } finally {
                if (active) {
                    loadedSectionsRef.current.audit = true;
                    setLoading((current) => ({ ...current, audit: false }));
                }
            }
        };

        loadAudit();
        return () => {
            active = false;
        };
    }, [isSuperAdmin, logFetchIssue, mergeScope, noCacheRequestOptions, readDashboardPayload, refreshNonce, withCacheBust]);

    useEffect(() => {
        if (isSuperAdmin) return undefined;

        let active = true;
        const loadUsers = async () => {
            if (!loadedSectionsRef.current.users) {
                setLoading((current) => ({ ...current, users: true }));
            }
            setErrors((current) => ({ ...current, users: '' }));
            try {
                const response = await apiClient.get('/admin/dashboard/user-summary', requestOptions);
                const payload = await readDashboardPayload(response, 'Unable to load personnel summary.');
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
                if (active) {
                    setUsers({ total_active_personnel: 0, bhw_count: 0, midwife_count: 0, personnel: [] });
                    setErrors((current) => ({ ...current, users: error.message || 'Unable to load personnel summary.' }));
                }
            } finally {
                if (active) {
                    loadedSectionsRef.current.users = true;
                    setLoading((current) => ({ ...current, users: false }));
                }
            }
        };

        loadUsers();
        return () => {
            active = false;
        };
    }, [isSuperAdmin, logFetchIssue, mergeScope, readDashboardPayload, requestOptions, refreshNonce]);

    const assignedBarangay = useMemo(() => (isSuperAdmin
        ? (scope.barangay || scope.label || 'RHU 2 - All Barangays')
        : (scope.barangay || sessionUser?.assigned_barangay || 'No barangay assigned')), [isSuperAdmin, scope.barangay, scope.label, sessionUser?.assigned_barangay]);
    const assignedBarangayId = useMemo(() => (isSuperAdmin
        ? (scope.barangay_id || (scope.barangay ? 'Selected barangay' : 'Municipal aggregate'))
        : (scope.barangay_id || sessionUser?.barangay_id || 'Session scoped')), [isSuperAdmin, scope.barangay, scope.barangay_id, sessionUser?.barangay_id]);
    const topHotspot = useMemo(() => clusters.clusters[0] || null, [clusters.clusters]);
    const topHotspotName = useMemo(() => topHotspot?.locality || topHotspot?.label || assignedBarangay, [assignedBarangay, topHotspot]);
    const topHotspotCount = useMemo(() => safeNumber(topHotspot?.total_infants || topHotspot?.count), [topHotspot]);
    const barangayCenter = useMemo(() => getBarangayCenter(assignedBarangay), [assignedBarangay]);
    const barangayBoundaryData = useMemo(() => getBarangayBoundaryGeoJson(assignedBarangay), [assignedBarangay]);
    const hotspotCenter = useMemo(() => {
        const lat = toMapFloat(topHotspot?.lat ?? topHotspot?.centroid_latitude);
        const lng = toMapFloat(topHotspot?.lng ?? topHotspot?.centroid_longitude);
        return lat != null && lng != null ? [lat, lng] : null;
    }, [topHotspot]);
    const fallbackMapCenter = useMemo(() => [barangayCenter.lat, barangayCenter.lng], [barangayCenter.lat, barangayCenter.lng]);

    const kpiCards = useMemo(() => {
        if (isSuperAdmin) {
            return [
                {
                    label: 'Total Registered Infants',
                    value: safeNumber(superAdminMetrics.total_registered_infants),
                    helper: `${safeNumber(superAdminMetrics.pending_validations)} pending validations`,
                    icon: Baby,
                    tone: 'bg-green-50 text-green-800',
                    route: reportsRoute
                },
                {
                    label: 'Managed Barangay Admins',
                    value: safeNumber(superAdminMetrics.active_barangay_admins),
                    helper: `${safeNumber(superAdminMetrics.managed_barangays)} barangays in scope`,
                    icon: Users,
                    tone: 'bg-emerald-50 text-emerald-800',
                    route: usersRoute
                },
                {
                    label: 'Overall NIP Compliance',
                    value: `${safeNumber(superAdminMetrics.overall_nip_compliance_rate).toFixed(1)}%`,
                    helper: 'Final dose vs configured target',
                    icon: Percent,
                    tone: 'bg-teal-50 text-teal-800',
                    route: reportsRoute
                },
                {
                    label: 'Active Hotspots',
                    value: safeNumber(superAdminMetrics.active_hotspots),
                    helper: `${safeNumber(superAdminMetrics.current_defaulters)} current defaulters`,
                    icon: MapPinned,
                    tone: 'bg-rose-50 text-rose-700',
                    route: spatialRoute
                }
            ];
        }

        const operationalTargetGap = safeNumber(
            kpis.operational_target_gap,
            Math.max(0, safeNumber(kpis.target_population) - safeNumber(kpis.final_dose_count))
        );

        return [
            {
                label: 'TARGET POPULATION',
                value: safeNumber(kpis.target_population),
                source: 'M1 TARGET',
                icon: Baby,
                tone: 'bg-green-50 text-green-800',
                route: reportsRoute
            },
            {
                label: 'ACTUAL POPULATION',
                value: safeNumber(kpis.actual_population, safeNumber(kpis.total_active_infants)),
                source: 'LIVE REGISTRY',
                icon: Users,
                tone: 'bg-emerald-50 text-emerald-800',
                route: reportsRoute
            },
            {
                label: 'OPERATIONAL GAP',
                value: operationalTargetGap,
                source: 'DEFICIT',
                icon: Percent,
                tone: 'bg-amber-50 text-amber-800',
                route: reportsRoute
            },
            {
                label: 'DEFAULTERS',
                value: safeNumber(kpis.total_current_defaulters),
                source: 'SCHEDULE STATUS',
                icon: ShieldAlert,
                tone: 'bg-rose-50 text-rose-700',
                route: reportsRoute
            }
        ];
    }, [clusters.cluster_count, isSuperAdmin, kpis, reportsRoute, spatialRoute, superAdminMetrics, usersRoute]);

    const workforceCards = useMemo(() => (
        isSuperAdmin
            ? [
                ['Managed Barangay Admins', users.admin_count ?? users.total_active_personnel],
                ['Directory Admin Accounts', users.total_active_personnel],
                ['Barangays in Scope', users.managed_barangay_count]
            ]
            : [
                ['Active Personnel', users.total_active_personnel],
                ['BHWs', users.bhw_count],
                ['Midwives', users.midwife_count]
            ]
    ), [isSuperAdmin, users]);

    const rankingSummaryCards = useMemo(() => ([
        ['NIP Eligible Target', targetRanking.summary.target],
        ['Actual Population', targetRanking.summary.actual],
        ['Operational Gap', targetRanking.summary.gap]
    ]), [targetRanking.summary.actual, targetRanking.summary.gap, targetRanking.summary.target]);

    const rankingRows = useMemo(() => targetRanking.rows, [targetRanking.rows]);

    const trendChartMargin = useMemo(() => ({ top: 8, right: 24, left: 0, bottom: 8 }), []);
    const targetChartMargin = useMemo(() => ({ top: 8, right: 24, left: 0, bottom: 24 }), []);

    const targetComparisonData = useMemo(() => (
        rankingRows.map((row) => ({
            barangay: row.barangay || 'Unassigned',
            target: safeNumber(row.target),
            actual: safeNumber(row.actual)
        }))
    ), [rankingRows]);

    const trendData = useMemo(() => (
        trends.map((point) => ({
            month: point?.month || point?.month_key || 'No data',
            target: safeNumber(point?.penta_target_cumulative ?? point?.cumulative_target_population),
            final_dose: safeNumber(point?.penta3_cumulative),
            dropout_rate: safeNumber(point?.penta_dropout_rate ?? point?.dropout_rate),
            utilization_rate: safeNumber(point?.penta_utilization_rate ?? point?.utilization_rate)
        }))
    ), [trends]);
    const targetsMissing = targetStatus?.has_required_targets === false;
    const ErrorNotice = ({ message }) => message ? (
        <div role="alert" className="flex items-start gap-2 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
        </div>
    ) : null;

    return (
        <div className="min-w-0">
            <div className="mx-auto w-full max-w-7xl min-w-0 space-y-6">
                <section className="border border-green-900 bg-green-800 px-8 py-6 text-white shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.24em] text-green-100">
                                {isSuperAdmin ? 'IMMUNICARE Municipal Oversight' : 'IMMUNICARE Administrative Oversight'}
                            </p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight">
                                {isSuperAdmin ? 'Super Admin Decision Support Dashboard' : 'Admin Decision Support Dashboard'}
                            </h1>
                            <p className="mt-2 text-sm font-semibold text-green-100">
                                {isSuperAdmin ? assignedBarangay : `Barangay ${assignedBarangay}`} - {isSuperAdmin ? assignedBarangayId : `Barangay ID ${assignedBarangayId}`}
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
                                        <div className="flex min-h-[2.25rem] justify-end">
                                            {loading.kpis ? (
                                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                            ) : (
                                                <p className="text-3xl font-black text-slate-950">{card.value}</p>
                                            )}
                                        </div>
                                        {isSuperAdmin && card.helper ? <p className="mt-1 text-xs font-semibold text-slate-500">{card.helper}</p> : null}
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
                                    <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:text-green-800" />
                                </div>
                                {card.source ? (
                                    <span className="mt-3 inline-flex border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-800">
                                        {card.source}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </section>

                <ErrorNotice message={isSuperAdmin ? errors.summary : errors.kpis} />

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
                    {isSuperAdmin ? (
                        <div className="overflow-hidden border border-slate-200 bg-white shadow-sm xl:col-span-2">
                            <div className="flex flex-col gap-4 border-b-2 border-emerald-800 bg-white p-5 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.15em] text-emerald-800">Barangay Target Performance Ranking</p>
                                    <h2 className="mt-1 text-xl font-black text-slate-950">Municipal NIP Target Execution</h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        Lowest operational deficit ranks first for rapid municipal oversight.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => Maps(spatialRoute)}
                                    className="inline-flex h-10 items-center justify-center gap-2 border border-emerald-800 bg-emerald-800 px-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-800"
                                >
                                    Open geospatial view <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 border-b border-slate-200">
                                {rankingSummaryCards.map(([label, value]) => (
                                    <div key={label} className="border-r border-slate-200 px-4 py-3 last:border-r-0">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                                        <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">
                                            {loading.ranking ? '...' : safeNumber(value).toLocaleString()}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="w-full overflow-x-auto">
                                {loading.ranking ? (
                                    <div className="flex min-h-[260px] items-center justify-center text-sm font-semibold text-slate-500">
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Loading barangay ranking...
                                    </div>
                                ) : errors.ranking ? (
                                    <div className="min-h-[260px] px-5 py-6">
                                        <ErrorNotice message={errors.ranking} />
                                    </div>
                                ) : (
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {['Rank', 'Barangay', 'NIP Eligible Target', 'Actual Population', 'Operational Gap', 'Action Status'].map((header) => (
                                                    <th
                                                        key={header}
                                                        className="border-b border-slate-200 px-3 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"
                                                    >
                                                        {header}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rankingRows.map((row, index) => (
                                                <tr key={row.barangay || index} className={index % 2 ? 'bg-slate-50/70' : 'bg-white'}>
                                                    <td className="border-b border-slate-200 px-3 py-3 text-xs font-black text-slate-500">{row.rank || index + 1}</td>
                                                    <td className="border-b border-slate-200 px-3 py-3 text-xs font-black uppercase text-slate-950">{row.barangay || 'Unassigned'}</td>
                                                    <td className="border-b border-slate-200 px-3 py-3 text-right text-xs font-semibold tabular-nums text-slate-700">{safeNumber(row.target).toLocaleString()}</td>
                                                    <td className="border-b border-slate-200 px-3 py-3 text-right text-xs font-semibold tabular-nums text-slate-700">{safeNumber(row.actual).toLocaleString()}</td>
                                                    <td className="border-b border-slate-200 px-3 py-3 text-right text-xs font-black tabular-nums text-slate-950">{safeNumber(row.gap).toLocaleString()}</td>
                                                    <td className="border-b border-slate-200 px-3 py-3">
                                                        <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${getRankingStatusClassName(row.status)}`}>
                                                            {row.status || 'Action Needed'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {rankingRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                                        No target ranking rows are available for the current scope.
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-sm border border-slate-200 bg-white text-left shadow-sm xl:col-span-2">
                            <div className="border-b-2 border-emerald-800 bg-white p-6">
                                <div className="mb-1 flex items-center gap-2">
                                    <MapPinned size={16} className="text-emerald-800" />
                                    <h2 className="text-xs font-black uppercase tracking-[0.15em] text-emerald-800">Local Cluster Map</h2>
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Top 1 Hotspot Location</p>
                            </div>
                            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.4fr_0.8fr]">
                                <div className="relative h-[320px] min-h-[320px] overflow-hidden border-b border-slate-200 bg-slate-100 lg:border-b-0 lg:border-r">
                                    <MapContainer
                                        center={hotspotCenter || fallbackMapCenter}
                                        zoom={hotspotCenter ? 18 : (barangayCenter.zoom || 16)}
                                        minZoom={13}
                                        maxZoom={19}
                                        scrollWheelZoom={false}
                                        style={{ height: '100%', width: '100%' }}
                                    >
                                        <TileLayer
                                            attribution="Tiles &copy; Esri"
                                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                            maxZoom={19}
                                        />
                                        <TileLayer
                                            attribution="&copy; CARTO"
                                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                                            maxZoom={19}
                                            zIndex={650}
                                        />
                                        <ScaleControl position="bottomleft" />
                                        <FlyToHotspot center={hotspotCenter} fallbackCenter={fallbackMapCenter} />
                                        {barangayBoundaryData ? (
                                            <GeoJSON
                                                key={`dashboard-boundary-${assignedBarangay}`}
                                                data={barangayBoundaryData}
                                                style={barangayBoundaryStyle}
                                            />
                                        ) : null}
                                        {hotspotCenter ? (
                                            <CircleMarker
                                                center={hotspotCenter}
                                                radius={15}
                                                pathOptions={{
                                                    color: '#ffffff',
                                                    fillColor: '#dc2626',
                                                    fillOpacity: 0.92,
                                                    weight: 4
                                                }}
                                            >
                                                <Popup>
                                                    <div className="text-sm">
                                                        <p className="font-black text-slate-950">{topHotspotName}</p>
                                                        <p className="text-xs font-semibold text-slate-600">
                                                            {topHotspotCount} priority infant{topHotspotCount === 1 ? '' : 's'}
                                                        </p>
                                                    </div>
                                                </Popup>
                                            </CircleMarker>
                                        ) : null}
                                    </MapContainer>
                                    {!topHotspot || !hotspotCenter ? (
                                        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center bg-white/55">
                                            <p className="border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500">
                                                {loading.clusters ? 'Loading hotspot map...' : 'No mapped hotspot detected'}
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
                                        <h3 className="flex min-h-[1.75rem] items-center text-xl font-black text-slate-800">
                                            {loading.clusters ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : topHotspotName}
                                        </h3>
                                        <p className="text-[11px] font-medium leading-relaxed text-slate-500">
                                            {topHotspot
                                                ? 'Concentrated follow-up need detected. Coordinated home visits are recommended for this sector.'
                                                : 'No concentrated follow-up location is currently identified for this barangay.'}
                                        </p>
                                        <div className="rounded-sm border-l-4 border-emerald-800 bg-emerald-50 p-4">
                                            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">Operational Directive</p>
                                            <p className="text-[11px] font-bold leading-tight text-emerald-600">
                                                Address {loading.clusters ? 'loading' : topHotspotCount} priority cases in this locality.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => Maps(spatialRoute)}
                                        className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-green-800 transition hover:text-green-950 focus:outline-none focus:ring-2 focus:ring-green-800"
                                    >
                                        View full map <ArrowRight className="h-4 w-4 transition" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="border border-slate-200 bg-white p-6 text-left shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Operational Follow-Through</p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">Recent Audit Activity</h2>
                            </div>
                            <div className="flex flex-col items-end gap-3">
                                <div className="bg-green-50 p-3 text-green-800">
                                    <Activity className="h-5 w-5" />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => Maps(auditRoute)}
                                    className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-emerald-700 transition-colors duration-150 hover:text-emerald-900"
                                >
                                    View full audit trail <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
                            {loading.audit ? (
                                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit activity...</p>
                            ) : errors.audit ? (
                                <ErrorNotice message={errors.audit} />
                            ) : audit.recent_events.length === 0 ? (
                                <p className="text-sm font-semibold text-slate-500">No recent audit activity</p>
                            ) : (
                                audit.recent_events.slice(0, isSuperAdmin ? 10 : 4).map((event) => (
                                    <button
                                        type="button"
                                        key={event?.id}
                                        onClick={() => Maps(`${auditRoute}?entry=${encodeURIComponent(event?.id || '')}`)}
                                        className="w-full min-w-0 border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800"
                                    >
                                        <p className="block w-full truncate text-sm font-black text-slate-950">{formatAuditSentence(event)}</p>
                                        <p className="mt-1 block w-full truncate text-xs font-semibold text-slate-500">{formatAuditTime(event?.timestamp)}</p>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                <section className="border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                {isSuperAdmin ? 'Municipal Workforce Counts' : 'Barangay User Summary'}
                            </p>
                            <h2 className="mt-1 text-xl font-black text-slate-950">
                                {isSuperAdmin
                                    ? 'Barangay Admin credentials registered under this Super Admin scope'
                                    : `Active BHWs and Midwives in ${assignedBarangay}`}
                            </h2>
                            {isSuperAdmin ? (
                                <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
                                    These figures reflect all active Barangay Admin accounts visible in the Super Admin municipal directory.
                                </p>
                            ) : null}
                        </div>
                        <div className="bg-green-50 p-3 text-green-800">
                            <Users className="h-5 w-5" />
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {workforceCards.map(([label, value]) => (
                            <div key={label} className="border border-slate-200 bg-slate-50 p-5">
                                {loading.users ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : <p className="text-3xl font-black text-slate-950">{safeNumber(value)}</p>}
                                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {loading.users ? (
                            <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading personnel records...</p>
                        ) : errors.users ? (
                            <ErrorNotice message={errors.users} />
                        ) : users.personnel.length === 0 ? (
                            <p className="text-sm font-semibold text-slate-500">No active personnel records</p>
                        ) : (
                            users.personnel.slice(0, 6).map((person) => (
                                <button
                                    type="button"
                                    key={person?.id}
                                    onClick={() => Maps(`${usersRoute}?user=${encodeURIComponent(person?.id || '')}`)}
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
                    onClick={() => Maps(reportsRoute)}
                    onKeyDown={(event) => {
                        if (isEnterOrSpace(event)) Maps(reportsRoute);
                    }}
                    className="cursor-pointer border border-slate-200 bg-white shadow-sm transition hover:border-green-800 focus:outline-none focus:ring-2 focus:ring-green-800"
                >
                    <div className="border-b border-slate-200 px-6 py-5">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    {isSuperAdmin ? 'Barangay Target Comparison' : 'Coverage Trend'}
                                </p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">
                                    {isSuperAdmin
                                        ? 'Configured Target Population vs Actual Registered Population'
                                        : 'Target, Final Dose, Drop-out, and Utilization'}
                                </h2>
                            </div>
                            <span className="hidden items-center gap-2 text-xs font-black uppercase tracking-wider text-green-800 sm:inline-flex">
                                Open M1 report <ArrowRight className="h-4 w-4" />
                            </span>
                        </div>
                    </div>
                    <div className="relative min-h-[372px] w-full p-6">
                        <div className="h-[320px] min-h-[320px] w-full">
                            {isSuperAdmin ? (
                                loading.ranking ? (
                                    <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Loading target comparison...
                                    </div>
                                ) : errors.ranking ? (
                                    <div className="flex h-full items-center justify-center px-6">
                                        <ErrorNotice message={errors.ranking} />
                                    </div>
                                ) : targetComparisonData.length === 0 ? (
                                    <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                                        No barangay target records available
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={targetComparisonData} margin={targetChartMargin}>
                                            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                                            <XAxis
                                                dataKey="barangay"
                                                interval={0}
                                                tick={{ fontSize: 11, fill: '#64748B' }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                formatter={(value) => safeNumber(value).toLocaleString()}
                                                contentStyle={{ border: '1px solid #CBD5E1', borderRadius: 0 }}
                                            />
                                            <Legend />
                                            <Bar name="Configured Target Population" dataKey="target" fill="#64748B" />
                                            <Bar name="Actual Registered Population" dataKey="actual" fill="#047857" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )
                            ) : loading.trends ? (
                                <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Loading trend records...
                                </div>
                            ) : errors.trends ? (
                                <div className="flex h-full items-center justify-center px-6">
                                    <ErrorNotice message={errors.trends} />
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
                                    <LineChart data={trendData} margin={trendChartMargin}>
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
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PublicHealthDashboard;
