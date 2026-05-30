import React from 'react';
import { AlertTriangle, CheckCircle, Clock, TrendingUp, Users } from 'lucide-react';

/**
 * ClinicalOverview - Daily clinical overview widget
 * Shows what requires attention now
 */

const ClinicalOverview = ({ stats, loading }) => {
    // Use props instead of fetching internally
    const overview = {
        dueToday: stats?.pending || 0,
        overdue: 0, // Would be calculated from schedule data
        pending: stats?.pending || 0,
        recentSubmissions: 0, // Would come from recent submissions
        alerts: 0
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-20 bg-slate-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const statsDisplay = [
        {
            label: 'Due Today',
            value: overview.dueToday,
            icon: Clock,
            color: 'blue',
            bgColor: 'bg-blue-100',
            textColor: 'text-blue-600'
        },
        {
            label: 'Overdue',
            value: overview.overdue,
            icon: AlertTriangle,
            color: 'red',
            bgColor: 'bg-red-100',
            textColor: 'text-red-600'
        },
        {
            label: 'Pending',
            value: overview.pending,
            icon: Users,
            color: 'amber',
            bgColor: 'bg-amber-100',
            textColor: 'text-amber-600'
        },
        {
            label: 'Recent',
            value: overview.recentSubmissions,
            icon: TrendingUp,
            color: 'emerald',
            bgColor: 'bg-emerald-100',
            textColor: 'text-emerald-600'
        }
    ];

    return (
        <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl p-6 shadow-sm border border-blue-100">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Daily Clinical Overview</h3>
                <span className="text-xs text-slate-500">
                    {new Date().toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                    })}
                </span>
            </div>

            {overview.dueToday === 0 && overview.overdue === 0 && overview.pending === 0 ? (
                <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mb-3">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                    </div>
                    <p className="text-slate-600 font-medium">All caught up! No pending items.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {statsDisplay.map((stat, index) => (
                        <div key={index} className="bg-white rounded-lg p-4 border border-slate-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className={`w-10 h-10 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                                    <stat.icon className={`w-5 h-5 ${stat.textColor}`} />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-slate-900 mb-1">{stat.value}</div>
                            <div className="text-xs text-slate-600 font-medium">{stat.label}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClinicalOverview;
