import React from 'react';
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

const StatusBreakdownChart = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center bg-slate-50/50 rounded-xl animate-pulse">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading breakdown...</span>
            </div>
        );
    }

    const { fic_count, zero_dose, under_immunized } = data || {};
    const total = (fic_count || 0) + (zero_dose || 0) + (under_immunized || 0);

    if (total === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-bold text-slate-400">No records found</p>
            </div>
        );
    }

    const chartData = [
        { name: 'Fully Immunized (FIC)', value: fic_count, color: '#10b981' },
        { name: 'Under-immunized', value: under_immunized, color: '#f59e0b' },
        { name: 'Zero-dose', value: zero_dose, color: '#ef4444' }
    ].filter(d => d.value > 0);

    return (
        <div className="h-64 w-full min-w-0 relative">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '11px',
                            fontWeight: '600'
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <p className="text-xl font-black text-slate-800 leading-none">{total}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total</p>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
                {chartData.map((entry, index) => (
                    <div key={`legend-${index}`} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                        <span className="text-[11px] font-semibold text-slate-600">{entry.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StatusBreakdownChart;
