import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

const FeedbackContext = createContext(null);

export const FeedbackProvider = ({ children }) => {
    const [toast, setToast] = useState(null); // { message: string, type: 'success'|'error'|'warning'|'info' }
    const [confirmState, setConfirmState] = useState(null); // { isOpen: boolean, title: string, message: string, onConfirm: () => void, onCancel?: () => void }

    // Auto-dismiss toast
    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => {
            setToast(null);
        }, 4000);
        return () => clearTimeout(timer);
    }, [toast]);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
    }, []);

    const dismissToast = useCallback(() => {
        setToast(null);
    }, []);

    const showConfirm = useCallback(({ title, message, onConfirm, onCancel }) => {
        setConfirmState({
            isOpen: true,
            title,
            message,
            onConfirm: () => {
                onConfirm?.();
                setConfirmState(null);
            },
            onCancel: () => {
                onCancel?.();
                setConfirmState(null);
            }
        });
    }, []);

    // Accessibility: Manage focus in modal
    const modalRef = useRef(null);
    useEffect(() => {
        if (confirmState?.isOpen && modalRef.current) {
            const focusable = modalRef.current.querySelectorAll('button');
            if (focusable.length > 0) {
                // Focus on Confirm (last element or primary button)
                focusable[focusable.length - 1]?.focus();
            }
        }
    }, [confirmState?.isOpen]);

    const getToastIcon = (type) => {
        switch (type) {
            case 'success':
                return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
            case 'error':
                return <AlertOctagon className="h-4 w-4 shrink-0 text-rose-400" />;
            case 'warning':
                return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />;
            case 'info':
            default:
                return <Info className="h-4 w-4 shrink-0 text-sky-400" />;
        }
    };

    const getToastBorderClass = (type) => {
        switch (type) {
            case 'error':
                return 'border-rose-900/60 bg-slate-950 text-white';
            case 'warning':
                return 'border-amber-900/60 bg-slate-950 text-white';
            case 'info':
                return 'border-sky-900/60 bg-slate-950 text-white';
            case 'success':
            default:
                return 'border-emerald-950/60 bg-slate-950 text-white';
        }
    };

    return (
        <FeedbackContext.Provider value={{ showToast, showConfirm }}>
            {children}

            {/* Toast Element */}
            {toast && (
                <div 
                    role="status"
                    aria-live="polite"
                    className="fixed right-6 top-6 z-[100] animate-in fade-in slide-in-from-top-3 duration-300"
                >
                    <div className={`flex max-w-sm items-center gap-3 border px-5 py-3 shadow-2xl rounded-none ${getToastBorderClass(toast.type)}`}>
                        {getToastIcon(toast.type)}
                        <span className="text-sm font-bold">{toast.message}</span>
                        <button 
                            type="button" 
                            onClick={dismissToast} 
                            className="ml-3 border border-slate-800 p-1 text-slate-400 hover:bg-slate-900 hover:text-white"
                            aria-label="Dismiss notification"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmState?.isOpen && (
                <div 
                    className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]"
                    onClick={confirmState.onCancel}
                >
                    <div 
                        ref={modalRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="confirm-dialog-title"
                        className="w-full max-w-md border border-slate-200 bg-white shadow-2xl rounded-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h3 id="confirm-dialog-title" className="text-sm font-black uppercase tracking-wider text-slate-900">
                                    {confirmState.title}
                                </h3>
                            </div>
                            <button 
                                type="button" 
                                onClick={confirmState.onCancel} 
                                className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                                aria-label="Close modal"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="px-5 py-5">
                            <p className="text-xs font-semibold leading-5 text-slate-600">
                                {confirmState.message}
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                            <button 
                                type="button" 
                                onClick={confirmState.onCancel} 
                                className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                onClick={confirmState.onConfirm}
                                className="inline-flex items-center justify-center gap-2 bg-[#084C39] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-[#07362A]"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </FeedbackContext.Provider>
    );
};

export const useFeedback = () => {
    const context = useContext(FeedbackContext);
    if (!context) {
        return {
            showToast: (message, type = 'success') => {
                console.warn(`[useFeedback Fallback] showToast:`, message, type);
            },
            showConfirm: ({ title, message, onConfirm }) => {
                console.warn(`[useFeedback Fallback] showConfirm:`, title, message);
                onConfirm?.();
            }
        };
    }
    return context;
};
