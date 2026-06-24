import { formatAuditAction, formatAuditTarget } from '../../../utils/auditFormatter';

export const safeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatTimestamp = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'No timestamp available';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit'
    });
};

export const formatAuditTime = (value) => {
    if (!value) return 'No timestamp';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No timestamp';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

export const formatAuditSentence = (event) => {
    const actor = event?.user_name || 'A staff member';
    const action = formatAuditAction(event?.action_type || event?.action);
    const target = formatAuditTarget(event);
    return `${actor}: ${action}${target ? ` (${target})` : ''}.`;
};

export const isEnterOrSpace = (event) => event.key === 'Enter' || event.key === ' ';

export const getRankingStatusClassName = (status = '') => {
    if (status === 'On Track') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'Monitor') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (status === 'Target Missing') return 'border-slate-200 bg-slate-100 text-slate-600';
    return 'border-rose-200 bg-rose-50 text-rose-800';
};

export const toMapFloat = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};
