import React, { useState, useEffect } from 'react';
import { 
    Users, 
    AlertCircle, 
    Clock, 
    Target,
    Shield,
    ArrowUpRight,
    MapPin,
    Calendar,
    MessageSquare,
    ChevronRight,
    Search,
    Filter,
    BarChart3,
    Activity,
    Info,
    LayoutDashboard
} from 'lucide-react';
import { 
    BarChart, 
    Bar, 
    AreaChart,
    Area,
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../services/apiClient';
import DBSCANClusterAlerts from '../../components/DBSCANClusterAlerts';
import { MapContainer, TileLayer, Circle, Popup, LayerGroup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useBarangayFilter } from '../../contexts/BarangayFilterContext';

const PublicHealthDashboard = () => {
    const navigate = useNavigate();
    const { selectedBarangay } = useBarangayFilter();
    const [stats, setStats] = useState({
        scheduledToday: 0,
        overdueCount: 0,
        smsSent: 0,
        clusterCount: 0
    });
    const [localityGap, setLocalityGap] = useState([]);
    const [uptakeTrend, setUptakeTrend] = useState([]);
    const [nipOutlook, setNipOutlook] = useState([]);
    const [defaulters, setDefaulters] = useState([]); // For heatmap
    const [loading, setLoading] = useState(true);
    const [chartsReady, setChartsReady] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    useEffect(() => {
        fetchDashboardData();
        const timer = setTimeout(() => setChartsReady(true), 100);
        return () => clearTimeout(timer);
    }, [selectedDate, selectedBarangay]);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const [statsRes, gapRes, trendRes, outlookRes] = await Promise.all([
                apiClient.get('/analytics/dashboard-stats'),
                apiClient.get('/analytics/locality-gap'),
                apiClient.get('/analytics/monthly-uptake'),
                apiClient.get('/analytics/nip-outlook')
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
            if (gapRes.ok) setLocalityGap(await gapRes.json());
            if (trendRes.ok) setUptakeTrend(await trendRes.json());
            if (outlookRes.ok) setNipOutlook(await outlookRes.json());

            // Fetch defaulters for heatmap
            const defaulterRes = await apiClient.get('/dashboard/urgent-actions?limit=100');
            if (defaulterRes.ok) {
                const data = await defaulterRes.json();
                setDefaulters(data.actions || []);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const LanggamCoords = [14.3550, 121.0500];

    // Locality Centroids for Heatmap Simulation
    const LOCALITY_CENTROIDS = {
        'St. Joseph': [14.3555, 121.0515],
        'Genesis': [14.3562, 121.0530],
        'Filinvest': [14.3540, 121.0545],
        'Holiday Hills': [14.3525, 121.0490],
        'Langgam Proper': [14.3550, 121.0500]
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
            <>
                {/* ── Sharp Clinical Header ────────────────────────────────────────── */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-6 bg-emerald-600 rounded-full"></div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Public Health Decision Support</h1>
                        </div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.2em] ml-4">
                            {selectedBarangay === 'all' ? 'Municipal Overview (All Barangays)' : `Barangay ${selectedBarangay}`} • Clinical Portal
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => navigate('/clinical/registration')}
                            className="flex items-center gap-2 px-5 py-3 bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-sm font-bold rounded-xl shadow-sm transition-all active:scale-[0.98]"
                        >
                            <Users size={18} />
                            Register New Infant
                        </button>
                    </div>
                </div>

                {/* ── KPI Row: Sharp & Emerald ─────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    {[
                        { label: 'Due Today', value: stats.scheduledToday, icon: Clock, color: 'emerald' },
                        { label: 'Overdue', value: stats.overdueCount, icon: AlertCircle, color: 'rose' },
                        { label: 'Spatial Hotspots', value: stats.clusterCount, icon: MapPin, color: 'amber' },
                        { label: 'SMS Outreach', value: stats.smsSent, icon: MessageSquare, color: 'blue' }
                    ].map((kpi, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm group hover:border-emerald-200 transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-2 rounded-lg bg-${kpi.color}-50 text-${kpi.color}-600`}>
                                    <kpi.icon size={20} />
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</span>
                            </div>
                            <h3 className="text-3xl font-black text-slate-900">{loading ? '...' : kpi.value}</h3>
                        </div>
                    ))}
                </div>

                {/* ── Main Intelligence Grid ───────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
                    
                    {/* Left: Alerts & Outlook (7 Cols) */}
                    <div className="lg:col-span-7 space-y-8">
                        {/* Priority Alerts */}
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <h2 className="text-sm font-black text-emerald-900 uppercase tracking-widest flex items-center gap-2">
                                    <Activity size={16} className="text-rose-500" />
                                    Priority Health Alerts
                                </h2>
                            </div>
                            <div className="p-2">
                                <DBSCANClusterAlerts />
                            </div>
                        </div>

                        {/* NIP Outlook */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <h2 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Calendar size={16} className="text-emerald-600" />
                                5-Day Forecast
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                {nipOutlook.map((item, idx) => (
                                    <div key={idx} className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">
                                            {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                        </p>
                                        <p className="text-lg font-black text-slate-800 leading-none mb-2">{new Date(item.date).getDate()}</p>
                                        <div className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block">
                                            {item.count} Cases
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Heatmap Spatial Widget (5 Cols) */}
                    <div className="lg:col-span-5">
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm h-full flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Neighborhood Risk Map</h2>
                                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Langgam Locality Concentration</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
                                    <span className="text-[10px] font-black text-rose-600 uppercase">Live Heatmap</span>
                                </div>
                            </div>
                            
                            <div className="flex-1 min-h-[350px] relative">
                                <MapContainer center={LanggamCoords} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                                    
                                    {/* Heatmap-like Circles for Defaulters */}
                                    <LayerGroup>
                                        {defaulters.map((def, idx) => {
                                            const coords = def.latitude && def.longitude ? [def.latitude, def.longitude] : LanggamCoords;
                                            return (
                                                <Circle 
                                                    key={idx}
                                                    center={coords}
                                                    radius={30}
                                                    pathOptions={{ 
                                                        color: '#e11d48', 
                                                        fillColor: '#e11d48', 
                                                        fillOpacity: 0.15,
                                                        weight: 0
                                                    }}
                                                />
                                            );
                                        })}
                                        
                                        {/* Glowing Clusters */}
                                        {localityGap.filter(g => g.missed_doses > 5).map((loc, idx) => {
                                            const pos = LOCALITY_CENTROIDS[loc.locality] || LanggamCoords;
                                            return (
                                                <Circle 
                                                    key={`loc-${idx}`}
                                                    center={pos}
                                                    radius={120}
                                                    pathOptions={{ 
                                                        color: '#e11d48', 
                                                        fillColor: '#e11d48', 
                                                        fillOpacity: 0.2,
                                                        weight: 1,
                                                        dashArray: '5, 10'
                                                    }}
                                                >
                                                    <Popup>
                                                        <div className="p-2">
                                                            <p className="text-[10px] font-black text-rose-600 uppercase">High-Concern Area</p>
                                                            <p className="text-sm font-black text-slate-800">{loc.locality}</p>
                                                            <p className="text-xs text-slate-500 font-bold mt-1">{loc.missed_doses} Missed Doses</p>
                                                        </div>
                                                    </Popup>
                                                </Circle>
                                            );
                                        })}
                                    </LayerGroup>
                                </MapContainer>

                                {/* Legend Overlay */}
                                <div className="absolute bottom-4 left-4 z-[400] bg-white/90 backdrop-blur p-3 rounded-xl border border-slate-200 shadow-lg space-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-rose-500 opacity-50"></div>
                                        <span className="text-[10px] font-black text-slate-700 uppercase">Individual Defaulter</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full border-2 border-rose-500 bg-rose-100 opacity-80"></div>
                                        <span className="text-[10px] font-black text-slate-700 uppercase">Active Cluster</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Clinical Intelligence Section ──────────────────────────── */}
                <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-xl font-black text-emerald-900 tracking-tight">Clinical Intelligence</h2>
                            <p className="text-sm text-slate-500 font-medium">Performance analytics by neighborhood and timeline.</p>
                        </div>
                        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                            <Calendar size={16} className="text-slate-400 ml-2" />
                            <input 
                                type="month" 
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent border-none text-xs font-black text-slate-700 focus:ring-0 cursor-pointer"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Chart 1: Locality Gap */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Immunization Gap by Locality</h4>
                                <Info size={14} className="text-slate-300" />
                            </div>
                            <div className="h-[300px] min-w-0">
                                {chartsReady && (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={localityGap} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="12 12" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="locality" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} />
                                            <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Bar dataKey="missed_doses" radius={[4, 4, 0, 0]} barSize={32}>
                                                {localityGap.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.missed_doses > 5 ? '#e11d48' : '#059669'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        {/* Chart 2: Coverage Trend */}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Monthly Coverage Trend</h4>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-1 bg-emerald-600 rounded-full"></div>
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Doses Administered</span>
                                </div>
                            </div>
                            <div className="h-[300px] min-w-0">
                                {chartsReady && (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={uptakeTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorUptake" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#059669" stopOpacity={0.1}/>
                                                    <stop offset="95%" stopColor="#059669" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="12 12" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94a3b8' }} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Area 
                                                type="monotone" 
                                                dataKey="count" 
                                                stroke="#059669" 
                                                strokeWidth={3} 
                                                fillOpacity={1} 
                                                fill="url(#colorUptake)" 
                                                dot={{ r: 4, fill: '#059669', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 6 }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </>
        </div>
    );
};

export default PublicHealthDashboard;
