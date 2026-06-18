import { AlertTriangle } from 'lucide-react';

export const ErrorNotice = ({ message }) => message ? (
    <div role="alert" className="flex items-start gap-2 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
    </div>
) : null;
