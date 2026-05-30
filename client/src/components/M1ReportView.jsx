import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    FileText,
    Printer,
    RefreshCw
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
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';

const safeNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatCount = (value, decimals = 0) => safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const formatPercent = (value) => `${safeNumber(value).toFixed(1)}%`;
const formatPercentPrecise = (value) => `${safeNumber(value).toFixed(2)}%`;

const MACRO_COLUMNS = [
    ['bcg', 'BCG'],
    ['hepb', 'Hep B'],
    ['penta1', 'Penta 1'],
    ['penta2', 'Penta 2'],
    ['penta3', 'Penta 3'],
    ['opv1', 'OPV 1'],
    ['opv2', 'OPV 2'],
    ['opv3', 'OPV 3'],
    ['ipv1', 'IPV 1'],
    ['ipv2', 'IPV 2'],
    ['pcv1', 'PCV 1'],
    ['pcv2', 'PCV 2'],
    ['pcv3', 'PCV 3'],
    ['mcv1', 'MCV 1'],
    ['mcv2', 'MCV 2'],
    ['fic', 'FIC'],
    ['cic', 'CIC']
];

const MICRO_GROUPS = [
    {
        title: 'BCG',
        columns: [
            ['bcg_at_birth', '@ Birth'],
            ['bcg_after_24_hours', 'After 24 Hrs']
        ]
    },
    {
        title: 'Hep B',
        columns: [
            ['hepb_at_birth', '@ Birth'],
            ['hepb_after_24_hours', 'After 24 Hrs']
        ]
    },
    ...['penta1', 'penta2', 'penta3', 'opv1', 'opv2', 'opv3', 'ipv1', 'ipv2', 'pcv1', 'pcv2', 'pcv3', 'mcv1', 'mcv2'].map((code) => ({
        title: code.toUpperCase().replace('PENTA', 'Penta ').replace('OPV', 'OPV ').replace('IPV', 'IPV ').replace('PCV', 'PCV ').replace('MCV', 'MCV '),
        columns: [
            [`${code}_0_12`, '0-12 Mos'],
            [`${code}_13_23`, '13-23 Mos'],
            [`${code}_catch_up`, 'Catch-up']
        ]
    })),
    {
        title: 'Completion',
        columns: [
            ['fic', 'FIC'],
            ['cic', 'CIC']
        ]
    }
];

const MONITORING_TABLES = [
    {
        key: 'penta',
        title: 'PENTA Monitoring',
        subtitle: 'Cumulative PENTA 1 to PENTA 3 drop-out tracking',
        columns: [
            ['month', 'Month', 'text'],
            ['cumulative_target_population', 'Cumulative Target', 'count'],
            ['penta1_count', 'PENTA 1', 'count'],
            ['penta3_count', 'PENTA 3', 'count'],
            ['penta1_cumulative', 'PENTA 1 Cumulative', 'count'],
            ['penta3_cumulative', 'PENTA 3 Cumulative', 'count'],
            ['dropout_count', 'Drop-outs', 'count'],
            ['dropout_rate', 'Drop-out Rate (%)', 'percent']
        ]
    },
    {
        key: 'mcv',
        title: 'MCV Monitoring',
        subtitle: 'Cumulative MCV 1 to MCV 2 drop-out tracking',
        columns: [
            ['month', 'Month', 'text'],
            ['cumulative_target_population', 'Cumulative Target', 'count'],
            ['mcv1_count', 'MCV 1', 'count'],
            ['mcv2_count', 'MCV 2', 'count'],
            ['mcv1_cumulative', 'MCV 1 Cumulative', 'count'],
            ['mcv2_cumulative', 'MCV 2 Cumulative', 'count'],
            ['mcv_dropout_count', 'Drop-outs', 'count'],
            ['mcv_dropout_rate', 'Drop-out Rate (%)', 'percent']
        ]
    },
    {
        key: 'utilization',
        title: 'Utilization',
        subtitle: 'PENTA 1 to MCV 2 utilization follow-through',
        columns: [
            ['month', 'Month', 'text'],
            ['cumulative_target_population', 'Cumulative Target', 'count'],
            ['penta1_count', 'PENTA 1', 'count'],
            ['mcv2_count', 'MCV 2', 'count'],
            ['penta1_cumulative', 'PENTA 1 Cumulative', 'count'],
            ['mcv2_cumulative', 'MCV 2 Cumulative', 'count'],
            ['utilization_dropout_count', 'Drop-outs', 'count'],
            ['utilization_dropout_rate', 'Drop-out Rate (%)', 'percent']
        ]
    }
];

const EmptyState = ({ message }) => (
    <div className="flex h-72 flex-col items-center justify-center border border-slate-200 bg-white text-center">
        <FileText className="h-9 w-9 text-slate-300" />
        <p className="mt-3 text-sm font-black text-slate-700">{message}</p>
    </div>
);

const ReportError = ({ error, onRetry }) => (
    <div className="flex h-72 flex-col items-center justify-center border border-rose-200 bg-rose-50 text-center">
        <AlertTriangle className="h-9 w-9 text-rose-600" />
        <p className="mt-3 text-base font-black text-rose-900">Could not load report</p>
        <p className="mt-1 max-w-lg text-sm font-semibold text-rose-700">{error}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 border border-rose-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-800"
        >
            <RefreshCw className="h-4 w-4" /> Retry
        </button>
    </div>
);

const LoadingState = ({ label }) => (
    <div className="flex h-72 flex-col items-center justify-center border border-slate-200 bg-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-800" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
    </div>
);

const MacroGrid = ({ rows = [] }) => {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const bodyRows = safeRows.filter((row) => row?.barangay !== 'RHU GRAND TOTAL');
    const totalRow = safeRows.find((row) => row?.barangay === 'RHU GRAND TOTAL');

    return (
        <section className="border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Super Admin Macro View</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">NIP Monthly Accomplishment by Barangay</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-[#064E3B] text-white">
                        <tr>
                            <th className="sticky left-0 z-10 border-r border-emerald-700 bg-[#064E3B] px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider">
                                Barangay
                            </th>
                            {MACRO_COLUMNS.map(([key, label]) => (
                                <th key={key} className="border-r border-emerald-700 px-3 py-3 text-right text-[11px] font-black uppercase tracking-wider">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {bodyRows.map((row, index) => (
                            <tr key={row?.barangay || `barangay-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-inherit px-4 py-3 font-black text-slate-950">
                                    {row?.barangay || 'Unassigned Barangay'}
                                </td>
                                {MACRO_COLUMNS.map(([key]) => (
                                    <td key={key} className="border-b border-r border-slate-100 px-3 py-3 text-right font-semibold text-slate-800">
                                        {formatCount(row?.[key] || 0)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    {totalRow ? (
                        <tfoot className="bg-emerald-50">
                            <tr>
                                <td className="sticky left-0 z-10 border-r border-emerald-200 bg-emerald-50 px-4 py-3 font-black text-[#064E3B]">
                                    RHU Grand Total
                                </td>
                                {MACRO_COLUMNS.map(([key]) => (
                                    <td key={key} className="border-r border-emerald-100 px-3 py-3 text-right font-black text-[#064E3B]">
                                        {formatCount(totalRow?.[key] || 0)}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    ) : null}
                </table>
            </div>
        </section>
    );
};

const MicroGrid = ({ rows = [] }) => {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const row = safeRows?.[0] || {};

    return (
        <section className="border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Barangay Admin Micro View</p>
                <h3 className="mt-1 text-xl font-black text-slate-950">Detailed Monthly DOH Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-[#064E3B] text-white">
                            <th rowSpan={2} className="sticky left-0 z-20 border-r border-emerald-700 bg-[#064E3B] px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider">
                                Month
                            </th>
                            {MICRO_GROUPS.map((group) => (
                                <th key={group.title} colSpan={group.columns.length} className="border-r border-emerald-700 px-3 py-2 text-center text-[11px] font-black uppercase tracking-wider">
                                    {group.title}
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-emerald-900 text-white">
                            {MICRO_GROUPS.flatMap((group) => group.columns).map(([key, label]) => (
                                <th key={key} className="border-r border-emerald-700 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="bg-white">
                            <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-4 py-3 font-black text-slate-950">
                                {row?.report_month ? `Month ${row.report_month}` : 'Selected Month'}
                            </td>
                            {MICRO_GROUPS.flatMap((group) => group.columns).map(([key]) => (
                                <td key={key} className="border-b border-r border-slate-100 px-3 py-3 text-right font-semibold text-slate-800">
                                    {formatCount(row?.[key] || 0)}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const MonitoringTableCard = ({ config, rows = [] }) => {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];

    const renderCell = (row, key, type) => {
        if (type === 'text') return row?.month_label || row?.report_month || '';
        if (type === 'percent') return formatPercentPrecise(row?.[key] || 0);
        return formatCount(row?.[key] || 0);
    };

    return (
        <section className="border border-slate-300 bg-white shadow-sm print:break-inside-avoid">
            <div className="flex flex-col gap-1 border-b border-slate-300 bg-[#064E3B] px-5 py-4 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100">
                    DOH Monitoring Table
                </p>
                <h3 className="text-xl font-black">{config?.title || 'Monitoring'}</h3>
                <p className="text-xs font-bold text-emerald-100">{config?.subtitle || ''}</p>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-emerald-50">
                            {(config?.columns || []).map(([key, label], index) => (
                                <th
                                    key={key}
                                    className={`border-b border-r border-slate-300 px-3 py-3 text-right text-[11px] font-black uppercase tracking-wider text-slate-950 ${index === 0 ? 'sticky left-0 z-10 bg-emerald-50 text-left' : ''}`}
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {safeRows.length > 0 ? safeRows.map((row, rowIndex) => (
                            <tr key={`${config?.key || 'monitoring'}-${row?.report_month || rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                {(config?.columns || []).map(([key, , type], columnIndex) => {
                                    const isTargetOrDropout = key.includes('target') || key.includes('dropout');
                                    return (
                                        <td
                                            key={key}
                                            className={`border-b border-r border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-900 ${columnIndex === 0 ? 'sticky left-0 z-10 bg-inherit text-left font-black uppercase' : ''} ${isTargetOrDropout && columnIndex !== 0 ? 'bg-emerald-50/60' : ''}`}
                                        >
                                            {renderCell(row, key, type)}
                                        </td>
                                    );
                                })}
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={config?.columns?.length || 1} className="px-5 py-8 text-center text-sm font-bold text-slate-500">
                                    No monitoring records available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const MonitoringTables = ({ rows = [], targetStatus }) => {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const hasTargets = targetStatus?.has_required_targets !== false;

    return (
        <div className="space-y-5">
            {!hasTargets ? (
                <div className="border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
                    Target Population Not Set
                </div>
            ) : null}
            {MONITORING_TABLES.map((config) => (
                <MonitoringTableCard key={config.key} config={config} rows={safeRows} />
            ))}
        </div>
    );
};

const MonitoringChart = ({ rows = [], targetStatus }) => {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const chartData = safeRows.map((row) => ({
        month: row?.month_label || row?.report_month || '',
        target: safeNumber(row?.cumulative_target_population || 0),
        penta1: safeNumber(row?.penta1_cumulative || 0),
        penta3: safeNumber(row?.penta3_cumulative || 0),
        dropoutCount: safeNumber(row?.dropout_count || 0),
        dropoutRate: safeNumber(row?.dropout_rate || 0)
    }));
    const hasTargets = targetStatus?.has_required_targets !== false;

    return (
        <section className="border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[#064E3B]" />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Monitoring Chart</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">Cumulative Target, Penta Tracking, and Drop-out</h3>
                    </div>
                </div>
            </div>
            {!hasTargets ? (
                <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900">
                    Target Population Not Set
                </div>
            ) : null}
            <div className="h-[380px] p-5">
                {hasTargets && chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 28, left: 0, bottom: 10 }}>
                            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="count" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
                            <Tooltip
                                formatter={(value, name) => [
                                    String(name).includes('Rate') ? formatPercent(value) : formatCount(value, 1),
                                    name
                                ]}
                                contentStyle={{ border: '1px solid #CBD5E1', borderRadius: 0, fontSize: 12 }}
                            />
                            <Legend />
                            <Line yAxisId="count" type="monotone" name="Cumulative Target" dataKey="target" stroke="#64748B" strokeWidth={2} dot={false} />
                            <Line yAxisId="count" type="monotone" name="Penta 1 Cumulative" dataKey="penta1" stroke="#047857" strokeWidth={3} dot={{ r: 3 }} />
                            <Line yAxisId="count" type="monotone" name="Penta 3 Cumulative" dataKey="penta3" stroke="#0F766E" strokeWidth={3} dot={{ r: 3 }} />
                            <Line yAxisId="count" type="monotone" name="Dropout Count" dataKey="dropoutCount" stroke="#B45309" strokeWidth={2} dot={{ r: 3 }} />
                            <Line yAxisId="rate" type="monotone" name="Dropout Rate" dataKey="dropoutRate" stroke="#B91C1C" strokeWidth={3} dot={{ r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <EmptyState message={hasTargets ? 'No monitoring records available' : 'Target Population Not Set'} />
                )}
            </div>
        </section>
    );
};

const M1ReportView = ({ month, year, barangay, reportMode }) => {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'Super Admin';
    const shouldUseMicroView = reportMode === 'micro' || (!isSuperAdmin && reportMode !== 'macro');
    const [primaryReport, setPrimaryReport] = useState(null);
    const [monitoringReport, setMonitoringReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const buildQuery = useCallback((path, includeMonth = true) => {
        const params = new URLSearchParams();
        if (year) params.set('year', year);
        if (includeMonth && month) params.set('month', month);
        if (barangay) params.set('barangay', String(barangay));
        const query = params.toString();
        return query ? `${path}?${query}` : path;
    }, [month, year, barangay]);

    const fetchReports = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const primaryPath = shouldUseMicroView ? '/reports/nip-micro' : '/reports/nip-macro';
            const [primaryResult, monitoringResult] = await Promise.allSettled([
                apiClient.get(buildQuery(primaryPath, true)),
                apiClient.get(buildQuery('/reports/monitoring-chart', false))
            ]);

            if (primaryResult.status === 'rejected') {
                throw primaryResult.reason;
            }

            const primaryResponse = primaryResult.value;
            const primaryPayload = await primaryResponse.json().catch(() => ({}));

            if (!primaryResponse.ok || primaryPayload.success === false) {
                throw new Error(primaryPayload?.error || `Report request failed with HTTP ${primaryResponse.status}`);
            }

            let monitoringPayload = {
                success: true,
                rows: [],
                target_status: {
                    has_required_targets: false,
                    system_message: 'Monitoring chart unavailable'
                }
            };
            if (monitoringResult.status === 'fulfilled') {
                const monitoringResponse = monitoringResult.value;
                const parsedMonitoring = await monitoringResponse.json().catch(() => ({}));
                if (monitoringResponse.ok && parsedMonitoring?.success !== false) {
                    monitoringPayload = parsedMonitoring;
                } else {
                    console.error('[DOH_REPORT_MONITORING]', parsedMonitoring?.error || `Monitoring request failed with HTTP ${monitoringResponse.status}`);
                }
            } else {
                console.error('[DOH_REPORT_MONITORING]', monitoringResult.reason);
            }

            setPrimaryReport(primaryPayload || {});
            setMonitoringReport(monitoringPayload || {});
        } catch (requestError) {
            console.error('[DOH_REPORT_VIEW]', requestError);
            setPrimaryReport(null);
            setMonitoringReport(null);
            setError(requestError.message || 'Unable to load report.');
        } finally {
            setLoading(false);
        }
    }, [buildQuery, shouldUseMicroView]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const handlePrint = () => window.print();

    if (loading) return <LoadingState label="Loading DOH report" />;
    if (error) return <ReportError error={error} onRetry={fetchReports} />;
    if (!primaryReport) return <EmptyState message="No report data available" />;

    const period = primaryReport?.period || {};
    const scope = primaryReport?.scope || {};

    return (
        <div className="space-y-6 print:space-y-3">
            <section className="border border-slate-300 bg-white print:border-black">
                <div className="border-b border-slate-300 bg-[#064E3B] px-6 py-4 text-white">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100">
                                San Pedro NIP Monthly Accomplishment
                            </p>
                            <h2 className="mt-1 text-2xl font-black">
                                {shouldUseMicroView ? 'Barangay Micro Report' : 'RHU Macro Report'}
                            </h2>
                            <p className="mt-1 text-xs font-bold text-emerald-100">
                                {scope?.label || scope?.barangay || 'Assigned Barangay'} - {period?.month_label || ''} {period?.year || year}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="inline-flex items-center justify-center gap-2 border border-emerald-700 bg-[#053B2D] px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-[#03281F] print:hidden"
                        >
                            <Printer className="h-4 w-4" /> Print
                        </button>
                    </div>
                </div>
            </section>

            {shouldUseMicroView ? (
                <MicroGrid rows={primaryReport?.rows || []} />
            ) : (
                <MacroGrid rows={primaryReport?.rows || []} />
            )}

            <MonitoringTables rows={monitoringReport?.rows || []} targetStatus={monitoringReport?.target_status || {}} />
            <MonitoringChart rows={monitoringReport?.rows || []} targetStatus={monitoringReport?.target_status || {}} />
        </div>
    );
};

export default M1ReportView;
