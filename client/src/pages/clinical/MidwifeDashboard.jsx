import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    AlertCircle,
    Clock,
    MapPin,
    Calendar,
    MessageSquare,
    ChevronRight,
    Activity,
    ShieldCheck,
    Bell,
    Map as MapIcon,
    ArrowUpRight,
    Filter,
    Plus,
    Stethoscope,
    Loader2,
    Phone,
    Home,
    Search,
    CheckCircle2,
    Shield
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { MapContainer, TileLayer, Circle, Popup, LayerGroup, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

// Map Controller for FlyTo effects
const MapFlyController = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target && target.lat && target.lng) {
            map.flyTo([target.lat, target.lng], 17, { duration: 1.5 });
        }
    }, [target, map]);
    return null;
};

// --- Auto-Bounds Component ---
const AutoBounds = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        if (points && points.length > 0) {
            const group = L.featureGroup(points.map(p => L.marker([p.lat, p.lng])));
            map.fitBounds(group.getBounds(), {
                padding: [50, 50], // Consistent professional padding
                maxZoom: 16
            });
        }
    }, [map, points]);
    return null;
};

const createStatusIcon = (status) => {
    let color = '#10B981'; // Default green (Up-to-date)
    if (status === 'overdue' || status === 'defaulter') color = '#EF4444'; // Red
    else if (status === 'due_today' || status === 'due_soon') color = '#F59E0B'; // Yellow

    return L.divIcon({
        className: 'bg-transparent',
        html: `<div class="w-2.5 h-2.5 rounded-full border border-white shadow-sm" style="background-color: ${color}"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });
};

export default function MidwifeDashboard() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // -- STATE --
    const [stats, setStats] = useState({ scheduledToday: 0, overdueCount: 0, clusterCount: 0, smsSent: 0 });
    const [localityGap, setLocalityGap] = useState([]);
    const [spatialData, setSpatialData] = useState({ clusters: [], noise: [] });
    const [alerts, setAlerts] = useState([]);
    const [priorityFollowups, setPriorityFollowups] = useState([]);
    const [todayList, setTodayList] = useState([]);
    const [systemImpactData, setSystemImpactData] = useState([]);
    const [fieldKitData, setFieldKitData] = useState([]);
    const [timeframe, setTimeframe] = useState('today');

    const [loading, setLoading] = useState(true);
    const [chartsReady, setChartsReady] = useState(false);
    const [flyToTarget, setFlyToTarget] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null); // { type: 'cluster' | 'infant', data: object }
    const [selectedVaccineModal, setSelectedVaccineModal] = useState(null); // Interactive drill-down state

    // -- DATA BINDING --
    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [statsRes, gapRes, spatialRes, alertRes, priorityRes, urgentRes, impactRes] = await Promise.all([
                    apiClient.get('/analytics/dashboard-stats'),
                    apiClient.get('/analytics/locality-gap'),
                    apiClient.get('/analytics/map-data?eps=300&minPts=3'),
                    apiClient.get('/dashboard/dbscan-alerts'),
                    apiClient.get('/dashboard/priority-followups?limit=10'),
                    apiClient.get('/dashboard/urgent-actions?limit=100'),
                    apiClient.get('/analytics/system-impact')
                ]);

                const statsData = statsRes.ok ? await statsRes.json() : {};
                const spatialData = spatialRes.ok ? await spatialRes.json() : { counts: {}, clusters: [], markers: {} };

                if (gapRes.ok) setLocalityGap(await gapRes.json());
                setSpatialData(spatialData);
                if (alertRes.ok) setAlerts((await alertRes.json()).alerts || []);
                if (priorityRes.ok) setPriorityFollowups((await priorityRes.json()).data || []);
                if (impactRes.ok) setSystemImpactData(await impactRes.json());
                if (urgentRes.ok) {
                    const data = await urgentRes.json();
                    setTodayList((data.actions || []).filter(a => a.urgency === 'due_today'));
                }

                // Sync counts from the shared schedule engine and spatial results
                // We prioritize clinical_overdue_total from the map-data to ensure cross-page consistency
                setStats({
                    ...statsData,
                    overdueCount: spatialData.counts?.clinical_overdue_total || statsData.overdueCount || 0,
                    dueSoon: spatialData.counts?.clinical_due_soon_total || statsData.dueSoon || 0,
                    clusterCount: spatialData.clusters?.length || 0
                });
            } catch (err) {
                console.error('DSS Load Failure:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setChartsReady(true), 150);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fetchFieldKit = async () => {
            try {
                const res = await apiClient.get(`/schedule/field-kit?timeframe=${timeframe}`);
                if (res.ok) {
                    const data = await res.json();
                    setFieldKitData(Array.isArray(data) ? data : []);
                } else {
                    console.error(`Field Kit API Error: ${res.status}`);
                    setFieldKitData([]);
                }
            } catch (err) {
                console.error('Field Kit Network Failure:', err);
                setFieldKitData([]);
            }
        };
        fetchFieldKit();
    }, [timeframe]);


    // -- HELPERS --
    const DEFAULT_CENTER = [14.3555, 121.0515]; // Barangay Langgam center

    const formatName = (first, last, referenceId) => {
        if (!first && !last) return 'Unnamed Infant';

        const fName = first ? String(first).trim() : '';
        const lName = last ? String(last).trim() : '';

        if (!fName && !lName) return 'Unnamed Infant';

        // Removed mock logic

        const capitalized = `${fName.charAt(0).toUpperCase() + fName.slice(1).toLowerCase()} ${lName.charAt(0).toUpperCase() + lName.slice(1).toLowerCase()}`;

        return (
            <div className="flex flex-col">
                <span className="text-sm font-black text-slate-800 leading-none">{capitalized}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{referenceId}</span>
            </div>
        );
    };

    const sortedWorklist = useMemo(() => {
        const combined = [...todayList, ...priorityFollowups].filter(inf => inf.urgency !== 'dropout' && inf.rankingStatus !== 'DROPOUT');

        const getWeight = (inf) => {
            if (inf.rankingStatus === 'DEFAULTER') return 4;
            if (inf.urgency === 'overdue') return 3;
            if (inf.urgency === 'due_today') return 2;
            if (inf.urgency === 'due_soon') return 1;
            return 0;
        };

        return combined.sort((a, b) => {
            const weightA = getWeight(a);
            const weightB = getWeight(b);
            if (weightA !== weightB) return weightB - weightA;
            return (b.days_overdue || 0) - (a.days_overdue || 0);
        });
    }, [todayList, priorityFollowups]);


    const getRecommendation = (inf) => {
        const address = inf.exact_address ? String(inf.exact_address) : '';
        const isGenericAddress = !address ||
            address.length < 5 ||
            (address.toLowerCase().includes('langgam') && address.length < 15);

        const handleAction = () => {
            alert('Action recorded: Feature integration pending.');
        };

        if (inf.rankingStatus === 'DEFAULTER' || (inf.days_overdue && inf.days_overdue >= 30)) {
            return { text: 'Log Field Visit', style: 'bg-emerald-700 text-white hover:bg-emerald-800 border-transparent', action: handleAction };
        }

        if (isGenericAddress && inf.urgency === 'overdue') {
            return { text: 'Trace Address', style: 'bg-amber-600 text-white hover:bg-amber-700 border-transparent', action: handleAction };
        }

        if (inf.urgency === 'overdue') {
            return { text: 'Log Field Visit', style: 'bg-emerald-700 text-white hover:bg-emerald-800 border-transparent', action: handleAction };
        }

        return { text: 'Send SMS', style: 'bg-transparent text-slate-700 border-slate-300 hover:bg-slate-50', action: handleAction };
    };



    const bottlenecks = useMemo(() => {
        const combined = [...todayList, ...priorityFollowups];
        const counts = {
            homeVisit: 0,
            unreachable: 0,
            addressMissing: 0,
            severeOverdue: 0,
            validationRequired: 0
        };

        combined.forEach(inf => {
            if (inf.rankingStatus === 'DEFAULTER' || (inf.days_overdue && inf.days_overdue >= 30)) counts.homeVisit++;
            const contactVal = inf.contact_number ? String(inf.contact_number).trim() : '';
            if (!contactVal || contactVal === '' || contactVal.toLowerCase() === 'none') counts.unreachable++;
            const addressVal = inf.exact_address ? String(inf.exact_address) : '';
            const isGeneric = !addressVal ||
                addressVal.length < 5 ||
                (addressVal.toLowerCase().includes('langgam') && addressVal.length < 15);
            if (isGeneric) counts.addressMissing++;
            if (inf.days_overdue > 90) counts.severeOverdue++;
        });

        // Overlay with real count from backend if available
        if (stats?.pendingValidation !== undefined) {
            counts.validationRequired = stats.pendingValidation;
        }

        return counts;
    }, [todayList, priorityFollowups, stats?.pendingValidation]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
                <Loader2 className="text-emerald-800 animate-spin" size={48} />
                <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Initialising DSS Workspace...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-6 lg:p-8">

            {/* 1. TOP HEADER / KPI ROW */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-6 border-b border-slate-200 pb-6">
                <div className="flex flex-col gap-1.5">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                        <div className="w-1.5 h-10 bg-emerald-800 rounded-sm" />
                        Midwife Follow-Up Dashboard
                    </h1>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] ml-5">
                        Operational Decision Support System • {user?.assigned_barangay ? `BARANGAY ${user.assigned_barangay.toUpperCase()}` : 'MUNICIPAL OVERVIEW'}
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={() => navigate('/clinical/validation')}
                        className="bg-emerald-800 hover:bg-emerald-900 text-white px-8 py-4 rounded-sm flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.15em] shadow-lg shadow-emerald-900/15 transition-all active:scale-95 group whitespace-nowrap"
                    >
                        <Shield size={16} />
                        Validation Center
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                {[
                    { label: 'Due Today', value: stats?.scheduledToday, icon: Clock, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-800', path: '/clinical/registry?urgency=due_today' },
                    { label: 'Overdue', value: stats?.overdueCount, icon: AlertCircle, color: 'rose', bg: 'bg-rose-50', text: 'text-rose-600', path: '/clinical/registry?urgency=overdue' },
                    { label: 'Due Soon', value: stats?.dueSoon, icon: Calendar, color: 'amber', bg: 'bg-amber-50', text: 'text-amber-600', path: '/clinical/registry?urgency=due_soon' },
                    { label: 'Risk Hotspots', value: stats?.clusterCount, icon: MapPin, color: 'emerald', bg: 'bg-emerald-50/50', text: 'text-emerald-800', path: '/clinical/map' }
                ].map((kpi, i) => (
                    <div
                        key={i}
                        onClick={() => kpi.path && navigate(kpi.path)}
                        className={`bg-white border border-slate-200 rounded-sm p-6 shadow-sm flex flex-col justify-between hover:border-${kpi.color}-300 hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]`}
                    >
                        <div className="flex justify-between items-start">
                            <div className={`p-3 rounded-sm ${kpi.bg} ${kpi.text} group-hover:scale-110 transition-transform`}>
                                <kpi.icon size={20} />
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{kpi.label}</span>
                        </div>
                        <div className="flex items-end justify-between mt-6">
                            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                                {kpi.value || 0}
                            </h3>
                            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                        </div>
                    </div>
                ))}
            </div>

            {/* ROW 1: ACTION QUEUE + STRATEGIC FOLLOW-UP */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

                {/* Main Action Queue / Worklist */}
                <div className="lg:col-span-2 h-full">
                    <div className="bg-white border border-slate-200 rounded-sm shadow-sm flex flex-col h-[500px]">
                        <div className="px-6 py-6 border-b-2 border-emerald-800 flex items-center justify-between bg-white shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-50 rounded-sm">
                                    <Activity size={18} className="text-emerald-800" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-emerald-800 uppercase tracking-[0.1em]">Midwife Action Queue</h2>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Prioritised Follow-Ups & Vaccinations</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-emerald-800 bg-white border border-emerald-800 px-3 py-1.5 rounded-sm uppercase tracking-widest">
                                    {priorityFollowups.length + todayList.length} Tasks Pending
                                </span>
                            </div>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar flex-1">
                            <div className="w-full flex flex-col">
                                <div className="sticky top-0 bg-white z-20 grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_1.5fr] border-b border-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                                    <div className="py-4 px-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">Infant / Reference</div>
                                    <div className="py-4 px-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">Reason / Priority</div>
                                    <div className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">Locality</div>
                                    <div className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex justify-center items-center">Overdue</div>
                                    <div className="py-4 px-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex justify-center items-center">Risk Tier</div>
                                    <div className="py-4 px-5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex justify-end items-center">Recommended Action</div>
                                </div>
                                <div className="divide-y divide-slate-50 flex flex-col">
                                    {sortedWorklist.length === 0 ? (
                                        <div className="py-24 flex justify-center items-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-16 h-16 bg-slate-50 rounded-sm flex items-center justify-center text-emerald-800">
                                                    <CheckCircle2 size={32} />
                                                </div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">No immediate actions required</h3>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest max-w-xs mx-auto text-center">All validated infants in this sector are currently up-to-date based on their NIP schedules.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        sortedWorklist.map((inf, i) => {
                                            const rec = getRecommendation(inf);
                                            const rawLabel = inf.rankingStatus || inf.urgency || 'Scheduled';
                                            const urgencyLabel = rawLabel.replace(/_/g, ' ');
                                            const isDropout = inf.urgency === 'dropout' || inf.rankingStatus === 'DROPOUT';
                                            return (
                                                <div key={i} className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_1.5fr] hover:bg-slate-50/80 transition-colors group border-b border-slate-50">
                                                    <div className="py-4 px-5 flex items-center">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-sm bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-800 transition-colors shrink-0">
                                                                {inf.first_name?.[0]}{inf.last_name?.[0]}
                                                            </div>
                                                            {formatName(inf.first_name, inf.last_name, inf.reference_id)}
                                                        </div>
                                                    </div>
                                                    <div className="py-4 px-5 flex items-center">
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`text-[9px] font-bold px-2 py-1 rounded-sm w-fit uppercase tracking-widest whitespace-nowrap bg-white ${inf.urgency === 'overdue' || inf.rankingStatus === 'DEFAULTER' || isDropout
                                                                    ? 'text-rose-700 border border-rose-600'
                                                                    : (inf.urgency === 'due_today' || inf.urgency === 'due_soon')
                                                                        ? 'text-amber-600 border border-amber-500'
                                                                        : 'text-emerald-700 border border-emerald-600'
                                                                }`}>
                                                                {urgencyLabel}
                                                            </span>
                                                            {inf.next_due_vaccine && (
                                                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter leading-tight max-w-[120px]">
                                                                    {inf.next_due_vaccine.replace('Pending: ', '')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="py-4 px-4 flex items-center">
                                                        <div className="flex items-center gap-1.5">
                                                            <MapPin size={11} className="text-slate-300 shrink-0" />
                                                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight leading-tight">
                                                                {inf.locality || inf.purok || 'General'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="py-4 px-4 flex justify-center items-center text-center">
                                                        <span className={`text-xs font-black ${inf.days_overdue > 30 ? 'text-rose-600' : 'text-slate-700'}`}>
                                                            {isDropout || inf.days_overdue > 365 ? '> 1 Year (Audit Required)' : `${inf.days_overdue || 0}d`}
                                                        </span>
                                                    </div>
                                                    <div className="py-4 px-5 flex justify-center items-center">
                                                        {isDropout || inf.days_overdue > 365 ? (
                                                            <span className="text-[9px] font-bold text-rose-700 border border-rose-600 px-2 py-1 bg-white uppercase tracking-widest rounded-sm whitespace-nowrap">Tier 1 Critical</span>
                                                        ) : inf.days_overdue >= 30 ? (
                                                            <span className="text-[9px] font-bold text-rose-700 border border-rose-600 px-2 py-1 bg-white uppercase tracking-widest rounded-sm whitespace-nowrap">Tier 1 Critical</span>
                                                        ) : inf.days_overdue > 0 ? (
                                                            <span className="text-[9px] font-bold text-amber-600 border border-amber-500 px-2 py-1 bg-white uppercase tracking-widest rounded-sm whitespace-nowrap">Tier 2 Elevated</span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold text-emerald-700 border border-emerald-600 px-2 py-1 bg-white uppercase tracking-widest rounded-sm whitespace-nowrap">Tier 3 Routine</span>
                                                        )}
                                                    </div>
                                                    <div className="py-4 px-5 flex justify-end items-center">
                                                        <div className="flex items-center justify-end gap-2 w-full">
                                                            <button
                                                                onClick={(e) => {
                                                                    if (rec.action) {
                                                                        e.stopPropagation();
                                                                        rec.action();
                                                                    }
                                                                }}
                                                                className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-sm border transition-all text-[10px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer ${rec.style} w-full`}
                                                            >
                                                                {rec.text}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                            <button
                                onClick={() => navigate('/clinical/registry')}
                                className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-slate-600 transition-colors flex items-center gap-2"
                            >
                                View Full Registry <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Field Kit Planner moved to new grid */}
                </div>

                {/* Sidebar: Strategic Follow-Up */}
                <div className="lg:col-span-1 h-[500px]">

                    {/* Outreach Recommendation */}
                    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden h-full flex flex-col transition-all hover:shadow-md">
                        <div className="p-6 border-b-2 border-emerald-800 bg-white">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck size={16} className="text-emerald-800" />
                                <h2 className="text-xs font-black text-emerald-800 uppercase tracking-[0.15em]">Strategic Follow-Up</h2>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recommended Focus Area</p>
                        </div>

                        <div className="p-6 flex-1 flex flex-col justify-between">
                            {spatialData.clusters?.length > 0 ? (
                                <>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-start">
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-700 bg-white px-2.5 py-1 rounded-sm border border-rose-600">
                                                Priority Area
                                            </span>
                                            <div className="p-2 bg-rose-50 rounded-sm">
                                                <MapPin size={16} className="text-rose-500" />
                                            </div>
                                        </div>

                                        <h3 className="text-xl font-black text-slate-800">{spatialData.clusters[0].locality}</h3>
                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                            Concentrated backlog detected. Coordinated <span className="font-bold text-slate-900">home visits</span> are recommended for this sector to improve coverage.
                                        </p>
                                        <div className="bg-emerald-50 border-l-4 border-emerald-800 p-4 rounded-sm">
                                            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1">Operational Directive</p>
                                            <p className="text-[11px] font-bold text-emerald-600 leading-tight">Address {spatialData.clusters[0].total_infants || spatialData.clusters[0].count} critical cases in this locality.</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => navigate('/clinical/map')}
                                        className="w-full text-slate-400 hover:text-emerald-800 hover:bg-emerald-50 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all py-3 border border-slate-100 rounded-sm"
                                    >
                                        <MapIcon size={14} />
                                        View Triage Map
                                        <ChevronRight size={14} />
                                    </button>
                                </>
                            ) : (
                                <div className="py-12 text-center h-full flex flex-col justify-center">
                                    <div className="w-16 h-16 bg-emerald-50 rounded-sm flex items-center justify-center mx-auto mb-4">
                                        <ShieldCheck size={32} className="text-emerald-800" />
                                    </div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1">Sector Secured</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No spatial risks identified</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ROW 2: FIELD KIT + BOTTLENECKS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
                {/* Dynamic Field Kit Planner */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-slate-200 border-t-4 border-t-emerald-700 rounded-sm shadow-sm h-[350px] flex flex-col">
                        <div className="p-6 border-b border-slate-100 shrink-0 flex justify-between items-start">
                            <div>
                                <h2 className="text-xs font-black text-slate-800 tracking-widest uppercase">DAILY REQUISITION & FIELD KIT</h2>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                                    BASED ON {timeframe === 'today' ? "TODAY'S" : "THIS WEEK'S"} ACTIVE QUEUE
                                </p>
                            </div>
                            <div className="flex bg-slate-100 p-1 rounded-md gap-1">
                                <button
                                    onClick={() => setTimeframe('today')}
                                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all ${timeframe === 'today' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Today
                                </button>
                                <button
                                    onClick={() => setTimeframe('week')}
                                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all ${timeframe === 'week' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    This Week
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-0 space-y-1">
                            {fieldKitData.length === 0 ? (
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest py-12 text-center">Queue Clear: No vaccines required for today's operational queue.</p>
                            ) : (
                                fieldKitData.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedVaccineModal(item)}
                                        className="w-full flex justify-between items-center py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group text-left"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-800 transition-colors">{item.vaccineName}</span>
                                        </div>
                                        <span className="text-sm font-black text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded-sm border border-emerald-100 group-hover:bg-emerald-100 group-hover:border-emerald-200 transition-all">
                                            {item.requiredDoses} Doses
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Follow-Up Bottlenecks */}
                <div className="lg:col-span-1">
                    <div className="bg-white border border-slate-200 border-t-4 border-t-emerald-800 rounded-sm shadow-sm overflow-hidden flex flex-col h-[350px] transition-all hover:shadow-md">
                        <div className="p-6 border-b-2 border-emerald-800 bg-white shrink-0">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertCircle size={16} className="text-rose-600" />
                                <h2 className="text-xs font-black text-emerald-800 uppercase tracking-[0.15em]">Follow-Up Bottlenecks</h2>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Barriers to effective follow-up</p>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                            {[
                                { label: 'Needs Home Visit', count: bottlenecks.homeVisit, icon: Home, color: 'text-rose-600', bg: 'bg-rose-50', path: '/clinical/registry?urgency=overdue' },
                                { label: 'Unreachable (SMS/Phone)', count: bottlenecks.unreachable, icon: Phone, color: 'text-orange-600', bg: 'bg-orange-50' },
                                { label: 'No Exact Address', count: bottlenecks.addressMissing, icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50' },
                                { label: 'Severe Overdue (>90d)', count: bottlenecks.severeOverdue, icon: Clock, color: 'text-red-900', bg: 'bg-red-50', path: '/clinical/registry?urgency=overdue' },
                                { label: 'Validation Required', count: bottlenecks.validationRequired, icon: Search, color: 'text-emerald-800', bg: 'bg-emerald-50', path: '/clinical/validation' }
                            ].map((item, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => item.path && navigate(item.path)}
                                    className={`flex items-center justify-between group p-2.5 rounded-sm transition-all ${item.path ? 'cursor-pointer hover:bg-slate-50 active:scale-[0.98]' : 'cursor-default'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-sm ${item.bg} ${item.color} group-hover:scale-110 transition-transform`}>
                                            <item.icon size={16} />
                                        </div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-black ${item.count > 0 ? item.color : 'text-slate-300'}`}>{item.count}</span>
                                        {item.path && <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. ANALYTICS ROW: CHART */}
            <div className="grid grid-cols-1 mt-2">
                <div className="bg-white border border-slate-200 rounded-sm p-8 shadow-sm flex flex-col h-[400px]">
                    <div className="flex items-start justify-between mb-8 gap-4">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-xs font-black text-emerald-800 uppercase tracking-[0.15em]">System Impact & Dropout Rate</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">6-Month Trajectory of Program Engagement</p>
                        </div>
                    </div>

                    <div className="flex-1 w-full min-h-[300px] relative">
                        {chartsReady && (
                            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                                <LineChart
                                    data={systemImpactData}
                                    margin={{ left: 0, right: 20, top: 20, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '4px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: '#475569', marginTop: '10px' }} />
                                    <Line type="monotone" dataKey="active" name="Active Registrations" stroke="#94a3b8" strokeWidth={3} dot={{ r: 4, fill: '#94a3b8' }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="completed" name="Completed Series" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669' }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="dropouts" name="Defaulter Dropouts" stroke="#e11d48" strokeWidth={3} dot={{ r: 4, fill: '#e11d48' }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
            <FieldKitModal
                vaccine={selectedVaccineModal}
                onClose={() => setSelectedVaccineModal(null)}
            />
        </div>
    );
}

// -- CDSS DRILL-DOWN MODAL COMPONENT --
const FieldKitModal = ({ vaccine, onClose }) => {
    if (!vaccine) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative bg-white rounded-sm shadow-xl p-6 w-[500px] max-w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="mb-6">
                    <h2 className="text-emerald-800 font-black text-lg uppercase tracking-tight leading-none">
                        INFANTS REQUIRING {vaccine.vaccineName}
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">
                        Clinical Allocation Directive • {vaccine.requiredDoses} Doses Total
                    </p>
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-2 custom-scrollbar">
                    {vaccine.infantsList && vaccine.infantsList.length > 0 ? (
                        vaccine.infantsList.map((inf, i) => (
                            <div key={i} className="p-3 border border-slate-100 rounded-sm hover:border-emerald-200 transition-colors bg-slate-50/30">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight block">
                                            {inf.name}
                                        </span>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <MapPin size={10} className="text-emerald-600" />
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                                                {inf.locality || 'Unspecified Sector'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-white px-2 py-0.5 border border-slate-100">
                                        {inf.id}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-sm">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-8">
                                No specific infant data found for this clinical directive.
                            </p>
                        </div>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="mt-8 w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-black py-4 rounded-sm text-[10px] tracking-[0.2em] uppercase transition-all shadow-sm active:scale-[0.98]"
                >
                    Close Directive
                </button>
            </div>
        </div>
    );
};

