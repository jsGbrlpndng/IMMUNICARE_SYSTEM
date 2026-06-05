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

const normalizeRows = (rows = []) => rows.map((row) => ({
    month: row?.month_label || row?.report_month || '',
    target: Number(row?.cumulative_target_population || 0),
    monthlyTarget: Number(row?.monthly_target || 0),
    eligiblePopulation011: Number(row?.eligible_population_0_11_months || row?.eligible_population || 0),
    eligiblePopulation012: Number(row?.eligible_population_0_12_months || 0),
    penta1: Number(row?.penta1_cumulative || 0),
    penta3: Number(row?.penta3_cumulative || 0),
    pentaDropoutRate: Number(row?.dropout_rate || 0),
    mcv1: Number(row?.mcv1_cumulative || 0),
    mcv2: Number(row?.mcv2_cumulative || 0),
    mcvDropoutRate: Number(row?.mcv_dropout_rate || 0),
    
    // Additional fields for FHSIS Data Cards
    penta1_count: Number(row?.penta1_count || 0),
    penta3_count: Number(row?.penta3_count || 0),
    pentaDropoutCount: Number(row?.dropout_count || 0),
    
    mcv1_count: Number(row?.mcv1_count || 0),
    mcv2_count: Number(row?.mcv2_count || 0),
    mcvDropoutCount: Number(row?.mcv_dropout_count || 0),

    utilizationDropoutCount: Number(row?.utilization_cumulative_dropout_count || 0),
    utilizationDropoutRate: Number(row?.utilization_cumulative_dropout_rate || 0)
}));

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
        { header: 'Cumulative Target Population', render: (row) => formatCount(row.target) },
        { header: 'PENTA 1', render: (row) => formatCount(row.penta1_count) },
        { header: 'PENTA 3', render: (row) => formatCount(row.penta3_count) },
        { header: 'PENTA 1 Cumulative', render: (row) => formatCount(row.penta1) },
        { header: 'PENTA 3 Cumulative', render: (row) => formatCount(row.penta3) },
        { header: 'No. of Dropouts', render: (row) => formatCount(row.pentaDropoutCount) },
        { header: 'Dropout Rate (%)', render: (row) => formatPercent(row.pentaDropoutRate, 2) }
    ];

    const mcvColumns = [
        { header: 'Month', accessor: 'month' },
        { header: 'Cumulative Target Population', render: (row) => formatCount(row.target) },
        { header: 'MCV1', render: (row) => formatCount(row.mcv1_count) },
        { header: 'MCV2', render: (row) => formatCount(row.mcv2_count) },
        { header: 'MCV1 Cumulative', render: (row) => formatCount(row.mcv1) },
        { header: 'MCV2 Cumulative', render: (row) => formatCount(row.mcv2) },
        { header: 'No. of Dropouts', render: (row) => formatCount(row.mcvDropoutCount) },
        { header: 'Dropout Rate (%)', render: (row) => formatPercent(row.mcvDropoutRate, 2) }
    ];

    const utilizationColumns = [
        { header: 'Month', accessor: 'month' },
        { header: 'Cumulative Target Population', render: (row) => formatCount(row.target) },
        { header: 'PENTA 1', render: (row) => formatCount(row.penta1_count) },
        { header: 'MCV2', render: (row) => formatCount(row.mcv2_count) },
        { header: 'PENTA 1 Cumulative', render: (row) => formatCount(row.penta1) },
        { header: 'MCV2 Cumulative', render: (row) => formatCount(row.mcv2) },
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
                subtitle="Cumulative target population, cumulative PENTA doses, and drop-out rate."
            >
                <MonitoringLineChart data={rows}>
                    <Line yAxisId="count" type="linear" name="Cumulative Target" dataKey="target" stroke="#64748B" strokeWidth={2} dot={false} />
                    <Line yAxisId="count" type="linear" name="PENTA 1 Cumulative" dataKey="penta1" stroke="#047857" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="count" type="linear" name="PENTA 3 Cumulative" dataKey="penta3" stroke="#0F766E" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="rate" type="linear" name="PENTA Drop-out Rate" dataKey="pentaDropoutRate" stroke="#B91C1C" strokeWidth={2.5} dot={{ r: 2 }} />
                </MonitoringLineChart>
            </ChartShell>
            
            <DataCard title="PENTA MONITORING" columns={pentaColumns} data={tableData} />

            <ChartShell
                title="MCV 1 to MCV 2 Drop-out Rate"
                subtitle="Cumulative target population, cumulative MCV doses, and drop-out rate."
            >
                <MonitoringLineChart data={rows}>
                    <Line yAxisId="count" type="linear" name="Cumulative Target" dataKey="target" stroke="#64748B" strokeWidth={2} dot={false} />
                    <Line yAxisId="count" type="linear" name="MCV 1 Cumulative" dataKey="mcv1" stroke="#047857" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="count" type="linear" name="MCV 2 Cumulative" dataKey="mcv2" stroke="#0F766E" strokeWidth={3} dot={{ r: 2 }} />
                    <Line yAxisId="rate" type="linear" name="MCV Drop-out Rate" dataKey="mcvDropoutRate" stroke="#B91C1C" strokeWidth={2.5} dot={{ r: 2 }} />
                </MonitoringLineChart>
            </ChartShell>

            <DataCard title="MCV MONITORING" columns={mcvColumns} data={tableData} />

            <DataCard title="UTILIZATION" columns={utilizationColumns} data={tableData} />
        </div>
    );
};

export default MonitoringCharts;
