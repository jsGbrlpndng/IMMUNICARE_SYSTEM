import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Popup, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import {
    BarChart3,
    Bell,
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
    MapPinned,
    Radar,
    RefreshCw,
    Send,
    X
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { BARANGAY_COORDINATES, DEFAULT_MUNICIPAL_CENTER, getBarangayCenter } from '../../utils/barangayConfig';
import { RHU2_BARANGAYS } from '../../components/reports/reportConfig';

/* ─── Constants ─── */

const MONTH_OPTIONS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
];

const clusterColors = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed'];

/* ─── Utilities ─── */

const toMapFloat = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const computeConvexHull = (points) => {
    const mappedPoints = (points || [])
        .map((point) => ({ ...point, lat: toMapFloat(point?.lat), lng: toMapFloat(point?.lng) }))
        .filter((point) => point.lat != null && point.lng != null);

    if (mappedPoints.length < 3) return mappedPoints.map((point) => [point.lat, point.lng]);

    const sorted = [...mappedPoints].sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));
    const cross = (origin, a, b) => (a.lng - origin.lng) * (b.lat - origin.lat) - (a.lat - origin.lat) * (b.lng - origin.lng);
    const lower = [];
    const upper = [];

    sorted.forEach((point) => {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    });

    [...sorted].reverse().forEach((point) => {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    });

    lower.pop();
    upper.pop();
    return lower.concat(upper).map((point) => [point.lat, point.lng]);
};

const getYearOptions = () => {
    const now = new Date().getFullYear();
    return [now - 1, now, now + 1];
};

const formatMonthToken = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;

/**
 * NIP-canonical action badge.
 * If (gap / eligible target) > 30% → ⚠️ Action Needed
 * Else → ✔️ On Track
 */
const getPopulationGapMeta = (gap, target) => {
    const safeTarget = Number(target || 0);
    const safeGap = Number(gap || 0);

    if (safeTarget <= 0) {
        return {
            label: 'No Baseline',
            badgeClassName: 'bg-slate-100 text-slate-700 border border-slate-200',
            textClassName: 'text-slate-700',
            colorHex: '#64748B'
        };
    }

    const ratio = safeGap / safeTarget;
    if (ratio > 0.30) {
        return {
            label: '⚠️ Action Needed',
            badgeClassName: 'bg-amber-50 text-amber-800 border border-amber-300',
            textClassName: 'text-amber-800',
            colorHex: '#D97706'
        };
    }
    return {
        label: '✔️ On Track',
        badgeClassName: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
        textClassName: 'text-emerald-800',
        colorHex: '#059669'
    };
};

const normalizeAnalysisPayload = (payload = {}) => ({
    clusters: payload.clusters || [],
    noise: payload.noise || [],
    allInfants: payload.all_infants || payload.allInfants || [],
    recommendedActions: payload.recommended_actions || payload.recommendedActions || [],
    counts: payload.counts || {}
});

/**
 * Derives the barangay name for a cluster from its points array.
 * Returns the most common barangay across all points, or null.
 */
const deriveClusterBarangay = (points) => {
    if (!points || points.length === 0) return null;
    const tally = {};
    points.forEach((pt) => {
        const brgy = (pt.barangay || '').trim();
        if (brgy) tally[brgy] = (tally[brgy] || 0) + 1;
    });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
};

/**
 * Derives a comma-separated list of all involved barangays in a cluster,
 * sorted by frequency descending.
 */
const deriveClusterBarangayLabel = (points) => {
    if (!points || points.length === 0) return 'Unknown';
    const tally = {};
    points.forEach((pt) => {
        const brgy = (pt.barangay || '').trim().toUpperCase();
        if (brgy) tally[brgy] = (tally[brgy] || 0) + 1;
    });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return 'Unknown';
    return sorted.map(([brgy]) => brgy).join(', ');
};

/* ─── MapBoundsController ─── */
/* Placed inside <MapContainer> to reactively pan/zoom the map when filters or data change. */

const MapBoundsController = ({ barangay, dataPoints }) => {
    const map = useMap();
    const isInitialMount = useRef(true);

    useEffect(() => {
        const animate = !isInitialMount.current;
        isInitialMount.current = false;

        // Priority 1: specific barangay selected → flyTo its center
        if (barangay && barangay !== 'All') {
            const center = getBarangayCenter(barangay);
            if (animate) {
                map.flyTo([center.lat, center.lng], center.zoom || 17, { duration: 0.8 });
            } else {
                map.setView([center.lat, center.lng], center.zoom || 17);
            }
            return;
        }

        // Priority 2: fit all data points on screen
        if (dataPoints && dataPoints.length > 1) {
            const lats = dataPoints.map((p) => p[0]);
            const lngs = dataPoints.map((p) => p[1]);
            const bounds = [
                [Math.min(...lats), Math.min(...lngs)],
                [Math.max(...lats), Math.max(...lngs)]
            ];
            if (animate) {
                map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 17, duration: 0.8 });
            } else {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
            }
            return;
        }

        // Fallback: municipal center
        if (animate) {
            map.flyTo([DEFAULT_MUNICIPAL_CENTER.lat, DEFAULT_MUNICIPAL_CENTER.lng], DEFAULT_MUNICIPAL_CENTER.zoom || 14, { duration: 0.8 });
        } else {
            map.setView([DEFAULT_MUNICIPAL_CENTER.lat, DEFAULT_MUNICIPAL_CENTER.lng], DEFAULT_MUNICIPAL_CENTER.zoom || 14);
        }
    }, [map, barangay, dataPoints]);

    return null;
};

/* ─── MapResizeHandle ─── */
/* Fixes the Leaflet grey-area bug when the container resizes (e.g., table toggle). */

const MapResizeHandle = () => {
    const map = useMap();
    const resizeObserverRef = useRef(null);

    useEffect(() => {
        const container = map.getContainer();
        if (!container) return;

        const timer = setTimeout(() => { map.invalidateSize(); }, 100);

        resizeObserverRef.current = new ResizeObserver(() => {
            map.invalidateSize({ animate: false });
        });
        resizeObserverRef.current.observe(container);

        return () => {
            clearTimeout(timer);
            if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
        };
    }, [map]);

    return null;
};

/* ─── Main Component ─── */

export default function SuperAdminMap() {
    const { user } = useAuth();
    const performanceGapCacheRef = useRef(new Map());
    const performanceGapDebounceRef = useRef(null);
    const now = new Date();

    /* ── Tab state ── */
    const [mode, setMode] = useState('clinical');
    const isClusterMode = mode === 'cluster';

    /* ── Filter state ── */
    const [filters, setFilters] = useState({ barangay: 'All' });
    const [clusterEps, setClusterEps] = useState(300);
    const [reportYear, setReportYear] = useState(now.getFullYear());
    const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

    /* ── UI state ── */
    const [tableOpen, setTableOpen] = useState(true);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [notifiedBarangays, setNotifiedBarangays] = useState(new Set());

    /* ── Notification modal state ── */
    const [notifyModal, setNotifyModal] = useState({ open: false, barangay: '', defaulters: 0, clusters: 0, clusterIndex: null, clusterId: '' });
    const [notifyNote, setNotifyNote] = useState('');
    const [notifySending, setNotifySending] = useState(false);
    const [notifyError, setNotifyError] = useState('');

    /* ── Data state ── */
    const [performanceGap, setPerformanceGap] = useState({ rows: [], summary: {} });
    const [analysis, setAnalysis] = useState(null);

    /* ── Loading & messages ── */
    const [loadingView, setLoadingView] = useState(true);
    const [runningAnalysis, setRunningAnalysis] = useState(false);
    const [error, setError] = useState('');

    /* ── API: Performance Gap (Clinical Oversight) ── */

    const buildViewParams = useCallback(() => {
        const params = new URLSearchParams();
        params.set('year', String(reportYear));
        params.set('month', String(reportMonth));
        if (filters.barangay && filters.barangay !== 'All') {
            params.set('barangay', filters.barangay);
        }
        return params;
    }, [filters.barangay, reportMonth, reportYear]);

    const loadPerformanceGap = useCallback(async ({ force = false } = {}) => {
        const cacheKey = JSON.stringify({ year: reportYear, month: reportMonth, barangay: filters.barangay });

        if (!force && performanceGapCacheRef.current.has(cacheKey)) {
            setPerformanceGap(performanceGapCacheRef.current.get(cacheKey));
            setLoadingView(false);
            return;
        }

        setLoadingView(true);
        setError('');
        try {
            const response = await apiClient.get(`/spatial/performance-gap?${buildViewParams().toString()}`);
            const payload = response.ok ? await response.json() : {};
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to load barangay performance gap.');
            }
            const nextPayload = {
                rows: payload.rows || [],
                summary: payload.summary || {},
                summaryBasis: payload.summaryBasis || null
            };
            performanceGapCacheRef.current.set(cacheKey, nextPayload);
            setPerformanceGap(nextPayload);
        } catch (requestError) {
            console.error('[CLINICAL_OVERSIGHT]', requestError);
            setError(requestError.message || 'Unable to load barangay performance gap.');
        } finally {
            setLoadingView(false);
        }
    }, [buildViewParams, filters.barangay, reportMonth, reportYear]);

    /* ── API: Cluster Analysis ── */

    const runClusterAnalysis = useCallback(async () => {
        setRunningAnalysis(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.set('barangay', filters.barangay === 'All' ? 'all' : filters.barangay);
            params.set('sortBy', 'urgency');
            params.set('scope', 'defaulter');
            params.set('eps', String(clusterEps));

            const response = await apiClient.get(`/dashboard/superadmin/spatial-analysis?${params.toString()}`);
            const payload = response.ok ? await response.json() : {};
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to run spatial analysis.');
            }
            setAnalysis(normalizeAnalysisPayload(payload));
        } catch (requestError) {
            console.error('[CLUSTER_ANALYSIS]', requestError);
            setError(requestError.message || 'Unable to run spatial analysis.');
        } finally {
            setRunningAnalysis(false);
        }
    }, [filters.barangay, clusterEps]);

    /* ── API: Notify Admin ── */

    const handleSendNotification = useCallback(async () => {
        if (!notifyNote.trim()) {
            setNotifyError('Please enter a note or instruction.');
            return;
        }
        setNotifySending(true);
        setNotifyError('');
        try {
            const response = await apiClient.post('/spatial/notify-admin', {
                barangay: notifyModal.barangay,
                note: notifyNote.trim(),
                clusterSummary: {
                    clusterId: notifyModal.clusterId,
                    defaulters: notifyModal.defaulters,
                    clusters: 1
                }
            });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to send notification.');
            }
            // Mark this specific cluster as notified and close modal
            setNotifiedBarangays((prev) => new Set(prev).add(notifyModal.clusterId));
            setNotifyModal({ open: false, barangay: '', defaulters: 0, clusters: 0, clusterIndex: null, clusterId: '' });
            setNotifyNote('');
        } catch (requestError) {
            console.error('[NOTIFY_ADMIN]', requestError);
            setNotifyError(requestError.message || 'Unable to send notification.');
        } finally {
            setNotifySending(false);
        }
    }, [notifyModal, notifyNote]);

    /* ── Effects ── */

    // Auto-load performance gap data in clinical mode
    useEffect(() => {
        if (isClusterMode) return undefined;

        if (performanceGapDebounceRef.current) {
            clearTimeout(performanceGapDebounceRef.current);
        }
        performanceGapDebounceRef.current = setTimeout(() => {
            loadPerformanceGap();
        }, 220);

        return () => {
            if (performanceGapDebounceRef.current) {
                clearTimeout(performanceGapDebounceRef.current);
            }
        };
    }, [isClusterMode, loadPerformanceGap]);

    /* ── Handlers ── */

    const handleModeChange = async (nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        setError('');
        if (nextMode === 'cluster' && !analysis && !runningAnalysis) {
            await runClusterAnalysis();
        }
    };

    const openNotifyModal = (cluster, clusterIndex) => {
        const brgy = deriveClusterBarangay(cluster.points) || 'Unknown';
        setNotifyModal({
            open: true,
            barangay: brgy,
            defaulters: cluster.total_infants,
            clusters: 1,
            clusterIndex,
            clusterId: cluster.clusterId || `CL-${clusterIndex}`
        });
        setNotifyNote('');
        setNotifyError('');
    };

    /* ── Computed Data: Clinical Oversight ── */

    const viewRows = useMemo(() => {
        const rows = (performanceGap.rows || []).map((row) => {
            // PART 1: Canonical NIP binding — use eligible_population_0_12_months as TARGET
            const targetValue = Number(row.eligiblePopulation012Months || 0);
            const actualValue = Number(row.actualPopulation || 0);
            const gapValue = Math.max(0, targetValue - actualValue);
            const meta = getPopulationGapMeta(gapValue, targetValue);
            return {
                ...row,
                targetValue,
                actualValue,
                gapValue,
                statusMeta: meta,
                center: BARANGAY_COORDINATES[String(row.barangay || '').toUpperCase()] || DEFAULT_MUNICIPAL_CENTER
            };
        });
        return rows.sort((a, b) => a.gapValue - b.gapValue || a.barangay.localeCompare(b.barangay));
    }, [performanceGap.rows]);

    const municipalSummary = useMemo(() => viewRows.reduce((acc, row) => ({
        target: acc.target + row.targetValue,
        actual: acc.actual + row.actualValue,
        gap: acc.gap + row.gapValue
    }), { target: 0, actual: 0, gap: 0 }), [viewRows]);

    const clinicalMapPoints = useMemo(
        () => viewRows.map((row) => [row.center.lat, row.center.lng]),
        [viewRows]
    );

    /* ── Computed Data: Cluster Analysis ── */

    const analysisRows = analysis?.clusters || [];
    const analysisReady = analysis !== null;

    const clusterRanking = useMemo(() => {
        const grouped = {};
        analysisRows.forEach((cluster) => {
            const brgy = cluster.locality || 'Unknown';
            if (!grouped[brgy]) grouped[brgy] = { barangay: brgy, defaulters: 0, clusters: 0 };
            grouped[brgy].defaulters += Number(cluster.total_infants || 0);
            grouped[brgy].clusters += 1;
        });
        return Object.values(grouped).sort((a, b) => b.defaulters - a.defaulters || b.clusters - a.clusters);
    }, [analysisRows]);

    const clusterMapPoints = useMemo(() => {
        const points = [];
        analysisRows.forEach((cluster) => {
            (cluster.points || []).forEach((point) => {
                const lat = toMapFloat(point?.lat);
                const lng = toMapFloat(point?.lng);
                if (lat != null && lng != null) points.push([lat, lng]);
            });
        });
        return points;
    }, [analysisRows]);

    /* ════════════════════════════════════════════════════════════ */
    /* ── Render ── */
    /* ════════════════════════════════════════════════════════════ */

    return (
        <div className="w-full min-w-0">
            <div className="w-full min-w-0 space-y-5">

                {/* ── Page Header ── */}
                <section className="border border-slate-300 bg-white p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 items-center justify-center bg-[#064E3B] text-white">
                                <MapPinned className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">
                                    Municipal Geospatial Intelligence
                                </p>
                                <h1 className="mt-1 text-2xl font-black text-slate-950">Spatial Decision Support System</h1>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    {isClusterMode
                                        ? 'Macro-level DBSCAN cluster detection for prioritizing barangay outreach.'
                                        : 'Population target vs. actual comparison across all barangays.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                            <button
                                type="button"
                                onClick={() => handleModeChange('clinical')}
                                className={`inline-flex h-10 items-center gap-2 border px-5 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
                                    !isClusterMode
                                        ? 'border-[#064E3B] bg-[#064E3B] text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <BarChart3 className="h-4 w-4" />
                                Clinical Oversight
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange('cluster')}
                                className={`inline-flex h-10 items-center gap-2 border px-5 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
                                    isClusterMode
                                        ? 'border-[#064E3B] bg-[#064E3B] text-white'
                                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <Radar className="h-4 w-4" />
                                Cluster Analysis
                            </button>
                        </div>
                    </div>
                </section>

                {/* ── Alerts ── */}
                {error ? (
                    <div className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">{error}</div>
                ) : null}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ── TAB 1: Clinical Oversight ──────────────────────────── */}
                {/* ══════════════════════════════════════════════════════════ */}
                {!isClusterMode && (
                    <>
                        {/* Filter Bar */}
                        <section className="border border-slate-300 bg-white">
                            <div className="border-b border-slate-300 px-5 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Report Filters</p>
                            </div>
                            <div className="flex flex-wrap items-end gap-4 p-5">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Report Year</span>
                                    <select
                                        value={reportYear}
                                        onChange={(e) => setReportYear(Number(e.target.value))}
                                        className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                    >
                                        {getYearOptions().map((y) => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Report Month</span>
                                    <select
                                        value={reportMonth}
                                        onChange={(e) => setReportMonth(Number(e.target.value))}
                                        className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                    >
                                        {MONTH_OPTIONS.map((m) => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Barangay Focus</span>
                                    <select
                                        value={filters.barangay}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, barangay: e.target.value }))}
                                        className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                    >
                                        <option value="All">All Barangays</option>
                                        {RHU2_BARANGAYS.map((b) => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => loadPerformanceGap({ force: true })}
                                    disabled={loadingView}
                                    className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                                >
                                    <RefreshCw className={`h-4 w-4 ${loadingView ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>
                        </section>

                        {/* Summary KPIs — NIP Canonical */}
                        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            {[
                                ['NIP Eligible (0–12 mos.)', loadingView ? '…' : municipalSummary.target.toLocaleString()],
                                ['Actual Population', loadingView ? '…' : municipalSummary.actual.toLocaleString()],
                                ['Population Gap', loadingView ? '…' : municipalSummary.gap.toLocaleString()],
                                ['Barangays Reporting', loadingView ? '…' : viewRows.length]
                            ].map(([label, value]) => (
                                <div key={label} className="border border-slate-300 bg-white px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
                                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{value}</p>
                                </div>
                            ))}
                        </section>

                        {/* Map + Collapsible Table */}
                        <section className="border border-slate-300 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-300 px-5 py-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Performance Gap Map</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        Circle size and color reflect population gap severity per barangay.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setTableOpen((v) => !v)}
                                    className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    {tableOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                                    {tableOpen ? 'Hide Table' : 'Show Table'}
                                </button>
                            </div>

                            <div className={`grid h-auto w-full items-start gap-0 overflow-visible ${tableOpen ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : 'xl:grid-cols-1'}`}>
                                {/* Map Panel */}
                                <div className={tableOpen ? 'border-b border-slate-300 xl:border-b-0 xl:border-r xl:border-slate-300' : ''}>
                                    <div className="min-h-[680px] w-full">
                                        <MapContainer
                                            center={[DEFAULT_MUNICIPAL_CENTER.lat, DEFAULT_MUNICIPAL_CENTER.lng]}
                                            zoom={DEFAULT_MUNICIPAL_CENTER.zoom || 14}
                                            minZoom={12}
                                            maxZoom={18}
                                            scrollWheelZoom
                                            style={{ minHeight: 680, height: '100%', width: '100%' }}
                                        >
                                            <TileLayer
                                                crossOrigin="anonymous"
                                                attribution="Tiles &copy; Esri"
                                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                                maxZoom={19}
                                            />
                                            <TileLayer
                                                crossOrigin="anonymous"
                                                attribution="&copy; CARTO"
                                                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                                                maxZoom={19}
                                                zIndex={650}
                                            />
                                            <ScaleControl position="bottomleft" />
                                            <MapBoundsController barangay={filters.barangay} dataPoints={clinicalMapPoints} />
                                            <MapResizeHandle />

                                            {viewRows.map((row) => (
                                                <CircleMarker
                                                    key={`clinical-${row.barangay}`}
                                                    center={[row.center.lat, row.center.lng]}
                                                    radius={Math.max(8, Math.min(24, 6 + row.gapValue))}
                                                    pathOptions={{
                                                        color: '#ffffff',
                                                        fillColor: row.statusMeta.colorHex,
                                                        fillOpacity: 0.78,
                                                        weight: 2
                                                    }}
                                                >
                                                    <Popup>
                                                        <div className="space-y-3 text-sm">
                                                            <div>
                                                                <p className="font-black text-slate-950">{row.barangay}</p>
                                                                <span className={`mt-1 inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${row.statusMeta.badgeClassName}`}>
                                                                    {row.statusMeta.label}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-2 text-center">
                                                                <div className="border border-slate-200 px-2 py-2">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target</p>
                                                                    <p className="mt-1 font-black text-slate-950">{row.targetValue}</p>
                                                                </div>
                                                                <div className="border border-slate-200 px-2 py-2">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actual</p>
                                                                    <p className="mt-1 font-black text-slate-950">{row.actualValue}</p>
                                                                </div>
                                                                <div className="border border-slate-200 px-2 py-2">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gap</p>
                                                                    <p className={`mt-1 font-black ${row.statusMeta.textClassName}`}>{row.gapValue}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Popup>
                                                </CircleMarker>
                                            ))}
                                        </MapContainer>
                                    </div>
                                </div>

                                {/* Collapsible Ranking Table */}
                                {tableOpen && (
                                    <div className="flex h-auto w-full flex-col overflow-visible">
                                        <div className="border-b border-slate-300 px-4 py-3">
                                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Barangay Target Ranking</p>
                                        </div>
                                        <div className="w-full overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="sticky top-0 bg-[#064E3B] text-white">
                                                    <tr>
                                                        <th className="whitespace-nowrap border-r border-emerald-800 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider w-10">#</th>
                                                        <th className="whitespace-nowrap border-r border-emerald-800 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Barangay</th>
                                                        <th className="whitespace-nowrap border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider w-16">Target</th>
                                                        <th className="whitespace-nowrap border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider w-16">Actual</th>
                                                        <th className="whitespace-nowrap border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider w-14">Gap</th>
                                                        <th className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {viewRows.map((row, index) => (
                                                        <tr key={row.barangay} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-xs font-black text-slate-500">{index + 1}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-xs font-black uppercase text-slate-950 whitespace-nowrap">{row.barangay}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700">{row.targetValue}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700">{row.actualValue}</td>
                                                            <td className={`border-b border-slate-200 px-3 py-2 text-right text-xs font-black tabular-nums ${row.statusMeta.textClassName}`}>{row.gapValue}</td>
                                                            <td className="border-b border-slate-200 px-3 py-2">
                                                                <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${row.statusMeta.badgeClassName}`}>
                                                                    {row.statusMeta.label}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {!loadingView && viewRows.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                                                                No performance-gap rows matched the current scope.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ── TAB 2: Cluster Analysis ────────────────────────────── */}
                {/* ══════════════════════════════════════════════════════════ */}
                {isClusterMode && (
                    <>
                        {/* Analysis Controls */}
                        <section className="border border-slate-300 bg-white">
                            <div className="border-b border-slate-300 px-5 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Analysis Controls</p>
                            </div>
                            <div className="flex flex-wrap items-end gap-4 p-5">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Barangay Scope</span>
                                    <select
                                        value={filters.barangay}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, barangay: e.target.value }))}
                                        className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                    >
                                        <option value="All">All Barangays</option>
                                        {RHU2_BARANGAYS.map((b) => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Cluster Radius (Epsilon)</span>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min="100"
                                            max="500"
                                            step="50"
                                            value={clusterEps}
                                            onChange={(e) => setClusterEps(Number(e.target.value))}
                                            className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#064E3B]"
                                        />
                                        <span className="text-sm font-black text-slate-900 tabular-nums w-14">{clusterEps}m</span>
                                    </div>
                                </label>
                                <button
                                    type="button"
                                    onClick={runClusterAnalysis}
                                    disabled={runningAnalysis}
                                    className="inline-flex h-10 items-center gap-2 bg-[#064E3B] px-5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-[#053B2D] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                                >
                                    {runningAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                                    {runningAnalysis ? 'Running...' : 'Run Spatial Analysis'}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-semibold px-5 pb-3">
                                ⚠️ Exploratory analysis. Barangay deployments always use the 300m standard.
                            </p>
                        </section>

                        {/* Cluster Map + Ranking Sidebar */}
                        <section className="border border-slate-300 bg-white">
                            <div className="flex items-center justify-between gap-4 border-b border-slate-300 px-5 py-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">DBSCAN Cluster Map</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        Macro-level cluster polygons. Individual infant markers are not shown at this administrative level.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsPanelOpen((v) => !v)}
                                    className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                    {isPanelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                                    {isPanelOpen ? 'Hide Ranking' : 'Show Ranking'}
                                </button>
                            </div>

                            <div className={`grid h-auto w-full items-start gap-0 overflow-visible ${isPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : 'xl:grid-cols-1'}`}>
                                {/* Map Panel */}
                                <div className={`border-b border-slate-300 xl:border-b-0 ${isPanelOpen ? 'xl:border-r xl:border-slate-300' : ''}`}>
                                    <div className="min-h-[680px] w-full">
                                        {runningAnalysis ? (
                                            <div className="flex h-full items-center justify-center bg-slate-50">
                                                <div className="text-center">
                                                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#064E3B]" />
                                                    <p className="mt-4 text-sm font-black text-slate-600">Running DBSCAN spatial analysis…</p>
                                                </div>
                                            </div>
                                        ) : analysisReady && analysisRows.length === 0 ? (
                                            <div className="flex h-full items-center justify-center bg-slate-50">
                                                <div className="px-6 text-center">
                                                    <Radar className="mx-auto h-12 w-12 text-slate-300" />
                                                    <p className="mt-4 text-base font-black text-slate-600">No Spatial Clusters Detected</p>
                                                    <p className="mt-1 text-sm font-semibold text-slate-500">for the current filter set.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <MapContainer
                                                center={[DEFAULT_MUNICIPAL_CENTER.lat, DEFAULT_MUNICIPAL_CENTER.lng]}
                                                zoom={DEFAULT_MUNICIPAL_CENTER.zoom || 14}
                                                minZoom={12}
                                                maxZoom={18}
                                                scrollWheelZoom
                                                style={{ minHeight: 680, height: '100%', width: '100%' }}
                                            >
                                                <TileLayer
                                                    crossOrigin="anonymous"
                                                    attribution="Tiles &copy; Esri"
                                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                                    maxZoom={19}
                                                />
                                                <TileLayer
                                                    crossOrigin="anonymous"
                                                    attribution="&copy; CARTO"
                                                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                                                    maxZoom={19}
                                                    zIndex={650}
                                                />
                                                <ScaleControl position="bottomleft" />
                                                <MapBoundsController barangay={filters.barangay} dataPoints={clusterMapPoints} />
                                                <MapResizeHandle />

                                                {/* Cluster polygons ONLY — no individual infant dots */}
                                                {analysisRows.map((cluster, index) => {
                                                    const hull = computeConvexHull(cluster.points || []);
                                                    const color = clusterColors[index % clusterColors.length];
                                                    if (hull.length < 3) return null;

                                                    // PART 3a: Append barangay name to cluster description
                                                    const clusterBrgy = deriveClusterBarangayLabel(cluster.points);
                                                    const locationLabel = cluster.locality
                                                        ? (clusterBrgy ? `${cluster.locality}, Brgy. ${clusterBrgy}` : cluster.locality)
                                                        : (clusterBrgy ? `Brgy. ${clusterBrgy}` : `Hotspot ${index + 1}`);

                                                    return (
                                                        <Polygon
                                                            key={cluster.clusterId || `cluster-${index}`}
                                                            positions={hull}
                                                            pathOptions={{
                                                                color,
                                                                fillColor: color,
                                                                fillOpacity: 0.2,
                                                                weight: 3
                                                            }}
                                                        >
                                                            <Popup>
                                                                <div className="text-sm">
                                                                    <p className="font-black text-slate-950">{locationLabel}</p>
                                                                    <p className="font-semibold text-slate-600">{cluster.total_infants || 0} clustered defaulters</p>
                                                                    <p className="mt-1 text-xs font-medium text-slate-500">
                                                                        {cluster.total_defaulter_doses || 0} actionable defaulter doses
                                                                    </p>
                                                                </div>
                                                            </Popup>
                                                        </Polygon>
                                                    );
                                                })}
                                            </MapContainer>
                                        )}
                                    </div>
                                </div>

                                {/* Ranking Sidebar */}
                                {isPanelOpen && (
                                <aside className="h-auto w-full overflow-visible">
                                    <div className="border-b border-slate-300 px-4 py-3">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Defaulter Cluster Ranking</p>
                                    </div>

                                    {/* Summary cards */}
                                    <div className="grid grid-cols-2 gap-0">
                                        <div className="border-b border-r border-slate-300 px-4 py-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clusters</p>
                                            <p className="mt-1 text-xl font-black tabular-nums text-slate-950">{runningAnalysis ? '…' : analysisRows.length}</p>
                                        </div>
                                        <div className="border-b border-slate-300 px-4 py-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Barangays</p>
                                            <p className="mt-1 text-xl font-black tabular-nums text-slate-950">{runningAnalysis ? '…' : clusterRanking.length}</p>
                                        </div>
                                    </div>

                                    {/* Ranked list */}
                                    <div className="h-auto w-full overflow-visible">
                                        {analysisRows.length === 0 && !runningAnalysis ? (
                                            <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                                                No spatial clusters to rank.
                                            </div>
                                        ) : (
                                            analysisRows.map((cluster, index) => {
                                                const clusterId = cluster.clusterId || `CL-${index}`;
                                                const isNotified = notifiedBarangays.has(clusterId);
                                                const predominantBarangay = deriveClusterBarangay(cluster.points) || 'Unknown';
                                                const involvedBarangays = deriveClusterBarangayLabel(cluster.points);
                                                return (
                                                    <div key={clusterId} className="border-b border-slate-300 p-4">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex items-start gap-3 min-w-0">
                                                                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center bg-slate-100 text-xs font-black text-slate-600">
                                                                    {index + 1}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-black text-slate-950">
                                                                        Cluster {index} <span className="font-semibold text-slate-500">({involvedBarangays})</span>
                                                                    </p>
                                                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                                                        {cluster.total_infants} defaulter{cluster.total_infants !== 1 ? 's' : ''} • {cluster.total_defaulter_doses || 0} overdue dose{cluster.total_defaulter_doses !== 1 ? 's' : ''}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex-shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => isNotified ? null : openNotifyModal(cluster, index)}
                                                                    disabled={isNotified}
                                                                    className={`inline-flex items-center justify-center gap-2 border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                                                                        isNotified
                                                                            ? 'cursor-default border-emerald-300 bg-emerald-50 text-emerald-800'
                                                                            : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                                                    }`}
                                                                >
                                                                    {isNotified ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                                                                    {isNotified ? 'Admin Notified' : 'Notify Admin'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </aside>
                                )}
                            </div>
                        </section>
                    </>
                )}

                {/* ══════════════════════════════════════════════════════════ */}
                {/* ── Notification Modal ─────────────────────────────────── */}
                {/* ══════════════════════════════════════════════════════════ */}
                {notifyModal.open && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
                        <div className="mx-4 w-full max-w-md border border-slate-300 bg-white shadow-2xl">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between border-b border-slate-300 px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center bg-amber-100">
                                        <Bell className="h-4 w-4 text-amber-700" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Notify Barangay Admin</p>
                                        <p className="text-sm font-black text-slate-950">Cluster {notifyModal.clusterIndex} — {notifyModal.barangay}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setNotifyModal({ open: false, barangay: '', defaulters: 0, clusters: 0, clusterIndex: null, clusterId: '' })}
                                    className="flex h-8 w-8 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="space-y-4 p-5">
                                {/* Context summary */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="border border-slate-200 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Area</p>
                                        <p className="mt-0.5 text-xs font-black text-slate-950 truncate">Cluster {notifyModal.clusterIndex} ({notifyModal.barangay})</p>
                                    </div>
                                    <div className="border border-slate-200 px-3 py-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Defaulters</p>
                                        <p className="mt-0.5 text-lg font-black tabular-nums text-slate-950">{notifyModal.defaulters}</p>
                                    </div>
                                </div>

                                {/* Sender */}
                                <div className="text-xs font-semibold text-slate-500">
                                    Sending as: <span className="font-black text-slate-800">{user?.full_name || user?.name || 'Super Admin'}</span>
                                </div>

                                {/* Note input */}
                                <div>
                                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Note / Instruction
                                    </label>
                                    <textarea
                                        value={notifyNote}
                                        onChange={(e) => setNotifyNote(e.target.value)}
                                        placeholder="e.g., 'Deploy outreach team to Purok 5 — 12 defaulters identified in DBSCAN cluster.'"
                                        maxLength={1000}
                                        rows={4}
                                        className="w-full resize-none border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#064E3B]"
                                    />
                                    <p className="mt-1 text-right text-[10px] font-semibold text-slate-400 tabular-nums">{notifyNote.length}/1000</p>
                                </div>

                                {/* Error */}
                                {notifyError && (
                                    <div className="border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{notifyError}</div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-3 border-t border-slate-300 px-5 py-4">
                                <button
                                    type="button"
                                    onClick={() => setNotifyModal({ open: false, barangay: '', defaulters: 0, clusters: 0, clusterIndex: null, clusterId: '' })}
                                    disabled={notifySending}
                                    className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-5 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendNotification}
                                    disabled={notifySending || !notifyNote.trim()}
                                    className="inline-flex h-10 items-center gap-2 bg-[#064E3B] px-5 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#053B2D] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                                >
                                    {notifySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    {notifySending ? 'Sending…' : 'Send Notification'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
