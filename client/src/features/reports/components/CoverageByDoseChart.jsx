import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';

const CoverageByDoseChart = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center bg-slate-50/50 rounded-xl animate-pulse">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading coverage data...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-bold text-slate-400">No data yet</p>
                <p className="text-[10px] text-slate-300 mt-1 uppercase tracking-tighter">Registered records required</p>
            </div>
        );
    }

    // Colors based on coverage percentage
    const getBarColor = (percentage) => {
        if (percentage >= 80) return '#10b981'; // emerald-500
        if (percentage >= 50) return '#f59e0b'; // amber-500
        return '#ef4444'; // red-500
    };

    return (
        <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="vaccine_code"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '8px 12px'
                        }}
                        cursor={{ fill: '#f8fafc' }}
                        formatter={(value) => [`${value}%`, 'Coverage']}
                    />
                    <Bar
                        dataKey="percentage"
                        radius={[4, 4, 0, 0]}
                        barSize={32}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.percentage)} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default CoverageByDoseChart;
