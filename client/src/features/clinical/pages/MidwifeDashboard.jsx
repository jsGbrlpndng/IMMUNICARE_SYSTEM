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
import { useAuth } from '../../../contexts/AuthContext';
import { useFeedback } from '../../../contexts/FeedbackContext';
import apiClient from '../../../services/apiClient';
import { MapContainer, TileLayer, Circle, Popup, LayerGroup, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatFullName } from '../../../utils/formatFullName';
import { getClinicalStatusMeta } from '../../../utils/clinicalStatus';
import StatusBadge from '../../../components/common/StatusBadge';

const ACTIVE_FIELD_TASK_STATUSES = ['ASSIGNED', 'ACKNOWLEDGED', 'OVERDUE', 'COMPLETED_PENDING_REVIEW'];

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
    const color = getClinicalStatusMeta(status).colorHex;

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
    const { showToast } = useFeedback();

    // -- STATE --
    const [stats, setStats] = useState({ scheduledToday: 0, overdueCount: 0, clusterCount: 0, smsSent: 0 });
    const [localityGap, setLocalityGap] = useState([]);
    const [spatialData, setSpatialData] = useState({ clusters: [], noise: [] });
    const [alerts, setAlerts] = useState([]);
    const [priorityFollowups, setPriorityFollowups] = useState([]);
    const [todayList, setTodayList] = useState([]);
    const [systemImpactData, setSystemImpactData] = useState([]);
    const [deploymentSummary, setDeploymentSummary] = useState({ activeClusters: 0, deployedBhws: 0 });
    const [activeDeployments, setActiveDeployments] = useState([]);

    const [activeAssignments, setActiveAssignments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [loading, setLoading] = useState(true);
    const [chartsReady, setChartsReady] = useState(false);
    const [flyToTarget, setFlyToTarget] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null); // { type: 'cluster' | 'infant', data: object }

    // -- DATA BINDING --
    useEffect(() => {
        const fetchAll = async ({ silent = false } = {}) => {
            if (!silent) {
                setLoading(true);
            }
            try {
                const [statsRes, gapRes, spatialRes, alertRes, priorityRes, urgentRes, impactRes, deploymentRes, myDeploymentRes] = await Promise.all([
                    apiClient.get('/analytics/dashboard-stats'),
                    apiClient.get('/analytics/locality-gap'),
                    apiClient.get('/analytics/map-data?eps=300&minPts=3'),
                    apiClient.get('/dashboard/dbscan-alerts'),
                    apiClient.get('/dashboard/priority-followups?limit=10'),
                    apiClient.get('/dashboard/urgent-actions?limit=100'),
                    apiClient.get('/analytics/system-impact'),
                    apiClient.get('/follow-ups?limit=500'),
                    apiClient.get('/clinical/deployments/active')
                ]);

                const statsData = statsRes.ok ? await statsRes.json() : {};
                const spatialData = spatialRes.ok ? await spatialRes.json() : { counts: {}, clusters: [], markers: {} };

                if (gapRes.ok) setLocalityGap(await gapRes.json());
                setSpatialData(spatialData);
                if (alertRes.ok) setAlerts((await alertRes.json()).alerts || []);
                if (priorityRes.ok) setPriorityFollowups((await priorityRes.json()).data || []);
                if (impactRes.ok) setSystemImpactData(await impactRes.json());
                if (deploymentRes.ok) {
                    const deploymentData = await deploymentRes.json();
                    const priorityRows = (deploymentData?.follow_ups || []).filter((item) => item?.cluster_priority);
                    setDeploymentSummary({
                        activeClusters: new Set(priorityRows.map((item) => item.cluster_assignment_id).filter(Boolean)).size,
                        deployedBhws: new Set(priorityRows.map((item) => item.assigned_cluster_bhw_id).filter(Boolean)).size
                    });
                } else {
                    setDeploymentSummary({ activeClusters: 0, deployedBhws: 0 });
                }
                if (myDeploymentRes.ok) {
                    const myDeploymentData = await myDeploymentRes.json();
                    setActiveDeployments(Array.isArray(myDeploymentData?.deployments) ? myDeploymentData.deployments : []);
                } else {
                    setActiveDeployments([]);
                }
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
                setActiveDeployments([]);
            } finally {
                if (!silent) {
                    setLoading(false);
                }
            }
        };
        fetchAll();
        const handleFollowUpUpdate = () => fetchAll({ silent: true });
        const handleFollowUpStorage = (event) => {
            if (event.key === 'immunicare:followups-updated') {
                fetchAll({ silent: true });
            }
        };
        window.addEventListener('immunicare:followups-updated', handleFollowUpUpdate);
        window.addEventListener('storage', handleFollowUpStorage);
        const intervalId = window.setInterval(() => fetchAll({ silent: true }), 10000);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('immunicare:followups-updated', handleFollowUpUpdate);
            window.removeEventListener('storage', handleFollowUpStorage);
        };
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setChartsReady(true), 150);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const fetchAssignments = async ({ silent = false } = {}) => {
            if (!silent) {
                setIsLoading(true);
            }
            try {
                const res = await apiClient.get('/follow-ups');
                if (!res.ok) {
                    throw new Error((await res.json()).error || 'Failed to fetch active outreach assignments.');
                }
                const data = await res.json();
                const items = Array.isArray(data?.follow_ups) ? data.follow_ups : [];
                // Filter to show active individual assignments using the follow_up_tasks state machine.
                const assignments = items
                    .filter(item => ACTIVE_FIELD_TASK_STATUSES.includes(item.task_status))
                    .map(item => ({
                        ...item,
                        assignment_status: item.task_status
                    }))
                    .sort((a, b) => {
                        return ACTIVE_FIELD_TASK_STATUSES.indexOf(a.assignment_status) - ACTIVE_FIELD_TASK_STATUSES.indexOf(b.assignment_status);
                    });
                setActiveAssignments(assignments);
                setError(null);
            } catch (err) {
                console.error('BHW Outreach Monitor Fetch Failure:', err);
                setError(err.message || 'Failed to connect to the server.');
            } finally {
                if (!silent) {
                    setIsLoading(false);
                }
            }
        };

        fetchAssignments();
        const handleFollowUpUpdate = () => fetchAssignments({ silent: true });
        const handleFollowUpStorage = (event) => {
            if (event.key === 'immunicare:followups-updated') {
                fetchAssignments({ silent: true });
            }
        };
        window.addEventListener('immunicare:followups-updated', handleFollowUpUpdate);
        window.addEventListener('storage', handleFollowUpStorage);
        const intervalId = window.setInterval(() => fetchAssignments({ silent: true }), 10000);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('immunicare:followups-updated', handleFollowUpUpdate);
            window.removeEventListener('storage', handleFollowUpStorage);
        };
    }, []);


    // -- HELPERS --
    const DEFAULT_CENTER = [14.3555, 121.0515]; // Barangay Langgam center

    const formatName = (first, middle, last, referenceId) => {
        const capitalized = formatFullName(first, middle, last);
        if (!capitalized) return 'Unnamed Infant';

        return (
            <div className="flex flex-col">
                <span className="text-sm font-black text-slate-800 leading-none">{capitalized}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{referenceId}</span>
            </div>
        );
    };

    const sortedWorklist = useMemo(() => {
        const combined = [...todayList, ...priorityFollowups].filter(inf => inf.urgency !== 'DEFAULTED' && inf.rankingStatus !== 'DEFAULTED');

        const getWeight = (inf) => {
            if (inf.rankingStatus === 'DEFAULTED') return 4;
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
            showToast('Action recorded: Feature integration pending.', 'info');
        };

        if (inf.rankingStatus === 'DEFAULTED' || (inf.days_overdue && inf.days_overdue >= 30)) {
            return { text: 'Log Field Visit', style: 'bg-green-800 text-white hover:bg-green-900 border-transparent', action: handleAction };
        }

        if (isGenericAddress && inf.urgency === 'overdue') {
            return { text: 'Trace Address', style: 'bg-amber-600 text-white hover:bg-amber-700 border-transparent', action: handleAction };
        }

        if (inf.urgency === 'overdue') {
            return { text: 'Log Field Visit', style: 'bg-green-800 text-white hover:bg-green-900 border-transparent', action: handleAction };
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
            if (inf.rankingStatus === 'DEFAULTED' || (inf.days_overdue && inf.days_overdue >= 30)) counts.homeVisit++;
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
                <Loader2 className="text-green-800 animate-spin" size={48} />
                <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Initialising DSS Workspace...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 p-6 lg:p-8">

            {/* 1. TOP HEADER / KPI ROW */}
            <div className="bg-green-800 border border-green-900 text-white p-6 md:p-8 rounded-lg shadow-md mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex flex-col">
                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                        Midwife Operational Dashboard
                    </h1>
                    <p className="text-[10px] text-green-100 font-bold uppercase tracking-[0.25em] mt-2">
                        Operational Decision Support System • {user?.assigned_barangay ? `BARANGAY ${user.assigned_barangay.toUpperCase()}` : 'MUNICIPAL OVERVIEW'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button
                        onClick={() => navigate('/clinical/map?view=priority')}
                        className="bg-green-900/50 hover:bg-green-900 text-green-100 border border-green-700/50 px-5 py-3 rounded-md flex items-center gap-3 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap"
                    >
                        <MapPin size={16} />
                        Active Clusters: {deploymentSummary.activeClusters} | Deployed BHWs: {deploymentSummary.deployedBhws}
                    </button>
                    <button
                        onClick={() => navigate('/clinical/validation')}
                        className="bg-white hover:bg-slate-50 text-green-800 px-6 py-3 rounded-md flex items-center gap-3 text-xs font-black uppercase tracking-widest shadow-sm transition-all active:scale-95 group whitespace-nowrap"
                    >
                        <Shield size={16} />
                        Validation Queue
                    </button>
                </div>
            </div>

            {activeDeployments.length > 0 && (
                <section className="mb-6 rounded-sm border border-rose-300 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-l-4 border-rose-600 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-rose-50 text-rose-700">
                                <Stethoscope className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-700">
                                    URGENT: Mobile Clinic Deployment
                                </p>
                                <h2 className="mt-1 text-lg font-black text-slate-900">
                                    The Head Nurse has deployed you to conduct a mobile catch-up immunization drive at a defaulter cluster in {activeDeployments[0]?.cluster_label || activeDeployments[0]?.barangay || 'your assigned barangay'}.
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    {activeDeployments[0]?.infant_count || 0} infants are included in this deployment area. Review the spatial view before field coordination.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/clinical/map?view=priority', {
                                state: {
                                    initialMode: 'priority',
                                    focusCluster: {
                                        id: activeDeployments[0]?.id,
                                        lat: parseFloat(activeDeployments[0]?.centroid_latitude),
                                        lng: parseFloat(activeDeployments[0]?.centroid_longitude),
                                        bounds: activeDeployments[0]?.bounds
                                    }
                                }
                            })}
                            className="inline-flex items-center justify-center gap-2 rounded-sm bg-green-800 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-green-900"
                        >
                            View Deployment Area
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </section>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                {[
                    { label: 'Due Today', value: stats?.scheduledToday, icon: Clock, bg: 'bg-green-50', text: 'text-green-800', path: '/clinical/registry?urgency=due_today' },
                    { label: 'Defaulted', value: stats?.overdueCount, icon: AlertCircle, bg: 'bg-rose-50', text: 'text-rose-600', path: '/clinical/registry?urgency=defaulter' },
                    { label: 'Due Soon', value: stats?.dueSoon, icon: Calendar, bg: 'bg-amber-50', text: 'text-amber-600', path: '/clinical/registry?urgency=due_soon' },
                    { label: 'Defaulter Hotspots', value: stats?.clusterCount, icon: MapPin, bg: 'bg-green-50/50', text: 'text-green-800', path: '/clinical/map?view=priority' }
                ].map((kpi, i) => (
                    <div
                        key={i}
                        onClick={() => kpi.path && navigate(kpi.path)}
                        className="bg-white border border-slate-200 rounded-md p-6 shadow-sm flex items-center justify-between hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group active:scale-[0.98]"
                    >
                        <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</span>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tight mt-2">
                                {kpi.value || 0}
                            </h3>
                        </div>
                        <div className={`p-3 rounded-md ${kpi.bg} ${kpi.text} shrink-0`}>
                            <kpi.icon size={24} />
                        </div>
                    </div>
                ))}
            </div>

            {/* ROW 1: ACTION QUEUE + STRATEGIC FOLLOW-UP */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Main Action Queue / Worklist */}
                <div className="lg:col-span-2 h-full">
                    <div className="bg-white border border-slate-200 rounded-md shadow-sm flex flex-col h-[500px] overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-green-800" />
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Midwife Action Queue</h2>
                            </div>
                            <span className="text-[10px] font-bold text-green-800 bg-green-50 px-2.5 py-1 rounded-md uppercase tracking-wider border border-green-200">
                                {priorityFollowups.length + todayList.length} Tasks Pending
                            </span>
                        </div>

                        <div className="overflow-auto scrollbar-hide flex-1">
                            <div className="overflow-x-auto w-full">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 z-20 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                                        <tr className="border-b border-slate-200">
                                            <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '26%' }}>Infant / Reference</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '16%' }}>Reason / Priority</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '16%' }}>Locality</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap" style={{ width: '11%' }}>Defaulted</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap" style={{ width: '12%' }}>Risk Tier</th>
                                            <th className="py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap" style={{ width: '19%' }}>Recommended Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedWorklist.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-24 text-center">
                                                    <div className="flex flex-col items-center gap-3 justify-center">
                                                        <div className="w-16 h-16 bg-slate-50 rounded-md flex items-center justify-center text-green-800 border border-slate-100">
                                                            <CheckCircle2 size={32} />
                                                        </div>
                                                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">No immediate actions required</h3>
                                                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider max-w-xs mx-auto text-center">All validated infants in this sector are currently on track based on their NIP schedules.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            sortedWorklist.map((inf, i) => {
                                                const rec = getRecommendation(inf);
                                                const isDEFAULTED = inf.urgency === 'DEFAULTED' || inf.rankingStatus === 'DEFAULTED';
                                                return (
                                                    <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                                                        <td className="py-2 px-4 align-middle whitespace-nowrap">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:bg-green-100 group-hover:text-green-800 transition-colors shrink-0">
                                                                    {inf.first_name?.[0]}{inf.last_name?.[0]}
                                                                </div>
                                                                {formatName(inf.first_name, inf.middle_name, inf.last_name, inf.reference_id)}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-4 align-middle whitespace-nowrap">
                                                            <div className="flex flex-col gap-1 min-w-0">
                                                                <StatusBadge
                                                                    record={{
                                                                        ...inf,
                                                                        clinical_status: isDEFAULTED ? 'DEFAULTED' : inf.clinical_status
                                                                    }}
                                                                    emphasize={isDEFAULTED}
                                                                    className="rounded-md"
                                                                />
                                                                {inf.next_due_vaccine && (
                                                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate max-w-[120px]">
                                                                        {inf.next_due_vaccine.replace('Pending: ', '')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-4 align-middle whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                                                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider truncate">
                                                                    {inf.locality || inf.purok || 'General'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-4 align-middle text-center whitespace-nowrap">
                                                            <span className={`text-xs font-bold ${inf.days_overdue > 30 ? 'text-rose-600' : 'text-slate-700'}`}>
                                                                {isDEFAULTED || inf.days_overdue > 365 ? '> 1 Yr' : `${inf.days_overdue || 0}d`}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-4 align-middle text-center whitespace-nowrap">
                                                            {isDEFAULTED || inf.days_overdue > 365 ? (
                                                                <span className="text-[9px] font-bold text-rose-700 border border-rose-600 px-2 py-0.5 bg-rose-50/50 uppercase tracking-wider rounded-md whitespace-nowrap">Tier 1 Critical</span>
                                                            ) : inf.days_overdue >= 30 ? (
                                                                <span className="text-[9px] font-bold text-rose-700 border border-rose-600 px-2 py-0.5 bg-rose-50/50 uppercase tracking-wider rounded-md whitespace-nowrap">Tier 1 Critical</span>
                                                            ) : inf.days_overdue > 0 ? (
                                                                <span className="text-[9px] font-bold text-amber-600 border border-amber-500 px-2 py-0.5 bg-amber-50/50 uppercase tracking-wider rounded-md whitespace-nowrap">Tier 2 Elevated</span>
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-green-700 border border-green-600 px-2 py-0.5 bg-green-50/50 uppercase tracking-wider rounded-md whitespace-nowrap">Tier 3 Routine</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-4 align-middle text-right whitespace-nowrap">
                                                            <button
                                                                onClick={(e) => {
                                                                    if (rec.action) {
                                                                        e.stopPropagation();
                                                                        rec.action();
                                                                    }
                                                                }}
                                                                className={`flex items-center justify-center gap-1 px-3 py-1.5 rounded-md border transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer ${rec.style} w-full`}
                                                            >
                                                                {rec.text}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-center shrink-0">
                            <button
                                onClick={() => navigate('/clinical/registry')}
                                className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors flex items-center gap-1.5"
                            >
                                View Full Registry <ChevronRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sidebar: Strategic Follow-Up */}
                <div className="lg:col-span-1 h-[500px]">
                    <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden h-full flex flex-col transition-all hover:shadow-md">
                        <div className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={16} className="text-green-800" />
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Strategic Follow-Up</h2>
                            </div>
                        </div>

                        <div className="p-6 flex-1 flex flex-col justify-between">
                            {spatialData.clusters?.length > 0 ? (
                                <>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-start">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                                                Priority Area
                                            </span>
                                            <div className="p-2 bg-rose-50 rounded-sm">
                                                <MapPin size={16} className="text-rose-500" />
                                            </div>
                                        </div>

                                        <h3 className="text-lg font-black text-slate-800">{spatialData.clusters[0].locality}</h3>
                                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                            Concentrated backlog detected. Coordinated <span className="font-bold text-slate-900">home visits</span> are recommended for this sector to improve coverage.
                                        </p>
                                        <div className="bg-green-50 border-l-4 border-green-800 p-4 rounded-md">
                                            <p className="text-[10px] font-black text-green-800 uppercase tracking-widest mb-1">Operational Directive</p>
                                            <p className="text-[11px] font-bold text-green-600 leading-tight">Address {spatialData.clusters[0].total_infants || spatialData.clusters[0].count} critical cases in this locality.</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => navigate('/clinical/map?view=priority')}
                                        className="w-full text-slate-500 hover:text-green-800 hover:bg-green-50 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all py-3 border border-slate-200 rounded-md"
                                    >
                                        <MapIcon size={14} />
                                        View Triage Map
                                        <ChevronRight size={14} />
                                    </button>
                                </>
                            ) : (
                                <div className="py-12 text-center h-full flex flex-col justify-center">
                                    <div className="w-16 h-16 bg-green-50 rounded-md flex items-center justify-center mx-auto mb-4 border border-green-100">
                                        <ShieldCheck size={32} className="text-green-800" />
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-905 uppercase tracking-wider mb-1">Sector Secured</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No spatial risks identified</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ROW 2: BHW OUTREACH MONITOR + BOTTLENECKS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
                {/* Barangay Health Worker (BHW) Outreach Monitor */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-slate-200 rounded-md shadow-sm h-[350px] flex flex-col overflow-hidden border-t-4 border-[#084C39]">
                        <div className="px-5 py-4 border-b border-slate-200 shrink-0 flex justify-between items-center bg-white">
                            <div className="flex items-start flex-col">
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                    👥 BARANGAY HEALTH WORKER (BHW) OUTREACH MONITOR
                                </h2>
                                <p className="text-[10px] font-semibold text-slate-400 uppercase mt-0.5">
                                    Active field assignments and home visitation logs for Barangay Langgam.
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead className="bg-[#084C39] text-white sticky top-0 z-10">
                                    <tr className="border-b border-slate-200">
                                        <th className="py-2.5 px-5 text-[10px] font-black uppercase tracking-wider">ASSIGNED BHW</th>
                                        <th className="py-2.5 px-5 text-[10px] font-black uppercase tracking-wider">TARGET INFANT</th>
                                        <th className="py-2.5 px-5 text-[10px] font-black uppercase tracking-wider">LOCALITY</th>
                                        <th className="py-2.5 px-5 text-[10px] font-black uppercase tracking-wider text-center">STATUS</th>
                                        <th className="py-2.5 px-5 text-[10px] font-black uppercase tracking-wider text-right">ACTION</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={5} className="py-12 px-5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin text-green-800" />
                                                Syncing active field deployments...
                                            </td>
                                        </tr>
                                    ) : error ? (
                                        <tr>
                                            <td colSpan={5} className="py-12 px-5 text-center text-xs font-semibold text-rose-600 uppercase tracking-wider">
                                                Error: {error}
                                            </td>
                                        </tr>
                                    ) : activeAssignments.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-12 px-5 text-center text-xs font-semibold text-slate-550 uppercase tracking-wider">
                                                No active infant follow-up assignments found.
                                            </td>
                                        </tr>
                                    ) : (
                                        activeAssignments.map((assignment, idx) => {
                                            const displayStatus = assignment.assignment_status || assignment.task_status || 'ASSIGNED';
                                            const localityStr = assignment.infant?.address_purok || assignment.infant?.address_sitio || assignment.infant?.address_barangay || assignment.purok || assignment.sitio || assignment.barangay || 'Locality unassigned';
                                            return (
                                                <tr key={assignment.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-2.5 px-5 font-semibold text-slate-800 align-middle">
                                                        {assignment.assigned_bhw_name || 'Unassigned'}
                                                    </td>
                                                    <td className="py-2.5 px-5 font-black text-slate-800 align-middle">
                                                        {formatFullName(assignment.first_name, assignment.middle_name, assignment.last_name) || 'Unnamed Infant'}
                                                    </td>
                                                    <td className="py-2.5 px-5 text-slate-600 font-medium align-middle max-w-[155px] truncate whitespace-nowrap" title={localityStr}>
                                                        {localityStr}
                                                    </td>
                                                    <td className="py-2.5 px-5 text-center align-middle">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            displayStatus === 'OVERDUE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                            displayStatus === 'ACKNOWLEDGED' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                            displayStatus === 'COMPLETED_PENDING_REVIEW' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                            'bg-green-50 text-green-700 border border-green-200'
                                                        }`}>
                                                            {displayStatus === 'COMPLETED_PENDING_REVIEW' ? 'Pending Review' : displayStatus}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-5 text-right align-middle">
                                                        <button
                                                            onClick={() => navigate('/clinical/follow-ups')}
                                                            className="inline-flex items-center justify-center gap-1 border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50 transition-all rounded-sm active:scale-95 whitespace-nowrap"
                                                        >
                                                            REVIEW
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Trend Metrics Summary */}
                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 shrink-0 text-xs text-slate-500 font-medium">
                            📈 OUTREACH METRIC: 50% of targeted defaulting households have been reached this week.
                        </div>
                    </div>
                </div>

                {/* Follow-Up Bottlenecks */}
                <div className="lg:col-span-1">
                    <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden flex flex-col h-[350px] transition-all hover:shadow-md">
                        <div className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-rose-600" />
                                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Follow-Up Bottlenecks</h2>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-2.5">
                            {[
                                { label: 'Needs Home Visit', count: bottlenecks.homeVisit, icon: Home, color: 'text-rose-600', bg: 'bg-rose-50', path: '/clinical/registry?urgency=overdue' },
                                { label: 'Unreachable (SMS/Phone)', count: bottlenecks.unreachable, icon: Phone, color: 'text-orange-600', bg: 'bg-orange-50' },
                                { label: 'No Exact Address', count: bottlenecks.addressMissing, icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50' },
                                { label: 'Severe Defaulter (>90d)', count: bottlenecks.severeOverdue, icon: Clock, color: 'text-red-900', bg: 'bg-red-50', path: '/clinical/registry?urgency=overdue' },
                                { label: 'Validation Required', count: bottlenecks.validationRequired, icon: Search, color: 'text-green-800', bg: 'bg-green-50', path: '/clinical/validation' }
                            ].map((item, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => item.path && navigate(item.path)}
                                    className={`flex items-center justify-between group p-2 rounded-md transition-all ${item.path ? 'cursor-pointer hover:bg-slate-50 active:scale-[0.98] border border-transparent hover:border-slate-200' : 'cursor-default border border-transparent'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-md ${item.bg} ${item.color} group-hover:scale-105 transition-transform`}>
                                            <item.icon size={16} />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-black ${item.count > 0 ? item.color : 'text-slate-300'}`}>{item.count}</span>
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
                <div className="bg-white border border-slate-200 rounded-md p-8 shadow-sm flex flex-col h-[400px]">
                    <div className="flex items-start justify-between mb-8 gap-4">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-xs font-black text-green-800 uppercase tracking-[0.15em]">System Impact & Defaulter Rate</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">6-Month Trajectory of Program Engagement</p>
                        </div>
                    </div>

                    <div className="h-[300px] w-full relative">
                        {chartsReady && systemImpactData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
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
                                    <Line type="monotone" dataKey="dropouts" name="Defaulter Count" stroke="#e11d48" strokeWidth={3} dot={{ r: 4, fill: '#e11d48' }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center border border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                No trend records available
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

