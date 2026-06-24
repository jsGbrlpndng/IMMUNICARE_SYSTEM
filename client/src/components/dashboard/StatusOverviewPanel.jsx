import React from 'react';
import {
    Activity,
    AlertOctagon,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    FileWarning
} from 'lucide-react';
import {
    CLINICAL_STATUS_CONFIG,
    CLINICAL_STATUS_ORDER
} from '../utils/clinicalStatus';

const ICONS = {
    activity: Activity,
    'alert-octagon': AlertOctagon,
    alert: AlertTriangle,
    check: CheckCircle2,
    clock: Clock3,
    'file-warning': FileWarning
};

export default function StatusOverviewPanel({ counts = {}, title = 'Status Monitoring', subtitle = 'Unified clinical status overview' }) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                {CLINICAL_STATUS_ORDER.map((statusCode) => {
                    const meta = CLINICAL_STATUS_CONFIG[statusCode];
                    const Icon = ICONS[meta.icon] || Activity;

                    return (
                        <div key={statusCode} className={`rounded-xl border p-4 ${meta.panelClassName}`}>
                            <div className="mb-3 flex items-center justify-between">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.iconToneClassName}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                            </div>
                            <div className="text-2xl font-black tabular-nums">{counts?.[statusCode] || 0}</div>
                            <div className="mt-1 text-xs font-bold">{meta.label}</div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
