import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';

const TimelinessTrendChart = ({ data, loading }) => {
    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center bg-slate-50/50 rounded-xl animate-pulse">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading trends...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-bold text-slate-400">Trend data unavailable</p>
                <p className="text-[10px] text-slate-300 mt-1 uppercase tracking-tighter">Awaiting historical logs</p>
            </div>
        );
    }

    return (
        <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={data}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '11px',
                            fontWeight: '600'
                        }}
                    />
                    <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        iconSize={6}
                        height={36}
                        formatter={(value) => <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{value.replace('_', ' ')}</span>}
                    />
                    <Line
                        type="monotone"
                        dataKey="on_time"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="delayed"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: '#f59e0b' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="missed"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#ef4444' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TimelinessTrendChart;
