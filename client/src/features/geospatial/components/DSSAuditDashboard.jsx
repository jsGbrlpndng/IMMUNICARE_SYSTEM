import React from 'react';
import { useState, useEffect } from 'react';
import { Settings, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import apiClient from '../../services/apiClient';

const DSSAuditDashboard = () => {
    const [auditData, setAuditData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAuditData = async () => {
            try {
                const res = await apiClient.get('/dashboard/dbscan-audit');
                const data = await res.json();
                if (data.success) {
                    setAuditData(data.data);
                } else {
                    throw new Error('Failed to fetch audit data');
                }
            } catch (err) {
                console.error('DSS Audit Fetch Error:', err);
                setAuditData([]);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchAuditData();
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col items-center justify-center min-h-[300px]">
                <Loader2 className="animate-spin text-green-600 mb-3" size={32} />
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Loading...</p>
            </div>
        );
    }

    // Determine if any parameter combination produced meaningful clusters
    const hasMeaningfulClusters = auditData && auditData.length > 0 && auditData.some(row => row.num_clusters > 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <Settings className="text-slate-400" size={20} />
                        Spatial Summary
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        {hasMeaningfulClusters
                            ? 'Parameter sweep results for spatial clustering configuration.'
                            : 'No high-risk clusters detected.'}
                    </p>
                </div>
            </div>

            {hasMeaningfulClusters ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Epsilon (Radius)</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min Samples</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clusters Formed</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Noise Ratio</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Silhouette Score</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {auditData.map((row, idx) => {
                                const isRecommended = row.is_recommended && row.num_clusters > 0;
                                const isStable = row.is_stable;
                                
                                const rowClass = isRecommended 
                                    ? 'bg-emerald-50 hover:bg-emerald-100/70 transition-colors' 
                                    : 'hover:bg-slate-50 transition-colors';

                                return (
                                    <tr key={idx} className={rowClass}>
                                        <td className="py-3 px-4">
                                            <span className="font-semibold text-slate-700 text-sm">{row.epsilon_meters}m</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="font-medium text-slate-600 text-sm">{row.min_samples}</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="font-bold text-slate-800 text-sm">{row.num_clusters}</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`text-sm font-medium ${row.noise_percentage > 50 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                {row.noise_percentage.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-sm font-medium text-slate-600">
                                                {row.silhouette_score.toFixed(3)}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {isRecommended ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-widest border border-emerald-200">
                                                    <ShieldCheck size={12} />
                                                    Recommended
                                                </span>
                                            ) : isStable ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                                                    Stable
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-widest border border-amber-100">
                                                    <AlertTriangle size={10} />
                                                    Brittle
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="px-6 py-8 text-center">
                    <p className="text-sm text-slate-500">
                        No meaningful spatial grouping is available yet. Cluster results will appear once more location-based records are registered.
                    </p>
                </div>
            )}
        </div>
    );
};

export default DSSAuditDashboard;
