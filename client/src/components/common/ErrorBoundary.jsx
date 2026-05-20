import React from 'react';
import { RefreshCcw, ShieldAlert } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("[CRITICAL UI ERROR]:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[300px] p-10 bg-rose-50 border-2 border-rose-100 rounded-[2rem] text-center animate-in fade-in zoom-in-95 duration-500">
                    <div className="w-20 h-20 bg-rose-600 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-rose-200">
                        <ShieldAlert className="text-white" size={40} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Module Failed to Load</h2>
                    <p className="text-slate-500 font-medium mb-10 max-w-sm leading-relaxed">
                        A critical interface error occurred in this section. Please refresh the page or contact the system administrator.
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95"
                    >
                        <RefreshCcw size={16} />
                        Refresh Interface
                    </button>
                    {process.env.NODE_ENV === 'development' && (
                        <pre className="mt-8 p-4 bg-slate-800 text-rose-300 text-[10px] text-left overflow-auto max-w-full rounded-xl font-mono">
                            {this.state.error?.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
