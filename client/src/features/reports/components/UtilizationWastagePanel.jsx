import React from 'react';
import { AlertTriangle, Gauge, PackageCheck } from 'lucide-react';
import { formatCount, formatPercent } from './reportConfig';

const getLatestRow = (rows = [], month) => {
    if (!Array.isArray(rows) || rows.length === 0) return {};
    if (month) return rows.find((row) => Number(row.report_month) === Number(month)) || rows[rows.length - 1] || {};
    return rows[rows.length - 1] || {};
};

const MetricCell = ({ label, value, tone = 'slate' }) => {
    const valueClass = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-[#064E3B]' : 'text-slate-950';

    return (
        <div className="border-r border-slate-300 px-4 py-3 last:border-r-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${valueClass}`}>{value}</p>
        </div>
    );
};

const UtilizationWastagePanel = ({ report, month }) => {
    const row = getLatestRow(report?.rows || [], month);
    const utilizationRate = row?.utilization_cumulative_dropout_rate || row?.utilization_dropout_rate || 0;
    const utilizationGap = row?.utilization_cumulative_dropout_count || row?.utilization_dropout_count || 0;

    return (
        <section className="border border-slate-300 bg-white">
            <div className="flex flex-col gap-1 border-b border-slate-300 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Vaccine Utilization</p>
                <h3 className="text-lg font-black text-slate-950">Utilization and Wastage Control</h3>
                <p className="text-xs font-bold text-slate-500">
                    Monitoring view uses validated administered doses. Lot-level wastage ledger will attach when inventory tracking is enabled.
                </p>
            </div>
            <div className="grid border-b border-slate-300 md:grid-cols-4">
                <MetricCell label="PENTA 1 Cumulative" value={formatCount(row?.penta1_cumulative)} tone="green" />
                <MetricCell label="MCV 2 Cumulative" value={formatCount(row?.mcv2_cumulative)} tone="green" />
                <MetricCell label="Utilization Gap" value={formatCount(utilizationGap)} tone={utilizationGap > 0 ? 'red' : 'slate'} />
                <MetricCell label="Gap Rate" value={formatPercent(utilizationRate, 2)} tone={Number(utilizationRate) > 10 ? 'red' : 'slate'} />
            </div>
            <div className="grid gap-0 md:grid-cols-2">
                <div className="flex items-start gap-3 border-b border-slate-300 px-5 py-4 md:border-b-0 md:border-r">
                    <Gauge className="mt-0.5 h-4 w-4 text-[#064E3B]" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-700">Decision Signal</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                            Compare early-series uptake with late-series completion before releasing additional field stock.
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-3 px-5 py-4">
                    {Number(utilizationGap) > 0 ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-red-700" />
                    ) : (
                        <PackageCheck className="mt-0.5 h-4 w-4 text-[#064E3B]" />
                    )}
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-700">Wastage Status</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                            No vial-level wastage ledger is attached to this phase; do not infer wastage from utilization gaps alone.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default UtilizationWastagePanel;
