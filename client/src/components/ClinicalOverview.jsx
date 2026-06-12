import React from 'react';
import StatusOverviewPanel from './StatusOverviewPanel';

const emptyCounts = {
    FULLY_IMMUNIZED: 0,
    UP_TO_DATE: 0,
    DUE_SOON: 0,
    OVERDUE: 0,
    DEFAULTED: 0,
    INCOMPLETE: 0
};

const ClinicalOverview = ({ statusCounts, loading }) => {
    if (loading) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 w-48 rounded bg-slate-200" />
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="h-28 rounded-xl bg-slate-100" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <StatusOverviewPanel
            counts={{ ...emptyCounts, ...(statusCounts || {}) }}
            title="Immunization Statuses Overview"
            subtitle="Exact QA-aligned categories shared across the infant list and dashboard."
        />
    );
};

export default ClinicalOverview;
