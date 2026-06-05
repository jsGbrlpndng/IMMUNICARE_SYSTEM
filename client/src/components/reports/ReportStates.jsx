import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export const LoadingState = ({ label = 'Loading report' }) => (
    <div className="flex h-72 items-center justify-center border border-slate-300 bg-white">
        <div className="text-center">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-[#064E3B]" />
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
        </div>
    </div>
);

export const ErrorState = ({ message, onRetry }) => (
    <div className="flex h-72 items-center justify-center border border-rose-300 bg-rose-50 px-6 text-center">
        <div>
            <AlertTriangle className="mx-auto h-9 w-9 text-rose-700" />
            <p className="mt-3 text-base font-black text-rose-950">Could not load report</p>
            <p className="mt-1 max-w-xl text-sm font-semibold text-rose-700">{message || 'The report request failed.'}</p>
            {onRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-5 inline-flex h-9 items-center gap-2 border border-rose-300 bg-white px-4 text-xs font-black uppercase tracking-wider text-rose-800"
                >
                    <RefreshCw className="h-4 w-4" /> Retry
                </button>
            ) : null}
        </div>
    </div>
);

export const DataQualityBanner = ({ count = 0 }) => {
    if (!count) return null;
    return (
        <div className="border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-950">
            {count.toLocaleString()} validated dose{count === 1 ? '' : 's'} are missing report classification and were excluded from ORI, Catch-up, and routine age-bucket columns.
        </div>
    );
};
