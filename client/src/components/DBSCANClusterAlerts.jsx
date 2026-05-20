import React, { useState, useEffect } from 'react';
import { MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react';
import apiClient from '../services/apiClient';

const DBSCANClusterAlerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAlerts = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await apiClient.get('/dashboard/dbscan-alerts');
                const data = await response.json();
                
                if (response.ok) {
                    setAlerts(data.alerts || []);
                } else {
                    setError('Waiting for spatial analysis data from server...');
                }
            } catch (err) {
                console.error('DBSCAN alerts fetch error:', err);
                setAlerts([]);
                setError(null); // Clear error to show empty state
            } finally {
                setLoading(false);
            }
        };

        fetchAlerts();
    }, []);

    const SkeletonLoader = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-white border border-slate-200 rounded-[4px] p-4 flex items-start gap-4">
                    <div className="bg-slate-100 rounded-full w-10 h-10 shrink-0"></div>
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-100 rounded w-1/2"></div>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="bg-white border border-slate-200 rounded-[4px] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                <div>
                    <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#2E7D32]" />
                        Follow-up Alerts
                    </h2>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Priority areas for outreach</p>
                </div>
            </div>
            
            <div className="p-6">
                {loading ? (
                    <SkeletonLoader />
                ) : error ? (
                    <div className="bg-red-50 border border-red-100 text-red-600 rounded-[4px] p-6 text-center text-xs font-bold uppercase tracking-widest flex flex-col items-center justify-center gap-2">
                        <AlertTriangle className="w-6 h-6" />
                        {typeof error === 'object' ? error.message || JSON.stringify(error) : String(error)}
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="bg-slate-50/50 border border-slate-100 rounded-[4px] p-8 text-center flex flex-col items-center justify-center gap-3">
                        <div className="p-3 bg-emerald-50 rounded-full border border-emerald-100">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </div>
                        <span className="text-sm font-bold text-slate-600 leading-relaxed">
                            No priority areas identified at this time.
                        </span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {alerts.map((alert, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 rounded-[4px] p-4 flex items-center gap-4 transition-all hover:border-[#2E7D32] hover:shadow-sm">
                                <div className="p-2 bg-red-50 rounded-full">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800 tracking-tight">
                                        {alert.defaulterCount} Infants in {alert.locality} are currently overdue
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Neighborhood Priority Alert</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DBSCANClusterAlerts;
