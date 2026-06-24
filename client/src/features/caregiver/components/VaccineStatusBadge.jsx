import React from 'react';
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';

const STATUS_META = {
    Completed: {
        icon: CheckCircle2,
        className: 'border-[#D1E7DD] bg-[#D1E7DD] text-[#0F5132]'
    },
    'Due Soon': {
        icon: Clock3,
        className: 'border-[#FFF3CD] bg-[#FFF3CD] text-amber-900'
    },
    Overdue: {
        icon: AlertTriangle,
        className: 'border-[#F8D7DA] bg-[#F8D7DA] text-red-900'
    },
    'Pending Validation': {
        icon: ShieldAlert,
        className: 'border-blue-200 bg-blue-50 text-blue-800'
    },
    'Not Yet Due': {
        icon: Clock3,
        className: 'border-slate-200 bg-slate-100 text-[#6C757D]'
    }
};

const VaccineStatusBadge = ({ status }) => {
    const meta = STATUS_META[status] || STATUS_META['Not Yet Due'];
    const Icon = meta.icon;

    return (
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-black leading-none ${meta.className}`}>
            <Icon className="h-3 w-3" />
            {status || 'Not Yet Due'}
        </span>
    );
};

export default VaccineStatusBadge;
