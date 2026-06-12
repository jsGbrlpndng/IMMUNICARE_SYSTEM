import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Popup, ScaleControl, TileLayer } from 'react-leaflet';
import {
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Download,
    Loader2,
    MapPinned,
    Radar,
    RefreshCw,
    DatabaseZap,
    ShieldCheck,
    SlidersHorizontal
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import 'leaflet/dist/leaflet.css';
import apiClient from '../../services/apiClient';
import FilterToolbar from '../../components/FilterToolbar';
import StatusBadge from '../../components/StatusBadge';
import { CLINICAL_STATUS, getClinicalStatusMeta } from '../../utils/clinicalStatus';
import { BARANGAY_COORDINATES, DEFAULT_MUNICIPAL_CENTER, getBarangayCenter } from '../../utils/barangayConfig';
import { RHU2_BARANGAYS } from '../../components/reports/reportConfig';
import { formatFullNameFromObject } from '../../utils/formatFullName';

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

const GAP_METRICS = [
    {
        key: 'populationGap',
        label: 'Population Gap',
        targetKey: 'totalPopulation',
        actualKey: 'actualPopulation',
        gapKey: 'populationGap',
        status: CLINICAL_STATUS.UP_TO_DATE
    },
    {
        key: 'pentaGap',
        label: 'Penta Gap',
        targetKey: 'pentaCumulativeTargetPopulation',
        actualKey: 'penta3Actual',
        gapKey: 'pentaGap',
        status: CLINICAL_STATUS.DEFAULTED
    },
    {
        key: 'mcvGap',
        label: 'MCV Gap',
        targetKey: 'mcvCumulativeTargetPopulation',
        actualKey: 'mcv2Actual',
        gapKey: 'mcvGap',
        status: CLINICAL_STATUS.DUE_SOON
    },
    {
        key: 'utilizationGap',
        label: 'Utilization Gap',
        targetKey: 'utilizationCumulativeTargetPopulation',
        actualKey: 'utilizationActual',
        gapKey: 'utilizationGap',
        status: CLINICAL_STATUS.OVERDUE
    }
];

const clusterColors = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed'];

const toMapFloat = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getPointCoordinates = (point) => {
    const lat = toMapFloat(point?.lat);
    const lng = toMapFloat(point?.lng);
    if (lat == null || lng == null) return null;
    return [lat, lng];
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

const formatMonthShort = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
};

const getGapMetricConfig = (metricKey) => GAP_METRICS.find((metric) => metric.key === metricKey) || GAP_METRICS[0];

const getPopulationGapMeta = (gap, target) => {
    const safeTarget = Number(target || 0);
    const safeGap = Number(gap || 0);

    if (safeTarget <= 0) {
        return {
            label: 'No Baseline',
            badgeClassName: 'bg-slate-100 text-slate-700 border border-slate-200',
            textClassName: 'text-slate-700',
            dotClassName: 'bg-slate-400',
            colorHex: '#64748B',
            panelClassName: 'bg-slate-50 border-slate-200 text-slate-800'
        };
    }

    const ratio = safeGap / safeTarget;
    if (ratio <= 0.15) {
        return {
            label: 'Low Gap',
            badgeClassName: 'bg-sky-50 text-sky-700 border border-sky-200',
            textClassName: 'text-sky-700',
            dotClassName: 'bg-sky-500',
            colorHex: '#0284C7',
            panelClassName: 'bg-sky-50 border-sky-200 text-sky-800'
        };
    }
    if (ratio <= 0.35) {
        return {
            label: 'Moderate Gap',
            badgeClassName: 'bg-blue-50 text-blue-700 border border-blue-200',
            textClassName: 'text-blue-700',
            dotClassName: 'bg-blue-500',
            colorHex: '#2563EB',
            panelClassName: 'bg-blue-50 border-blue-200 text-blue-800'
        };
    }
    return {
        label: 'High Gap',
        badgeClassName: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
        textClassName: 'text-indigo-700',
        dotClassName: 'bg-indigo-500',
        colorHex: '#4F46E5',
        panelClassName: 'bg-indigo-50 border-indigo-200 text-indigo-800'
    };
};

const deriveGapStatus = (row, metricKey) => {
    const metric = getGapMetricConfig(metricKey);
    const target = Number(row?.[metric.targetKey] || 0);
    const gap = Number(row?.[metric.gapKey] || 0);

    if (target <= 0) return CLINICAL_STATUS.INCOMPLETE;
    if (gap <= 0) return CLINICAL_STATUS.FULLY_IMMUNIZED;

    const ratio = gap / target;
    if (ratio <= 0.15) return CLINICAL_STATUS.UP_TO_DATE;
    if (ratio <= 0.35) return CLINICAL_STATUS.DUE_SOON;
    if (ratio <= 0.55) return CLINICAL_STATUS.OVERDUE;
    return CLINICAL_STATUS.DEFAULTED;
};

const mapTrendMetricType = (metricKey) => {
    switch (metricKey) {
        case 'populationGap':
            return 'POPULATION_GAP';
        case 'pentaGap':
            return 'PENTA_GAP';
        case 'mcvGap':
            return 'MCV_GAP';
        case 'utilizationGap':
            return 'UTILIZATION_GAP';
        default:
            return 'PENTA_GAP';
    }
};

const normalizeAnalysisPayload = (payload = {}) => ({
    clusters: payload.clusters || [],
    noise: payload.noise || [],
    allInfants: payload.all_infants || payload.allInfants || [],
    recommendedActions: payload.recommended_actions || payload.recommendedActions || [],
    counts: payload.counts || {}
});

const DrawerSection = ({ title, subtitle, action, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section className="border-t border-slate-200/80 first:border-t-0">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
                <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-700">{title}</p>
                    {subtitle ? (
                        <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {action}
                    {open ? <ChevronLeft className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </div>
            </button>
            {open ? <div className="px-4 pb-4">{children}</div> : null}
        </section>
    );
};

const CompactMetricCard = ({ label, value, tone = 'text-slate-950' }) => (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className={`mt-2 text-xl font-black ${tone}`}>{value}</p>
    </div>
);

const SummaryKpiCard = ({ label, value, toneClassName, accentClassName, note }) => (
    <div className="rounded-2xl bg-slate-50 px-5 py-5">
        <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${accentClassName}`} />
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
        </div>
        <p className={`mt-4 text-3xl font-black ${toneClassName}`}>{value}</p>
        {note ? <p className="mt-2 text-xs font-semibold text-slate-500">{note}</p> : null}
    </div>
);

export default function SuperAdminMap() {
    const mapExportRef = useRef(null);
    const performanceGapCacheRef = useRef(new Map());
    const performanceGapDebounceRef = useRef(null);
    const now = new Date();
    const [mode, setMode] = useState('clinical');
    const [filters, setFilters] = useState({
        barangay: 'All',
        ageGroup: 'All',
        vaccineType: 'All',
        assignedBhw: 'All'
    });
    const [sortBy, setSortBy] = useState('urgency');
    const [reportYear, setReportYear] = useState(now.getFullYear());
    const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
    const [selectedGapMetric, setSelectedGapMetric] = useState('pentaGap');
    const [controlsOpen, setControlsOpen] = useState(true);
    const [insightsOpen, setInsightsOpen] = useState(true);

    const [filterSurface, setFilterSurface] = useState({ barangays: [], ageGroups: [], vaccineTypes: [], assignedBhws: [], sortOptions: [] });
    const [performanceGap, setPerformanceGap] = useState({ rows: [], summary: {} });
    const [analysis, setAnalysis] = useState(null);
    const [historicalTrends, setHistoricalTrends] = useState({ rows: [], filters: {} });
    const [loadingView, setLoadingView] = useState(true);
    const [runningAnalysis, setRunningAnalysis] = useState(false);
    const [loadingTrends, setLoadingTrends] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [seedingSnapshots, setSeedingSnapshots] = useState(false);
    const [error, setError] = useState('');
    const [exportMessage, setExportMessage] = useState('');
    const advancedMode = mode === 'advanced';

    const buildAnalysisParams = useCallback(() => {
        const params = new URLSearchParams();
        params.set('barangay', filters.barangay === 'All' ? 'all' : filters.barangay);
        if (filters.ageGroup && filters.ageGroup !== 'All') params.set('ageGroup', filters.ageGroup);
        if (filters.vaccineType && filters.vaccineType !== 'All') params.set('vaccineType', filters.vaccineType);
        if (filters.assignedBhw && filters.assignedBhw !== 'All') params.set('assignedBhw', filters.assignedBhw);
        if (sortBy) params.set('sortBy', sortBy);
        return params;
    }, [filters, sortBy]);

    const buildViewParams = useCallback(() => {
        const params = new URLSearchParams();
        params.set('year', String(reportYear));
        params.set('month', String(reportMonth));
        if (filters.barangay && filters.barangay !== 'All') {
            params.set('barangay', filters.barangay);
        }
        return params;
    }, [filters.barangay, reportMonth, reportYear]);

    const loadFilterSurface = useCallback(async () => {
        if ((filterSurface.barangays || []).length > 0) return;
        try {
            const response = await apiClient.get('/dashboard/superadmin/spatial-overview');
            const payload = response.ok ? await response.json() : {};
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to load municipality filter surface.');
            }
            setFilterSurface(payload.filter_options || {});
        } catch (requestError) {
            console.error('[SUPERADMIN_DSS_FILTERS]', requestError);
        }
    }, [filterSurface.barangays]);

    const loadPerformanceGap = useCallback(async ({ force = false } = {}) => {
        const cacheKey = JSON.stringify({
            year: reportYear,
            month: reportMonth,
            barangay: filters.barangay
        });

        if (!force && performanceGapCacheRef.current.has(cacheKey)) {
            setPerformanceGap(performanceGapCacheRef.current.get(cacheKey));
            setLoadingView(false);
            return;
        }

        setLoadingView(true);
        setError('');
        setExportMessage('');
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
            console.error('[SUPERADMIN_DSS_VIEW]', requestError);
            setError(requestError.message || 'Unable to load barangay performance gap.');
        } finally {
            setLoadingView(false);
        }
    }, [buildViewParams, filters.barangay, reportMonth, reportYear]);

    const loadHistoricalTrends = useCallback(async () => {
        setLoadingTrends(true);
        try {
            const params = new URLSearchParams();
            params.set('startMonth', formatMonthToken(reportYear, 1));
            params.set('endMonth', formatMonthToken(reportYear, reportMonth));
            params.set('metricType', mapTrendMetricType(selectedGapMetric));
            if (filters.barangay && filters.barangay !== 'All') params.set('barangay', filters.barangay);
            if (filters.ageGroup && filters.ageGroup !== 'All') params.set('ageGroup', filters.ageGroup);
            if (filters.vaccineType && filters.vaccineType !== 'All') params.set('vaccineType', filters.vaccineType);

            const response = await apiClient.get(`/spatial/historical-trends?${params.toString()}`);
            const payload = response.ok ? await response.json() : {};
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to load historical trends.');
            }
            setHistoricalTrends({
                filters: payload.filters || {},
                rows: payload.rows || []
            });
        } catch (requestError) {
            console.error('[SUPERADMIN_DSS_TRENDS]', requestError);
            setError(requestError.message || 'Unable to load historical trends.');
        } finally {
            setLoadingTrends(false);
        }
    }, [filters.ageGroup, filters.barangay, filters.vaccineType, reportMonth, reportYear, selectedGapMetric]);

    const runAnalyticalMode = useCallback(async () => {
        setRunningAnalysis(true);
        setError('');
        setExportMessage('');
        try {
            const params = buildAnalysisParams();
            params.set('scope', 'defaulter');
            const [analysisResponse] = await Promise.all([
                apiClient.get(`/dashboard/superadmin/spatial-analysis?${params.toString()}`),
                loadHistoricalTrends()
            ]);

            const payload = analysisResponse.ok ? await analysisResponse.json() : {};
            if (!analysisResponse.ok) {
                throw new Error(payload?.error || 'Unable to run spatial analysis.');
            }
            setAnalysis(normalizeAnalysisPayload(payload));
        } catch (requestError) {
            console.error('[SUPERADMIN_DSS_ANALYSIS]', requestError);
            setError(requestError.message || 'Unable to run spatial analysis.');
        } finally {
            setRunningAnalysis(false);
        }
    }, [buildAnalysisParams, loadHistoricalTrends]);

    useEffect(() => {
        if (advancedMode) {
            return undefined;
        }
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
    }, [advancedMode, loadPerformanceGap]);

    useEffect(() => {
        if (advancedMode) {
            loadFilterSurface();
        }
    }, [advancedMode, loadFilterSurface]);

    const handleModeChange = async (nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        setError('');
        setExportMessage('');
        if (nextMode === 'advanced') {
            if (!analysis && !runningAnalysis) {
                await runAnalyticalMode();
            } else if ((historicalTrends.rows || []).length === 0 && !loadingTrends) {
                await loadHistoricalTrends();
            }
            return;
        }
    };

    const handleResetAnalyticalMode = () => {
        setAnalysis(null);
        setHistoricalTrends({ rows: [], filters: {} });
    };

    const captureMapSnapshot = useCallback(async () => {
        const container = mapExportRef.current;
        if (!container) return null;

        const html2canvasModule = await import('html2canvas');
        const html2canvas = html2canvasModule.default;
        const canvas = await html2canvas(container, {
            useCORS: true,
            backgroundColor: '#ffffff',
            scale: 1.5,
            logging: false
        });

        return canvas.toDataURL('image/png');
    }, []);

    const handleExportSnapshot = async () => {
        setExporting(true);
        setExportMessage('');
        try {
            const mapImageDataUrl = await captureMapSnapshot();
            const response = await apiClient.post('/spatial/export-map', {
                mode,
                reportYear,
                reportMonth,
                snapshotMonth: formatMonthToken(reportYear, reportMonth),
                selectedGapMetric,
                filters,
                mapImageDataUrl,
                summary: performanceGap.summary || {},
                historicalTrendRows: historicalTrends.rows || [],
                analysis: {
                    clusters: analysis?.clusters || []
                }
            }, {
                headers: {
                    Accept: 'application/pdf'
                }
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || 'Unable to initialize export.');
            }

            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `immunicare-spatial-dss-${reportYear}-${String(reportMonth).padStart(2, '0')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(objectUrl);
            setExportMessage('PDF export generated successfully.');
        } catch (requestError) {
            console.error('[SUPERADMIN_DSS_EXPORT]', requestError);
            setError(requestError.message || 'Unable to initialize export.');
        } finally {
            setExporting(false);
        }
    };

    const handleSeedSnapshots = async () => {
        setSeedingSnapshots(true);
        setError('');
        setExportMessage('');
        try {
            const response = await apiClient.post('/spatial/seed-snapshots', {
                year: reportYear,
                throughMonth: reportMonth,
                barangay: filters.barangay === 'All' ? null : filters.barangay,
                ageGroup: filters.ageGroup === 'All' ? null : filters.ageGroup,
                vaccineType: filters.vaccineType === 'All' ? null : filters.vaccineType
            });
            const payload = response.ok ? await response.json() : {};
            if (!response.ok) {
                throw new Error(payload?.error || 'Unable to seed historical trend cache.');
            }

            setExportMessage(
                `Seeded ${payload.seededMonths?.length || 0} month(s); inserted ${payload.insertedRows || 0}, updated ${payload.updatedRows || 0}.`
            );

            if (advancedMode) {
                await loadHistoricalTrends();
            }
        } catch (requestError) {
            console.error('[SUPERADMIN_DSS_SEED]', requestError);
            setError(requestError.message || 'Unable to seed historical trend cache.');
        } finally {
            setSeedingSnapshots(false);
        }
    };

    const gapMetricConfig = getGapMetricConfig(selectedGapMetric);
    const viewRows = useMemo(() => {
        const rows = (performanceGap.rows || []).map((row) => {
            const targetValue = Number(row[gapMetricConfig.targetKey] || 0);
            const actualValue = Number(row[gapMetricConfig.actualKey] || 0);
            const gapValue = Number(row[gapMetricConfig.gapKey] || 0);
            const statusCode = selectedGapMetric === 'populationGap'
                ? null
                : deriveGapStatus(row, selectedGapMetric);
            const meta = selectedGapMetric === 'populationGap'
                ? getPopulationGapMeta(gapValue, targetValue)
                : getClinicalStatusMeta(statusCode);
            return {
                ...row,
                statusCode,
                statusMeta: meta,
                targetValue,
                actualValue,
                gapValue,
                center: BARANGAY_COORDINATES[String(row.barangay || '').toUpperCase()] || DEFAULT_MUNICIPAL_CENTER
            };
        });

        return rows.sort((a, b) => b.gapValue - a.gapValue || a.barangay.localeCompare(b.barangay));
    }, [gapMetricConfig.actualKey, gapMetricConfig.gapKey, gapMetricConfig.targetKey, performanceGap.rows, selectedGapMetric]);

    const analysisRows = analysis?.clusters || [];
    const mapCenter = filters.barangay && filters.barangay !== 'All'
        ? getBarangayCenter(filters.barangay)
        : DEFAULT_MUNICIPAL_CENTER;

    const trendChartData = useMemo(() => (
        historicalTrends.rows || []
    ).map((row) => ({
        month: formatMonthShort(row.snapshotMonth),
        metricValue: Number(row.metricValue || 0),
        barangay: row.barangay
    })), [historicalTrends.rows]);

    const municipalPerformanceSummary = useMemo(() => viewRows.reduce((acc, row) => {
        acc.populationGap.target += Number(row.totalPopulation || 0);
        acc.populationGap.actual += Number(row.actualPopulation || 0);
        acc.populationGap.gap += Number(row.populationGap || 0);
        acc.pentaGap.target += Number(row.pentaCumulativeTargetPopulation || 0);
        acc.pentaGap.actual += Number(row.penta3Actual || 0);
        acc.pentaGap.gap += Number(row.pentaGap || 0);
        acc.mcvGap.target += Number(row.mcvCumulativeTargetPopulation || 0);
        acc.mcvGap.actual += Number(row.mcv2Actual || 0);
        acc.mcvGap.gap += Number(row.mcvGap || 0);
        acc.utilizationGap.target += Number(row.utilizationCumulativeTargetPopulation || 0);
        acc.utilizationGap.actual += Number(row.utilizationActual || 0);
        acc.utilizationGap.gap += Number(row.utilizationGap || 0);
        return acc;
    }, {
        populationGap: { target: 0, actual: 0, gap: 0 },
        pentaGap: { target: 0, actual: 0, gap: 0 },
        mcvGap: { target: 0, actual: 0, gap: 0 },
        utilizationGap: { target: 0, actual: 0, gap: 0 }
    }), [viewRows]);

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 lg:p-6">
            <section className="border-b border-slate-200 pb-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">Municipal Geospatial Intelligence</p>
                        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 lg:text-[2rem]">Spatial Decision Support System</h1>
                        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                            Clinical view focuses on one question: which barangays are behind, by how much, and what needs attention first.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleModeChange('clinical')}
                            role="tab"
                            aria-selected={!advancedMode}
                            className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
                                !advancedMode
                                    ? 'border-emerald-200 bg-emerald-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <BarChart3 className="h-4 w-4" />
                            Clinical View
                        </button>
                        <button
                            type="button"
                            onClick={() => handleModeChange('advanced')}
                            role="tab"
                            aria-selected={advancedMode}
                            className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
                                advancedMode
                                    ? 'border-emerald-200 bg-emerald-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <Radar className="h-4 w-4" />
                            Advanced Mode
                        </button>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl bg-white shadow-sm shadow-slate-200/40">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 lg:px-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Clinical Gap View</p>
                            <h2 className="mt-1 text-xl font-black text-slate-950">Barangay Performance Gap</h2>
                            <p className="mt-1 text-sm font-medium text-slate-600">
                                The municipal summary below always equals the sum of the visible barangay rows for the selected month and scope.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => loadPerformanceGap({ force: true })}
                                disabled={loadingView}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                            >
                                <RefreshCw className={`h-4 w-4 ${loadingView ? 'animate-spin' : ''}`} />
                                Refresh Gap View
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
                        <label className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Report Year</span>
                            <select
                                value={reportYear}
                                onChange={(event) => setReportYear(Number(event.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                            >
                                {getYearOptions().map((year) => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Report Month</span>
                            <select
                                value={reportMonth}
                                onChange={(event) => setReportMonth(Number(event.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                            >
                                {MONTH_OPTIONS.map((month) => (
                                    <option key={month.value} value={month.value}>{month.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Barangay Focus</span>
                            <select
                                value={filters.barangay}
                                onChange={(event) => setFilters((prev) => ({ ...prev, barangay: event.target.value }))}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800"
                            >
                                <option value="All">All Barangays</option>
                                {RHU2_BARANGAYS.map((barangay) => (
                                    <option key={barangay} value={barangay}>{barangay}</option>
                                ))}
                            </select>
                        </label>
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Metric Focus</span>
                            <div className="flex flex-wrap gap-2">
                                {GAP_METRICS.map((metric) => {
                                    const meta = getClinicalStatusMeta(metric.status);
                                    return (
                                        <button
                                            key={metric.key}
                                            type="button"
                                            onClick={() => setSelectedGapMetric(metric.key)}
                                            className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] transition-colors ${
                                                selectedGapMetric === metric.key
                                                    ? meta.emphasisBadgeClassName
                                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            {metric.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                </div>

                <div className={`grid gap-0 ${advancedMode ? 'xl:grid-cols-[minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1fr)_360px]'}`}>
                    <div ref={mapExportRef} className="border-b border-slate-200 xl:border-b-0 xl:border-r xl:border-slate-200">
                        <div className="flex flex-col gap-6 border-b border-slate-200 px-5 py-6 lg:px-6 lg:py-7">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Municipality Map Surface</p>
                                    <h3 className="mt-1 text-xl font-black text-slate-950">{advancedMode ? 'Spatial Analysis Map' : 'Performance Gap Map'}</h3>
                                </div>
                                <div className="inline-flex items-center gap-2 self-start rounded-full bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-800">
                                    <MapPinned className="h-4 w-4" />
                                    {advancedMode ? 'Hotspot Overlay' : gapMetricConfig.label}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                                <SummaryKpiCard
                                    label="Penta Gap"
                                    value={loadingView ? '...' : municipalPerformanceSummary.pentaGap.gap}
                                    toneClassName={getClinicalStatusMeta(CLINICAL_STATUS.DEFAULTED).textClassName}
                                    accentClassName={getClinicalStatusMeta(CLINICAL_STATUS.DEFAULTED).dotClassName}
                                />
                                <SummaryKpiCard
                                    label="MCV Gap"
                                    value={loadingView ? '...' : municipalPerformanceSummary.mcvGap.gap}
                                    toneClassName={getClinicalStatusMeta(CLINICAL_STATUS.DUE_SOON).textClassName}
                                    accentClassName={getClinicalStatusMeta(CLINICAL_STATUS.DUE_SOON).dotClassName}
                                />
                                <SummaryKpiCard
                                    label="Utilization Gap"
                                    value={loadingView ? '...' : municipalPerformanceSummary.utilizationGap.gap}
                                    toneClassName={getClinicalStatusMeta(CLINICAL_STATUS.OVERDUE).textClassName}
                                    accentClassName={getClinicalStatusMeta(CLINICAL_STATUS.OVERDUE).dotClassName}
                                />
                                <SummaryKpiCard
                                    label="Population Gap"
                                    value={loadingView ? '...' : municipalPerformanceSummary.populationGap.gap}
                                    toneClassName="text-sky-700"
                                    accentClassName="bg-sky-500"
                                    note="Neutral denominator metric"
                                />
                            </div>
                        </div>

                        <div className="h-[720px] w-full">
                            <MapContainer
                                key={`clinical-${filters.barangay}-${selectedGapMetric}-${reportMonth}-${reportYear}-${advancedMode ? 'advanced' : 'default'}`}
                                center={[mapCenter.lat, mapCenter.lng]}
                                zoom={mapCenter.zoom || 14}
                                minZoom={12}
                                maxZoom={18}
                                scrollWheelZoom
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    crossOrigin="anonymous"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <ScaleControl position="bottomleft" />

                                {viewRows.map((row) => (
                                    <CircleMarker
                                        key={`${row.barangay}-${selectedGapMetric}`}
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
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-black text-slate-950">{row.barangay}</p>
                                                        <p className="font-semibold text-slate-600">{gapMetricConfig.label}</p>
                                                    </div>
                                                    {selectedGapMetric === 'populationGap' ? (
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${row.statusMeta.badgeClassName}`}>
                                                            {row.statusMeta.label}
                                                        </span>
                                                    ) : (
                                                        <StatusBadge status={row.statusCode} />
                                                    )}
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

                                {advancedMode && analysisRows.map((cluster, index) => {
                                    const hull = computeConvexHull(cluster.points || []);
                                    const color = clusterColors[index % clusterColors.length];
                                    return (
                                        <React.Fragment key={cluster.clusterId || `cluster-${index}`}>
                                            {hull.length >= 3 && (
                                                <Polygon
                                                    positions={hull}
                                                    pathOptions={{
                                                        color,
                                                        fillColor: color,
                                                        fillOpacity: 0.16,
                                                        weight: 3
                                                    }}
                                                >
                                                    <Popup>
                                                        <div className="text-sm">
                                                            <p className="font-black text-slate-950">{cluster.locality || `Hotspot ${index + 1}`}</p>
                                                            <p className="font-semibold text-slate-600">{cluster.total_infants || 0} clustered infants</p>
                                                            <p className="mt-1 text-xs font-medium text-slate-500">
                                                                {cluster.total_defaulter_doses || 0} actionable defaulter doses
                                                            </p>
                                                        </div>
                                                    </Popup>
                                                </Polygon>
                                            )}
                                            {(cluster.points || []).map((point) => {
                                                const coordinates = getPointCoordinates(point);
                                                if (!coordinates) return null;
                                                return (
                                                    <CircleMarker
                                                        key={`${cluster.clusterId || index}-${point.id}`}
                                                        center={coordinates}
                                                        radius={6}
                                                        pathOptions={{
                                                            color: '#ffffff',
                                                            fillColor: color,
                                                            fillOpacity: 0.9,
                                                            weight: 2
                                                        }}
                                                    >
                                                        <Popup>
                                                            <div className="text-sm">
                                                                <p className="font-black text-slate-950">{formatFullNameFromObject(point) || 'Infant'}</p>
                                                                <p className="font-semibold text-slate-600">{point.reference_id || point.id}</p>
                                                                <p className="mt-1 text-xs font-medium text-slate-500">
                                                                    {point.barangay || point.locality || 'San Pedro'}
                                                                </p>
                                                            </div>
                                                        </Popup>
                                                    </CircleMarker>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </MapContainer>
                        </div>
                    </div>

                    {!advancedMode ? (
                    <div className="bg-slate-50/50">
                        <div className="border-b border-slate-200 px-4 py-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">Barangay Performance Table</p>
                            <p className="mt-1 text-sm font-medium text-slate-500">Simple operational ranking for Head Nurse review.</p>
                        </div>
                        <div className="max-h-[720px] overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="sticky top-0 bg-white">
                                    <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                                        <th className="px-4 py-3">Barangay</th>
                                        <th className="px-4 py-3 text-right">Target</th>
                                        <th className="px-4 py-3 text-right">Actual</th>
                                        <th className="px-4 py-3 text-right">Gap</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewRows.map((row) => (
                                        <tr key={`table-${row.barangay}-${selectedGapMetric}`} className="border-b border-slate-200/80 bg-white">
                                            <td className="px-4 py-3 font-black text-slate-900">{row.barangay}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-700">{row.targetValue}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-700">{row.actualValue}</td>
                                            <td className={`px-4 py-3 text-right font-black ${row.statusMeta.textClassName}`}>{row.gapValue}</td>
                                            <td className="px-4 py-3">
                                                {selectedGapMetric === 'populationGap' ? (
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${row.statusMeta.badgeClassName}`}>
                                                        {row.statusMeta.label}
                                                    </span>
                                                ) : (
                                                    <StatusBadge status={row.statusCode} />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {!loadingView && viewRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                                                No performance-gap rows matched the current scope.
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                        <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-4 text-sm font-semibold text-slate-500">
                            Note: Totals are aggregated from individual Barangay records.
                        </div>
                    </div>
                    ) : null}
                </div>
            </section>

            {/* Deprecated specialist workflow is preserved behind Advanced Mode for rollback safety. */}
            {advancedMode ? (
                <section className="rounded-2xl bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 lg:px-5">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">Advanced Tools</p>
                            <p className="mt-1 text-sm font-medium text-slate-500">Hotspots, trend cache, and export utilities are intentionally separated from the clinical view.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setControlsOpen((value) => !value)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            {controlsOpen ? 'Hide Panel' : 'Show Panel'}
                        </button>
                    </div>

                    <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
                        <aside className={`border-b border-slate-200 bg-slate-50/70 transition-all duration-300 xl:border-b-0 xl:border-r xl:border-slate-200 ${controlsOpen ? 'block' : 'hidden xl:block'}`}>
                            <div className="space-y-1 py-3">
                                <div className="mx-4 mb-3 rounded-xl bg-emerald-50 px-4 py-3">
                                    <div className="flex items-start gap-3">
                                        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" />
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-900">Super Admin only</p>
                                            <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">
                                                Advanced spatial analysis remains isolated from barangay workflows and is preserved as a secondary layer for specialist use.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <DrawerSection title="Analytical Filters" subtitle="Refine the analysis set before running hotspots.">
                                    <FilterToolbar
                                        category="superadmin_spatial_dss_analysis"
                                        searchTerm=""
                                        onSearchChange={() => {}}
                                        filters={filters}
                                        onFiltersChange={setFilters}
                                        sortBy={sortBy}
                                        onSortChange={setSortBy}
                                        barangayOptions={filterSurface.barangays || RHU2_BARANGAYS}
                                        ageGroupOptions={filterSurface.ageGroups || []}
                                        vaccineOptions={filterSurface.vaccineTypes || []}
                                        assignedBhwOptions={filterSurface.assignedBhws || []}
                                        sortOptions={filterSurface.sortOptions || []}
                                        showBarangayFilter
                                        showSexFilter={false}
                                        showAgeGroupFilter
                                        showVaccineTypeFilter
                                        showAssignedBhwFilter
                                        searchPlaceholder="Search is disabled in DSS mode."
                                        className="[&_.relative]:hidden [&_select]:rounded-xl [&_select]:border-slate-200"
                                    />
                                </DrawerSection>

                                <DrawerSection title="Analysis Actions" subtitle="Run manual municipality-wide clustering only when needed.">
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            type="button"
                                            onClick={runAnalyticalMode}
                                            disabled={runningAnalysis}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#115e59] disabled:cursor-not-allowed disabled:bg-slate-300"
                                        >
                                            {runningAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                                            {runningAnalysis ? 'Running Analysis...' : 'Run Spatial Analysis'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleResetAnalyticalMode}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-50"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                            Reset Advanced State
                                        </button>
                                    </div>
                                </DrawerSection>

                                <DrawerSection title="Utilities" subtitle="Preserved for export and demo seeding." defaultOpen={false}>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            type="button"
                                            onClick={handleExportSnapshot}
                                            disabled={exporting}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                                        >
                                            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                            {exporting ? 'Exporting...' : 'Export Snapshot'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSeedSnapshots}
                                            disabled={seedingSnapshots}
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                                        >
                                            {seedingSnapshots ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                                            {seedingSnapshots ? 'Seeding Trend Cache...' : 'Seed Data'}
                                        </button>
                                    </div>
                                </DrawerSection>
                            </div>
                        </aside>

                        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                            <div className="border-b border-slate-200 lg:border-b-0 lg:border-r lg:border-slate-200 bg-white">
                                <div className="border-b border-slate-200 px-4 py-4">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">Hotspot Layer</p>
                                    <p className="mt-1 text-sm font-medium text-slate-500">Advanced mode overlays DBSCAN clusters onto the same canonical gap map.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 px-4 py-4 lg:grid-cols-4">
                                    <CompactMetricCard label="Clusters" value={runningAnalysis ? '...' : analysisRows.length} />
                                    <CompactMetricCard label="Trend Rows" value={loadingTrends ? '...' : historicalTrends.rows.length} />
                                    <CompactMetricCard label="Metric" value={gapMetricConfig.label} />
                                    <CompactMetricCard label="Scope" value={filters.barangay === 'All' ? 'Municipality' : filters.barangay} />
                                </div>
                            </div>

                            <div className="bg-slate-50/50">
                                <div className="border-b border-slate-200 px-4 py-4">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-600">Historical Trends</p>
                                    <p className="mt-1 text-sm font-medium text-slate-500">Trend cache and row-level readout retained for analytical review.</p>
                                </div>
                                <div className="space-y-4 p-4">
                                    <div className="rounded-xl bg-white px-4 py-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Metric Binding</p>
                                        <p className="mt-2 text-sm font-black text-slate-950">{mapTrendMetricType(selectedGapMetric)}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                            {historicalTrends.filters?.barangay || 'Municipality-wide'} from {formatMonthShort(historicalTrends.filters?.startMonth)} to {formatMonthShort(historicalTrends.filters?.endMonth)}
                                        </p>
                                    </div>

                                    <div className="h-64 rounded-xl bg-white p-3">
                                        {loadingTrends ? (
                                            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Loading historical trend surface...
                                            </div>
                                        ) : trendChartData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={trendChartData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                                    <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700 }} />
                                                    <YAxis tick={{ fontSize: 10, fontWeight: 700 }} />
                                                    <Tooltip />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="metricValue"
                                                        stroke={getClinicalStatusMeta(CLINICAL_STATUS.DEFAULTED).colorHex}
                                                        strokeWidth={3}
                                                        dot={{ r: 4 }}
                                                        activeDot={{ r: 6 }}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-center text-sm font-semibold text-slate-500">
                                                No cached historical rows are available yet for the selected metric and filters.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            ) : null}

            {error ? (
                <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {error}
                </div>
            ) : null}

            {exportMessage ? (
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                    {exportMessage}
                </div>
            ) : null}
        </div>
    );
}
