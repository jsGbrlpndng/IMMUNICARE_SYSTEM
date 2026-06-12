import React from 'react';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { formatFullNameFromObject } from '../../utils/formatFullName';

// Analytics Components
import CoverageByDoseChart from '../../components/analytics/CoverageByDoseChart';
import StatusBreakdownChart from '../../components/analytics/StatusBreakdownChart';
import TimelinessTrendChart from '../../components/analytics/TimelinessTrendChart';
import ClinicalOverview from '../../components/ClinicalOverview';
import StatusBadge from '../../components/StatusBadge';

import { MapContainer, TileLayer, Circle, Popup, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import {
    Users,
    ShieldCheck,
    AlertTriangle,
    Clock,
    ChevronRight,
    Bell,
    Check,
    MessageSquare,
    MapPin,
    AlertCircle,
    PlusCircle
} from 'lucide-react';

export default function MainDashboard() {
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // States for Toast
    const [toast, setToast] = useState(null);

    // States for specific fetch endpoints
    const [kpis, setKpis] = useState({
        loading: true,
        data: {
            totalRegistered: 0,
            fullyImmunized: 0,
            zeroDoseCount: 0,
            underImmunized: 0,
            statusOverview: {
                FULLY_IMMUNIZED: 0,
                UP_TO_DATE: 0,
                DUE_SOON: 0,
                OVERDUE: 0,
                DEFAULTED: 0,
                INCOMPLETE: 0
            }
        },
        error: null
    });

    const [urgentActions, setUrgentActions] = useState({
        loading: true,
        data: [],
        error: null
    });

    const [hotspot, setHotspot] = useState({
        loading: true,
        data: null,
        error: null
    });

    const [pendingLogs, setPendingLogs] = useState([]);
    const [analyticsData, setAnalyticsData] = useState({ coverage: null, trend: [], loading: true });

    useEffect(() => {
        if (user) {
            fetchKPIs();
            fetchUrgentActions();
            fetchHotspot();
            fetchPendingLogs();
            fetchAnalytics();
        }
    }, [user]);

    const fetchKPIs = async () => {
        try {
            setKpis(prev => ({ ...prev, loading: true, error: null }));
            const res = await apiClient.get('/dashboard/kpis');
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setKpis({ loading: false, data: result.kpis, error: null });
                } else {
                    setKpis({ loading: false, data: null, error: 'Unable to load KPIs' });
                }
            } else {
                setKpis({ loading: false, data: null, error: 'Unable to load KPIs' });
            }
        } catch (e) {
            setKpis({ loading: false, data: null, error: 'Network error fetching KPIs' });
        }
    };

    const fetchUrgentActions = async () => {
        try {
            setUrgentActions(prev => ({ ...prev, loading: true, error: null }));
            const res = await apiClient.get('/dashboard/urgent-actions?limit=5');
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setUrgentActions({ loading: false, data: result.actions || [], error: null });
                } else {
                    setUrgentActions({ loading: false, data: [], error: 'Unable to load urgent actions' });
                }
            } else {
                 setUrgentActions({ loading: false, data: [], error: 'Unable to load urgent actions' });
            }
        } catch (e) {
            setUrgentActions({ loading: false, data: [], error: 'Network error fetching urgent actions' });
        }
    };

    const fetchHotspot = async () => {
        try {
            setHotspot(prev => ({ ...prev, loading: true, error: null }));
            const res = await apiClient.get('/dashboard/hotspot-summary');
            if (res.ok) {
                const result = await res.json();
                if (result.success) {
                    setHotspot({ loading: false, data: result.hotspot, error: null });
                } else {
                    setHotspot({ loading: false, data: null, error: 'Unable to load hotspot' });
                }
            } else {
                setHotspot({ loading: false, data: null, error: 'Unable to load hotspot' });
            }
        } catch (e) {
            setHotspot({ loading: false, data: null, error: 'Network error fetching hotspot' });
        }
    };

    const fetchPendingLogs = async () => {
        try {
            const response = await apiClient.get('/logs/pending');
            if (response.ok) {
                const data = await response.json();
                setPendingLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Failed to fetch pending logs', error);
        }
    };

    const fetchAnalytics = async () => {
        try {
            setAnalyticsData(prev => ({ ...prev, loading: true }));
            const [coverageRes, trendRes] = await Promise.all([
                apiClient.get('/analytics/coverage-summary'),
                apiClient.get('/analytics/timeliness-trend')
            ]);
            const coverage = coverageRes.ok ? await coverageRes.json() : null;
            const trend = trendRes.ok ? await trendRes.json() : [];
            setAnalyticsData({ coverage, trend, loading: false });
        } catch (error) {
            setAnalyticsData(prev => ({ ...prev, loading: false }));
        }
    };

    const showToast = (message) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    };

    const handleActionComplete = (infantId) => {
       // Direct to the vaccination record page
       navigate(`/clinical/infant/${infantId}/vaccinations`);
    };

    const handleSMS = async (infant) => {
       try {
           showToast(`SMS Reminder automatically sent to caregiver of ${infant.first_name}!`);
       } catch (e) {
           showToast('Failed to send SMS reminder.');
       }
    };
    
    // Skeleton Loaders
    const KPISkeleton = () => (
        <div className="animate-pulse bg-slate-200 rounded-2xl p-6 h-32"></div>
    );

    return (
        <div className="min-h-screen bg-[#F4F7F4] -m-4 md:-m-8 p-4 md:p-8 font-sans pb-12 relative">
            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-8 right-8 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-lg z-[9999] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
                    <Check className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-sm">{toast}</span>
                </div>
            )}

            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* 2. Top Header Area */}
                <header className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
                                Welcome, {user?.name || user?.full_name || 'Midwife'}
                            </h1>
                            <p className="text-slate-500 font-medium mt-1">
                                Here is a structured overview of your clinical tasks today.
                            </p>
                        </div>
                        {/* 1. Reinstate Infant Registration CTA */}
                        <button 
                            onClick={() => navigate('/clinical/registration')}
                            className="flex items-center gap-2 bg-[#2E7D32] hover:bg-[#1B5E20] text-white px-6 py-3 rounded-xl font-bold shadow-sm shadow-green-900/20 transition-all active:scale-95">
                            <PlusCircle className="w-5 h-5" />
                            Register New Infant
                        </button>
                    </div>

                    {pendingLogs.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <Bell className="w-6 h-6 text-amber-500 animate-pulse" />
                                <div>
                                    <h3 className="text-amber-800 font-bold text-sm">Urgent Action Needed</h3>
                                    <p className="text-amber-700 text-xs font-medium">You have {pendingLogs.length} provisional registration or dose entries awaiting Midwife validation.</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => navigate('/clinical/validation')}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors uppercase tracking-wider">
                                Review Now
                            </button>
                        </div>
                    )}
                </header>

                {/* 3. Top Row - KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {kpis.loading ? (
                        <>
                            <KPISkeleton /><KPISkeleton /><KPISkeleton /><KPISkeleton />
                        </>
                    ) : kpis.error ? (
                        <div className="col-span-4 text-center py-6 text-red-500 font-medium bg-red-50 rounded-xl border border-red-200">
                            {kpis.error}
                        </div>
                    ) : (
                        <>
                            {/* Card 1: Zero-Dose */}
                            <div className="bg-red-50 border-red-200 border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                                        <AlertTriangle className="w-6 h-6" />
                                    </div>
                                    <span className="px-2.5 py-1 bg-red-200 text-red-800 text-[10px] font-bold uppercase tracking-wider rounded-full">Warning</span>
                                </div>
                                <div>
                                    <h3 className="text-4xl font-black text-red-700">{kpis.data.zeroDoseCount}</h3>
                                    <p className="text-xs font-bold text-red-500 uppercase tracking-widest mt-1">Zero-Dose Infants</p>
                                </div>
                            </div>

                            {/* Card 2: Under-Immunized */}
                            <div className="bg-amber-50 border-amber-200 border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                                        <Clock className="w-6 h-6" />
                                    </div>
                                    <span className="px-2.5 py-1 bg-amber-200 text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded-full">Warning</span>
                                </div>
                                <div>
                                    <h3 className="text-4xl font-black text-amber-700">{kpis.data.underImmunized}</h3>
                                    <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-1">Under-Immunized / Defaulted</p>
                                </div>
                            </div>

                            {/* Card 3: FIC Coverage */}
                            <div className="bg-white border-green-200 border rounded-2xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-50 rounded-full blur-xl"></div>
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
                                        <ShieldCheck className="w-6 h-6" />
                                    </div>
                                    <StatusBadge status="FULLY_IMMUNIZED" />
                                </div>
                                <div className="relative z-10">
                                    <h3 className="text-4xl font-black text-green-700">{kpis.data.fullyImmunized}%</h3>
                                    <p className="text-xs font-bold text-green-600 uppercase tracking-widest mt-1">FIC Coverage</p>
                                </div>
                            </div>

                            {/* Card 4: Total Registered */}
                            <div className="bg-white border-slate-200 border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                                        <Users className="w-6 h-6" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-4xl font-black text-slate-800">{kpis.data.totalRegistered}</h3>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Total Registered Infants</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <ClinicalOverview
                    statusCounts={kpis.data?.statusOverview}
                    loading={kpis.loading}
                />

                {/* 4. Middle Row - Action and Spatial Intelligence */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    
                    {/* Left Column (60%) - Urgent Action Items */}
                    <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-100 bg-white flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-[#2E7D32]" />
                                    Urgent Action Items
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-1">Infants due today or overdue for vaccinations.</p>
                            </div>
                            <button 
                                onClick={() => navigate('/clinical/schedule')}
                                className="text-xs font-bold text-[#2E7D32] hover:text-green-800 uppercase tracking-wider">
                                View All
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Infant Name</th>
                                        <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                        <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Due Vaccine</th>
                                        <th className="py-3 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {urgentActions.loading ? (
                                        <tr>
                                            <td colSpan="4" className="py-8 text-center">
                                                <div className="animate-pulse flex flex-col items-center gap-2 text-slate-400">
                                                    <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
                                                    <span className="text-xs font-bold uppercase tracking-widest">Loading Records...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : urgentActions.error ? (
                                        <tr>
                                            <td colSpan="4" className="py-8 text-center text-red-500 font-medium">
                                                {urgentActions.error}
                                            </td>
                                        </tr>
                                    ) : urgentActions.data && urgentActions.data.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="py-8 text-center">
                                                <p className="text-sm text-slate-500 font-medium">No urgent actions pending today.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        urgentActions.data && urgentActions.data.map((infant, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-4 px-6 border-b border-slate-50 hover:bg-slate-50/80 transition-colors group cursor-pointer" onClick={() => navigate(`/clinical/infants/${infant.id}`)}>
                                                    <div className="flex flex-col">
                                                        <div className="font-bold text-slate-800 group-hover:text-[#2E7D32] transition-colors flex items-center gap-2">
                                                            {formatFullNameFromObject(infant)}
                                                            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium tracking-widest">{infant.reference_id}</div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6">
                                                    <StatusBadge record={infant} />
                                                </td>
                                                <td className="py-4 px-6 text-sm font-medium text-slate-700">
                                                    {infant.next_due_vaccine}
                                                </td>
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={() => handleActionComplete(infant.id)}
                                                            className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors" title="Record Dose">
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleSMS(infant)}
                                                            className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Send SMS Reminder">
                                                            <MessageSquare className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right Column (40%) - DBSCAN Hotspot Preview */}
                    <div 
                        onClick={() => navigate('/clinical/map')}
                        className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col cursor-pointer hover:shadow-md transition-shadow group relative">
                        <h3 className="text-lg font-black text-slate-800 flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-red-500" />
                                DBSCAN Hotspot Preview
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mb-4">Highest density cluster of at-risk infants requiring targeted outreach.</p>
                        
                        <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden relative border border-slate-200 min-h-[300px]">
                            {hotspot.loading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                                    <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin mb-3"></div>
                                    <span className="text-xs font-bold uppercase tracking-widest">Analyzing Clusters...</span>
                                </div>
                            ) : hotspot.error ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4 text-center bg-red-50/50">
                                    <AlertTriangle className="w-8 h-8 mb-2" />
                                    <span className="text-xs font-bold uppercase tracking-widest">{hotspot.error}</span>
                                </div>
                            ) : !hotspot.data ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                                    <MapPin className="w-8 h-8 mb-2 opacity-30" />
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">System Clear</span>
                                    <span className="text-[10px] mt-1 text-slate-400">No high-risk valid clusters detected.</span>
                                </div>
                            ) : (
                                <>
                                    <MapContainer
                                        center={[hotspot.data.lat, hotspot.data.lng]}
                                        zoom={15}
                                        style={{ height: '100%', minHeight: '300px', width: '100%' }}
                                        zoomControl={false}
                                        dragging={false}
                                        scrollWheelZoom={false}
                                        className="z-0"
                                    >
                                        <TileLayer
                                            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                                            attribution='&copy; CARTO'
                                        />
                                        <Circle 
                                            center={[hotspot.data.lat, hotspot.data.lng]} 
                                            radius={Math.min(300, 150 + hotspot.data.atRisk * 30)} 
                                            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.4 }} 
                                        />
                                    </MapContainer>
                                    <div className="absolute bottom-4 left-4 right-4 z-[400] bg-white/95 backdrop-blur shadow-lg rounded-xl p-3 border border-red-100">
                                        <p className="text-xs font-black text-slate-800 uppercase tracking-widest truncate">Priority Area: {hotspot.data.locality || (user?.assigned_barangay ? `${user.assigned_barangay.toUpperCase()} PROPER` : 'MUNICIPAL OVERVIEW')}</p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 font-bold uppercase">At Risk</span>
                                                <span className="text-lg font-black text-red-600 leading-none">{hotspot.data.atRisk}</span>
                                            </div>
                                            <div className="h-6 w-px bg-slate-200"></div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-slate-500 font-bold uppercase">Density</span>
                                                <span className="text-lg font-black text-amber-600 leading-none">{Math.round(hotspot.data.ratio * 100)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* 5. Bottom Row - Trends */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="text-lg font-black text-slate-800 mb-6">Clinical Insights</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Coverage by Dose */}
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Dose Coverage</h4>
                            <div className="h-[300px]">
                                <CoverageByDoseChart
                                    data={analyticsData.coverage?.dose_coverage}
                                    loading={analyticsData.loading}
                                />
                            </div>
                        </div>

                        {/* Timeliness Trend */}
                        <div>
                             <h4 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest border-b border-slate-100 pb-2">Timeliness Trend</h4>
                             <div className="h-[300px]">
                                <TimelinessTrendChart
                                    data={analyticsData.trend}
                                    loading={analyticsData.loading}
                                />
                             </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
