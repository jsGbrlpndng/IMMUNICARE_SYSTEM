import React from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { formatCount, formatPercent } from './reportConfig';

const safeNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const monthIndexFromRow = (row) => {
    const numericMonth = safeNumber(row?.report_month);
    if (numericMonth >= 1 && numericMonth <= 12) return numericMonth;

    const monthLabel = String(row?.month_label || row?.month || '').trim().slice(0, 3).toUpperCase();
    const monthMap = {
        JAN: 1,
        FEB: 2,
        MAR: 3,
        APR: 4,
        MAY: 5,
        JUN: 6,
        JUL: 7,
        AUG: 8,
        SEP: 9,
        OCT: 10,
        NOV: 11,
        DEC: 12
    };
    return monthMap[monthLabel] || 0;
};

const directValue = (row, keys = []) => {
    for (const key of keys) {
        if (row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== '') {
            return safeNumber(row[key]);
        }
    }
    return 0;
};

export const normalizeRows = (rows = []) => rows.map((row) => {
    const monthIndex = monthIndexFromRow(row);
    const pentaTargetConfig = directValue(row, [
        'penta_target_config',
        'penta_cumulative_target_population',
        'eligible_population_0_11_months',
        'eligible_population'
    ]);
    const mcvTargetConfig = directValue(row, [
        'mcv_target_config',
        'mcv_cumulative_target_population',
        'eligible_population_0_12_months'
    ]);
    const utilizationTargetConfig = directValue(row, [
        'utilization_target_config',
        'utilization_cumulative_target_population',
        'eligible_population_0_12_months'
    ]);
    const pentaCummulativeTargetPopulation = pentaTargetConfig * monthIndex;
    const mcvCummulativeTargetPopulation = mcvTargetConfig * monthIndex;
    const utilizationCummulativeTargetPopulation = utilizationTargetConfig * monthIndex;
    const penta1Cummulative = directValue(row, [
        'penta1_cumulative'
    ]);
    const penta3Cummulative = directValue(row, [
        'penta3_cumulative'
    ]);
    const mcv1Cummulative = directValue(row, [
        'mcv1_cumulative'
    ]);
    const mcv2Cummulative = directValue(row, [
        'mcv2_cumulative'
    ]);
    const utilizationPenta1Cummulative = directValue(row, [
        'penta1_cumulative'
    ]);
    const utilizationMcv2Cummulative = directValue(row, [
        'mcv2_cumulative'
    ]);
    const penta1_count = directValue(row, ['penta1_count']);
    const penta3_count = directValue(row, ['penta3_count']);
    const mcv1_count = directValue(row, ['mcv1_count']);
    const mcv2_count = directValue(row, ['mcv2_count']);
    const utilizationPenta1Count = directValue(row, ['utilization_penta1_count', 'penta1_count']);
    const utilizationMcv2Count = directValue(row, ['utilization_mcv2_count', 'mcv2_count']);

    return {
        month: row?.month_label || row?.report_month || '',
        monthIndex,
        cumulativeTargetPopulation: pentaCummulativeTargetPopulation,
        target: safeNumber(row?.eligible_population_0_11_months || row?.eligible_population),
        pentaTarget: pentaCummulativeTargetPopulation,
        mcvTarget: mcvCummulativeTargetPopulation,
        utilizationTarget: utilizationCummulativeTargetPopulation,
        pentaTargetConfig,
        mcvTargetConfig,
        utilizationTargetConfig,
        pentaCummulativeTargetPopulation,
        mcvCummulativeTargetPopulation,
        utilizationCummulativeTargetPopulation,
        penta1Cummulative,
        penta3Cummulative,
        mcv1Cummulative,
        mcv2Cummulative,
        utilizationPenta1Cummulative,
        utilizationMcv2Cummulative,
        cicTarget: safeNumber(row?.cumulative_target_population_13_23_months),
        eligiblePopulation011: safeNumber(row?.eligible_population_0_11_months || row?.eligible_population),
        eligiblePopulation012: safeNumber(row?.eligible_population_0_12_months),
        eligiblePopulation1323: safeNumber(row?.eligible_population_13_23_months),
        penta1: penta1Cummulative,
        penta3: penta3Cummulative,
        pentaDropoutRate: directValue(row, ['dropout_rate']),
        mcv1: mcv1Cummulative,
        mcv2: mcv2Cummulative,
        mcvDropoutRate: directValue(row, ['mcv_dropout_rate']),

        // Additional fields for FHSIS Data Cards
        penta1_count,
        penta3_count,
        pentaDropoutCount: safeNumber(row?.dropout_count),

        mcv1_count,
        mcv2_count,
        mcvDropoutCount: safeNumber(row?.mcv_dropout_count),

        utilization_penta1_count: utilizationPenta1Count,
        utilization_mcv2_count: utilizationMcv2Count,
        utilizationDropoutCount: safeNumber(row?.utilization_cumulative_dropout_count || row?.utilization_dropout_count),
        utilizationDropoutRate: directValue(row, ['utilization_cumulative_dropout_rate', 'utilization_dropout_rate'])
    };
});

const targetOnlyText = (target) => formatCount(target);
const CUMMULATIVE_TARGET_LABEL = 'CUMMULATIVE TARGET POPULATION';

const ChartShell = ({ title, subtitle, children }) => (
    <section className="border border-slate-300 bg-white">
        <div className="border-b border-slate-300 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Immunization Monitoring</p>
            <h3 className="text-lg font-black text-slate-950">{title}</h3>
            <p className="text-xs font-bold text-slate-500">{subtitle}</p>
        </div>
        <div className="h-[360px] p-4">
            {children}
        </div>
    </section>
);

const EmptyChart = () => (
    <div className="flex h-full items-center justify-center border border-slate-200 bg-slate-50 text-sm font-bold text-slate-500">
        No monitoring data available.
    </div>
);

const MonitoringLineChart = ({ data, children }) => {
    if (!data.length) return <EmptyChart />;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 28, left: 2, bottom: 6 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="count" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatCount(value)} />
                <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
                <Tooltip
                    formatter={(value, name) => [
                        String(name).includes('Rate') ? formatPercent(value, 2) : formatCount(value),
                        name
                    ]}
                    contentStyle={{ border: '1px solid #CBD5E1', borderRadius: 0, fontSize: 12 }}
                    labelStyle={{ fontWeight: 900, color: '#0F172A' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 800 }} />
                {children}
            </LineChart>
        </ResponsiveContainer>
    );
};

const DataCard = ({ title, columns, data }) => (
    <div className="overflow-hidden border border-slate-400 bg-white shadow-sm">
        <div className="border-b border-slate-400 bg-[#064E3B] px-4 py-3">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h4>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead className="bg-slate-200">
                    <tr>
                        {columns.map((col, i) => (
                            <th key={i} className={`px-3 py-2 font-black text-slate-800 uppercase ${i === 0 ? 'text-left' : 'text-right'} border-r border-slate-400 last:border-r-0`}>
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr key={i} className={`border-b border-slate-300 last:border-b-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100 transition-colors`}>
                            {columns.map((col, j) => (
                                <td key={j} className={`px-3 py-2 whitespace-nowrap text-slate-900 ${j === 0 ? 'text-left font-black uppercase' : 'text-right font-semibold'} border-r border-slate-300 last:border-r-0`}>
                                    {col.render ? col.render(row) : row[col.accessor]}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {data.length === 0 && (
                        <tr>
                            <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500 font-bold">
                                No data available
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

const MonitoringCharts = ({ report }) => {
    const rows = normalizeRows(report?.rows || []);
    const targetStatus = report?.target_status || {};
    const missingTargets = targetStatus?.has_required_targets === false;
    const tableData = rows;

    const pentaColumns = [
        { header: 'Month', accessor: 'month' },
        { header: CUMMULATIVE_TARGET_LABEL, render: (row) => targetOnlyText(row.pentaCummulativeTargetPopulation) },
        { header: 'PENTA 1', render: (row) => formatCount(row.penta1_count) },
        { header: 'PENTA 3', render: (row) => formatCount(row.penta3_count) },
        { header: 'PENTA 1 COMMULATIVE', render: (row) => formatCount(row.penta1Cummulative) },
        { header: 'PENTA 3 COMMULATIVE', render: (row) => formatCount(row.penta3Cummulative) },
        { header: 'No. of Dropouts', render: (row) => formatCount(row.pentaDropoutCount) },
        { header: 'Dropout Rate (%)', render: (row) => formatPercent(row.pentaDropoutRate, 2) }
    ];

    const mcvColumns = [
        { header: 'Month', accessor: 'month' },
        { header: CUMMULATIVE_TARGET_LABEL, render: (row) => targetOnlyText(row.mcvCummulativeTargetPopulation) },
        { header: 'MCV1', render: (row) => formatCount(row.mcv1_count) },
        { header: 'MCV2', render: (row) => formatCount(row.mcv2_count) },
        { header: 'MCV1 COMMULATIVE', render: (row) => formatCount(row.mcv1Cummulative) },
        { header: 'MCV2 COMMULATIVE', render: (row) => formatCount(row.mcv2Cummulative) },
        { header: 'No. of Dropouts', render: (row) => formatCount(row.mcvDropoutCount) },
        { header: 'Dropout Rate (%)', render: (row) => formatPercent(row.mcvDropoutRate, 2) }
    ];

    const utilizationColumns = [
        { header: 'Month', accessor: 'month' },
        { header: CUMMULATIVE_TARGET_LABEL, render: (row) => targetOnlyText(row.utilizationCummulativeTargetPopulation) },
        { header: 'PENTA 1', render: (row) => formatCount(row.utilization_penta1_count) },
        { header: 'MCV2', render: (row) => formatCount(row.utilization_mcv2_count) },
        { header: 'PENTA 1 COMMULATIVE', render: (row) => formatCount(row.utilizationPenta1Cummulative) },
        { header: 'MCV2 COMMULATIVE', render: (row) => formatCount(row.utilizationMcv2Cummulative) },
        { header: 'No. of Dropouts', render: (row) => formatCount(row.utilizationDropoutCount) },
        { header: 'Dropout Rate (%)', render: (row) => formatPercent(row.utilizationDropoutRate, 2) }
    ];

    return (
        <div className="space-y-6">
            {missingTargets ? (
                <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-950">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Annual Targets Incomplete</p>
                        <p className="mt-1 text-sm font-semibold text-amber-950">
                            {targetStatus?.system_message || 'Configure barangay target denominators before using this monitoring view for official reporting.'}
                        </p>
                    </div>
                </div>
            ) : null}

            <ChartShell
                title="PENTA 1 to PENTA 3 Drop-out Rate"
                subtitle="Direct DOH row mapping for target population and PENTA commulative values."
            >
                <MonitoringLineChart data={rows}>
                    <Line yAxisId="count" type="linear" name={CUMMULATIVE_TARGET_LABEL} dataKey="pentaCummulativeTargetPopulation" stroke="#64748B" strokeWidth={2} dot={false} />
                    <Line yAxisId="count" type="linear" name="PENTA 1 COMMULATIVE" dataKey="penta1Cummulative" stroke="#047857" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="count" type="linear" name="PENTA 3 COMMULATIVE" dataKey="penta3Cummulative" stroke="#0F766E" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="rate" type="linear" name="PENTA Drop-out Rate" dataKey="pentaDropoutRate" stroke="#B91C1C" strokeWidth={2.5} dot={{ r: 2 }} />
                </MonitoringLineChart>
            </ChartShell>
            
            <DataCard title="PENTA MONITORING" columns={pentaColumns} data={tableData} />

            <ChartShell
                title="MCV 1 to MCV 2 Drop-out Rate"
                subtitle="Direct DOH row mapping for target population and MCV commulative values."
            >
                <MonitoringLineChart data={rows}>
                    <Line yAxisId="count" type="linear" name={CUMMULATIVE_TARGET_LABEL} dataKey="mcvCummulativeTargetPopulation" stroke="#64748B" strokeWidth={2} dot={false} />
                    <Line yAxisId="count" type="linear" name="MCV1 COMMULATIVE" dataKey="mcv1Cummulative" stroke="#047857" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="count" type="linear" name="MCV2 COMMULATIVE" dataKey="mcv2Cummulative" stroke="#0F766E" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="rate" type="linear" name="MCV Drop-out Rate" dataKey="mcvDropoutRate" stroke="#B91C1C" strokeWidth={2.5} dot={{ r: 2 }} />
                </MonitoringLineChart>
            </ChartShell>

            <DataCard title="MCV MONITORING" columns={mcvColumns} data={tableData} />

            <DataCard title="UTILIZATION" columns={utilizationColumns} data={tableData} />

            <ChartShell
                title="Utilization Monitoring"
                subtitle="Direct DOH row mapping for target population and utilization commulative values."
            >
                <MonitoringLineChart data={rows}>
                    <Line yAxisId="count" type="linear" name={CUMMULATIVE_TARGET_LABEL} dataKey="utilizationCummulativeTargetPopulation" stroke="#64748B" strokeWidth={2} dot={false} />
                    <Line yAxisId="count" type="linear" name="PENTA 1 COMMULATIVE" dataKey="utilizationPenta1Cummulative" stroke="#047857" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="count" type="linear" name="MCV2 COMMULATIVE" dataKey="utilizationMcv2Cummulative" stroke="#0F766E" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="rate" type="linear" name="Utilization Drop-out Rate" dataKey="utilizationDropoutRate" stroke="#B91C1C" strokeWidth={2.5} dot={{ r: 2 }} />
                </MonitoringLineChart>
            </ChartShell>
        </div>
    );
};

export default MonitoringCharts;
