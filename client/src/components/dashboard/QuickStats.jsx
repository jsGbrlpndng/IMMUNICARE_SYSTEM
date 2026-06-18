import React from 'react';
import { CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

/**
 * QuickStats - Quick statistics widget
 * Shows key metrics for the day
 */

const QuickStats = ({ stats, loading }) => {
    // Use props instead of fetching internally
    const safeStats = stats || {
        vaccinatedToday: 0,
        deferredToday: 0,
        overridesUsed: 0,
        pending: 0
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-12 bg-slate-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const metrics = [
        {
            label: 'Vaccinated Today',
            value: safeStats.vaccinatedToday,
            icon: CheckCircle,
            color: 'emerald'
        },
        {
            label: 'Deferred Today',
            value: safeStats.deferredToday,
            icon: Clock,
            color: 'amber'
        },
        {
            label: 'Overrides Used',
            value: safeStats.overridesUsed,
            icon: AlertTriangle,
            color: 'red'
        },
        {
            label: 'Pending',
            value: safeStats.pending,
            icon: TrendingUp,
            color: 'blue'
        }
    ];

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Statistics</h3>
            
            <div className="space-y-3">
                {metrics.map((metric, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                            <div className={`w-10 h-10 bg-${metric.color}-100 rounded-lg flex items-center justify-center`}>
                                <metric.icon className={`w-5 h-5 text-${metric.color}-600`} />
                            </div>
                            <div>
                                <div className="text-sm text-slate-600">{metric.label}</div>
                                <div className="text-xl font-bold text-slate-900">{metric.value}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default QuickStats;
