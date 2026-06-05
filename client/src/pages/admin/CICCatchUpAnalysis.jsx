import React, { useState, useEffect } from 'react';
import { 
    FileBarChart, 
    Calendar, 
    User, 
    MapPin, 
    ShieldCheck, 
    ChevronRight,
    ArrowUpRight,
    Info,
    Search,
    Loader2
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { formatFullNameFromObject } from '../../utils/formatFullName';

const CICCatchUpAnalysis = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await apiClient.get('/reports/cic-catchup');
                if (res.ok) {
                    const json = await res.json();
                    setData(json.data || []);
                } else {
                    setError('Failed to fetch CIC catch-up data.');
                }
            } catch (err) {
                setError('Network error connecting to system.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredData = data.filter(item => 
        formatFullNameFromObject(item).toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.barangay.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 text-[#065f46] animate-spin mb-4" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Generating Analysis...</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center border border-emerald-100">
                            <ShieldCheck className="w-8 h-8 text-[#065f46]" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
                                CIC Catch-Up Analysis
                            </h1>
                            <p className="text-sm font-bold text-slate-400 tracking-wide">
                                Completely Immunized Child (CIC) Post-12 Month Metrics
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-blue-50 text-blue-800 px-4 py-2 rounded-xl border border-blue-100">
                        <Info className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Local Campaign Effectiveness Monitor</span>
                    </div>
                </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Target Population</span>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-black text-slate-800">{new Set(data.map(i => i.id)).size}</span>
                        <span className="text-xs font-bold text-slate-400 mb-1.5 uppercase">Infants (CIC)</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Catch-up Doses</span>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-black text-[#065f46]">{data.length}</span>
                        <span className="text-xs font-bold text-slate-400 mb-1.5 uppercase">Administered</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Reporting Status</span>
                    <div className="flex items-center gap-2 mt-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Live Clinical Feed</span>
                    </div>
                </div>
            </div>

            {/* Filter & Table Section */}
            <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Filter by Name or Barangay..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#065f46] transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Displaying {filteredData.length} entries</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Infant Details</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Barangay</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vaccine Administered</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timing (Age)</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredData.length > 0 ? filteredData.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 group-hover:bg-[#065f46] group-hover:text-white transition-all">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-black text-slate-800 uppercase tracking-tight">
                                                    {formatFullNameFromObject(row)}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase">
                                                    DOB: {new Date(row.dob).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-xs font-black text-slate-600 uppercase tracking-wide">{row.barangay}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="inline-flex items-center gap-2 bg-emerald-50 text-[#065f46] px-3 py-1 rounded-lg border border-emerald-100">
                                            <span className="text-[10px] font-black uppercase tracking-widest">{row.vaccine_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-amber-600 uppercase">{row.age_at_vaccination_months} Months</span>
                                            <ArrowUpRight className="w-3 h-3 text-amber-400" />
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-black text-slate-800">
                                                {new Date(row.administered_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Validated Completion</span>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5" className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <FileBarChart className="w-8 h-8 text-slate-200" />
                                            </div>
                                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">No Catch-up Data Detected</h3>
                                            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tighter">Currently, all CIC records turn 12 months with completed schedules.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CICCatchUpAnalysis;
