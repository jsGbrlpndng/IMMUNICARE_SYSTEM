import React from 'react';
import {
    Activity,
    AlertOctagon,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    FileWarning
} from 'lucide-react';
import { getClinicalStatusMeta } from '../utils/clinicalStatus';

const ICONS = {
    activity: Activity,
    'alert-octagon': AlertOctagon,
    alert: AlertTriangle,
    check: CheckCircle2,
    clock: Clock3,
    'file-warning': FileWarning
};

export default function StatusBadge({ status, record, emphasize = false, className = '' }) {
    const meta = getClinicalStatusMeta(record || status);
    const Icon = ICONS[meta.icon] || Activity;
    const toneClassName = emphasize ? meta.emphasisBadgeClassName : meta.badgeClassName;

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${toneClassName} ${className}`.trim()}>
            <Icon className="h-3 w-3" />
            {meta.label}
        </span>
    );
}
