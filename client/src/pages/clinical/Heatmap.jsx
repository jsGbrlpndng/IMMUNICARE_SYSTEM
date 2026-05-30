import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import L from 'leaflet';
import {
    Activity,
    Search,
    AlertTriangle,
    Maximize,
    Target,
    Shield
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';

// Sub-components
import HeatmapSidePanel from './HeatmapSidePanel';
import HeatmapMap from './HeatmapMap';
import ErrorBoundary from '../../components/common/ErrorBoundary';
// Validation Logic
import { getBarangayCenter } from '../../utils/barangayConfig';
import { getBarangayBoundaryGeoJson } from '../../utils/barangayBoundaries';

// --- Main Orchestrator ---
export default function Heatmap() {
    const { user } = useAuth();
    const [mode, setMode] = useState('all'); // 'all' (Individual) or 'priority' (Priority Areas)
    const [activeFilters, setActiveFilters] = useState({
        // All 4 independent clinical states enabled by default.
        // Toggling one in the legend HUD only affects its own group.
        statuses: ['defaulter', 'due_soon', 'on_track', 'completed'],
        shortcuts: []
    });
    const [mapState, setMapState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false); 
    const [mapTarget, setMapTarget] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentZoom, setCurrentZoom] = useState(16);
    const [expandedClusters, setExpandedClusters] = useState({});
    const [selectedInfantId, setSelectedInfantId] = useState(null);
    const [selectedClusterId, setSelectedClusterId] = useState(null);
    const [resetViewFlag, setResetViewFlag] = useState(0);
    const [clusterDeploymentRows, setClusterDeploymentRows] = useState([]);
    const markerRefsRef = useRef({});  // holds per-infant Leaflet marker refs
    const markerRefsCallback = useCallback((refsObj) => { markerRefsRef.current = refsObj.current; }, []);
    const assignedBarangay = user?.assigned_barangay || mapState?.barangay || null;
    const barangayBoundaryData = useMemo(
        () => getBarangayBoundaryGeoJson(assignedBarangay),
        [assignedBarangay]
    );

    // --- Spatial Context Locking: Initial Center ---
    useEffect(() => {
        // Fallback for Super Admin (assigned_barangay is null)
        const targetName = user?.assigned_barangay || 'MUNICIPALITY';
        const center = getBarangayCenter(targetName);
        setMapTarget({ lat: center.lat, lng: center.lng });
    }, [user?.assigned_barangay]);

    // Fetch master spatial triage data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [res, deploymentsRes] = await Promise.all([
                apiClient.get('/analytics/map-data?scope=census&eps=300&minPts=3'),
                apiClient.get('/clinical/deployments')
            ]);

            let deploymentRows = [];
            if (deploymentsRes.ok) {
                const deploymentsPayload = await deploymentsRes.json();
                deploymentRows = Array.isArray(deploymentsPayload?.deployments)
                    ? deploymentsPayload.deployments
                    : (Array.isArray(deploymentsPayload?.clusters) ? deploymentsPayload.clusters : []);
                setClusterDeploymentRows(deploymentRows);
            } else {
                setClusterDeploymentRows([]);
            }

            if (res.ok) {
                const data = await res.json();

                const deploymentClusters = deploymentRows.map((cluster, index) => {
                    const points = Array.isArray(cluster?.points) ? cluster.points : [];
                    const validPoints = points
                        .map((point) => ({
                            ...point,
                            lat: parseFloat(point?.lat),
                            lng: parseFloat(point?.lng)
                        }))
                        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

                    const average = validPoints.reduce(
                        (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
                        { lat: 0, lng: 0 }
                    );

                    const lat = validPoints.length
                        ? average.lat / validPoints.length
                        : parseFloat(cluster?.lat ?? cluster?.centroid_latitude);
                    const lng = validPoints.length
                        ? average.lng / validPoints.length
                        : parseFloat(cluster?.lng ?? cluster?.centroid_longitude);

                    return {
                        ...cluster,
                        clusterId: cluster?.clusterId || cluster?.id || `deployment-${index + 1}`,
                        cluster_assignment_id: cluster?.cluster_assignment_id || cluster?.id,
                        cluster_label: cluster?.cluster_label || cluster?.locality || `Priority Area ${index + 1}`,
                        locality: cluster?.locality || cluster?.cluster_label || `Priority Area ${index + 1}`,
                        cluster_status: cluster?.cluster_status || cluster?.status || 'Pending',
                        assigned_user_name: cluster?.assigned_user_name || cluster?.assigned_bhw_name || '',
                        assigned_user_role: cluster?.assigned_user_role || '',
                        assigned_count: Number(cluster?.infant_count || cluster?.total_infants || validPoints.length || 0),
                        total_infants: Number(cluster?.infant_count || cluster?.total_infants || validPoints.length || 0),
                        lat,
                        lng,
                        points: validPoints
                    };
                }).filter((cluster) => {
                    return Number.isFinite(cluster.lat) && Number.isFinite(cluster.lng);
                });

                setMapState({
                    ...data,
                    clusters: deploymentClusters,
                    dss_clusters: deploymentClusters
                });
            }
        } catch (error) {
            console.error('[Heatmap] Critical Fetch Error:', error);
            setClusterDeploymentRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const handleFollowUpUpdate = () => fetchData();
        window.addEventListener('immunicare:followups-updated', handleFollowUpUpdate);
        return () => window.removeEventListener('immunicare:followups-updated', handleFollowUpUpdate);
    }, [fetchData]);

    // Mode Switcher with Guard
    const handleModeChange = useCallback((newMode) => {
        if (newMode === mode) return;
        
        setIsTransitioning(true);
        setSelectedInfantId(null);
        setSelectedClusterId(null);
        setMode(newMode);
        
        setTimeout(() => {
            setIsTransitioning(false);
        }, 300);
    }, [mode]);

    // Helpers
    const hasValidLatLng = useCallback((pt) => {
        const lat = parseFloat(pt?.lat);
        const lng = parseFloat(pt?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    }, []);
    
    const normalizeCoords = useCallback((pt) => {
        if (hasValidLatLng(pt)) return { lat: parseFloat(pt.lat), lng: parseFloat(pt.lng) };
        if (pt.geom && pt.geom.coordinates) {
            return { lat: parseFloat(pt.geom.coordinates[1]), lng: parseFloat(pt.geom.coordinates[0]) };
        }
        return { lat: 0, lng: 0 };
    }, [hasValidLatLng]);

    const formatDisplayName = useCallback((pt) => {
        if (!pt.first_name) return "Unnamed Infant";
        return `${pt.first_name} ${pt.last_name || ''}`;
    }, []);

    const formatAge = (months) => {
        if (!months) return "N/A";
        const yrs = Math.floor(months / 12);
        const m = months % 12;
        return yrs > 0 ? `${yrs}y ${m}m` : `${m} months`;
    };

    const formatClusterAreaLabel = (cluster) => {
        return cluster.locality || `Area ${cluster.rank || cluster.clusterId}`;
    };

    const toggleCluster = (id) => {
        setExpandedClusters(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleCall = (number) => {
        if (number) window.location.href = `tel:${number}`;
    };

    // Filtered data for the map markers
    const allMarkersForMode = useMemo(() => {
        if (!mapState || isTransitioning) return [];
        let pool = mapState.all_infants || [];

        // Status Filtering (Primary Triage)
        pool = pool.filter(p => activeFilters.statuses.includes(p.urgency) || p.id === selectedInfantId);

        // Shortcut / Quality Filtering
        if (activeFilters.shortcuts.includes('unmapped_high_risk')) {
            pool = pool.filter(p => (!hasValidLatLng(p) && p.urgency === 'defaulter') || p.id === selectedInfantId);
        }
        if (activeFilters.shortcuts.includes('address_needs_validation')) {
            pool = pool.filter(p => (!p.is_location_verified && hasValidLatLng(p)) || p.id === selectedInfantId);
        }
        if (activeFilters.shortcuts.includes('mapped_high_risk_only')) {
            pool = pool.filter(p => (hasValidLatLng(p) && p.urgency === 'defaulter') || p.id === selectedInfantId);
        }
        
        return pool;
    }, [mapState, mode, isTransitioning, activeFilters, hasValidLatLng, selectedInfantId]);

    const derivedCounts = useMemo(() => {
        if (!mapState || !mapState.counts) return {
            all: 0, rendered: 0,
            total_defaulters: 0, total_due_soon: 0, total_on_track: 0, total_completed: 0,
            mapped_defaulters: 0, mapped_due_soon: 0, mapped_on_track: 0, mapped_completed: 0,
            // Legacy keys kept for any components that still read them
            totalDefaulter: 0, totalDueSoon: 0, totalOnTrack: 0, totalCompleted: 0,
            mappedDefaulter: 0, mappedDueSoon: 0
        };
        const { counts } = mapState;

        return {
            all: counts.all || 0,
            rendered: allMarkersForMode.length,

            // 4-state canonical counts (used by legend HUD)
            total_defaulters: counts.total_defaulters || 0,
            total_due_soon:   counts.total_due_soon   || 0,
            total_on_track:   counts.total_on_track   || 0,
            total_completed:  counts.total_completed  || 0,

            // Mapped counts
            mapped_defaulters: counts.mapped_defaulters || 0,
            mapped_due_soon:   counts.mapped_due_soon   || 0,
            mapped_on_track:   counts.mapped_on_track   || 0,
            mapped_completed:  counts.mapped_completed  || 0,

            // Legacy aliases for backwards compatibility
            totalDefaulter: counts.total_defaulters || 0,
            totalDueSoon:   counts.total_due_soon   || 0,
            totalOnTrack:   counts.total_on_track   || 0,
            totalCompleted: counts.total_completed  || 0,
            mappedDefaulter: counts.mapped_defaulters || 0,
            mappedDueSoon:   counts.mapped_due_soon   || 0
        };
    }, [mapState, allMarkersForMode]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return null;
        const q = searchQuery.toLowerCase().trim();
        return (mapState?.all_infants || []).filter(pt => {
            const name = `${pt.first_name || ''} ${pt.last_name || ''}`.toLowerCase();
            const addr = (pt.exact_address || '').toLowerCase();
            const loc = (pt.locality || pt.barangay || '').toLowerCase();
            const guardian = (pt.guardian_name || pt.mothers_maiden_name || pt.mother_name || '').toLowerCase();
            return name.includes(q) || addr.includes(q) || loc.includes(q) || guardian.includes(q);
        });
    }, [searchQuery, mapState]);

    const handleSearchSelect = (pt) => {
        if (hasValidLatLng(pt)) {
            setMapTarget({ lat: pt.lat, lng: pt.lng });
            setSelectedInfantId(pt.id);
        }
    };

    // Side-panel click → fly to marker and open its popup
    const handleFocusInfant = useCallback((pt) => {
        if (!hasValidLatLng(pt)) return;
        setMapTarget({ lat: pt.lat, lng: pt.lng });
        setSelectedInfantId(pt.id);
        // Open the popup after the map has had time to fly
        setTimeout(() => {
            const ref = markerRefsRef.current[pt.id];
            if (ref) ref.openPopup();
        }, 1100);
    }, [hasValidLatLng]);

    return (
        <div className="flex flex-col h-screen w-full bg-slate-50 overflow-hidden">
            
            {/* Top Header (Control Bar) */}
            <div className="h-20 flex items-center justify-between px-8 bg-white border-b border-slate-200 shadow-sm z-20 shrink-0">
                
                {/* Header Left content */}
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-emerald-700 rounded-xl shadow-sm">
                        <Activity className="text-white" size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-800 tracking-tight leading-none">Midwife Follow-Up</h1>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">
                            {user?.assigned_barangay ? `Barangay ${user.assigned_barangay}` : 'Municipal Overview'} • Spatial Triage
                        </p>
                    </div>
                </div>

                {/* KPI Tabs */}
                <div className="flex bg-slate-100 rounded-lg p-1">
                    <button 
                        onClick={() => handleModeChange('all')}
                        className={`px-6 py-2 text-xs transition-all ${mode === 'all' ? 'bg-white shadow-sm text-slate-900 font-bold rounded-md' : 'text-slate-500 font-medium hover:text-slate-700'}`}
                    >
                        Individual ({derivedCounts.all || 0})
                    </button>
                    <button 
                        onClick={() => handleModeChange('priority')}
                        className={`px-6 py-2 text-xs transition-all ${mode === 'priority' ? 'bg-white shadow-sm text-slate-900 font-bold rounded-md' : 'text-slate-500 font-medium hover:text-slate-700'}`}
                    >
                        Priority Areas
                    </button>
                </div>

                {/* Search */}
                <div className="flex items-center gap-4">
                    <div className="relative z-[9999]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search clinical registry..."
                            className="pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-200 transition-all w-64 placeholder:text-slate-300"
                        />
                        {searchQuery.trim() && (
                            <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl w-80 max-h-80 overflow-y-auto">
                                {!searchResults || searchResults.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">No matches</div>
                                ) : (
                                    searchResults.map(pt => (
                                        <button
                                            key={pt.id}
                                            onClick={() => { handleSearchSelect(pt); setSearchQuery(''); }}
                                            className="w-full text-left px-5 py-4 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors flex items-center gap-4 group"
                                        >
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                                pt.urgency === 'defaulter' || pt.urgency === 'overdue' ? 'bg-rose-500' : 
                                                (pt.urgency === 'due_today' || pt.urgency === 'due_soon' ? 'bg-amber-400' : 'bg-emerald-500')
                                            }`}></div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-slate-800 truncate">{formatDisplayName(pt)}</p>
                                                <p className="text-[10px] text-slate-400 font-bold truncate">{pt.exact_address || pt.locality || 'No address'}</p>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* Map Column */}
                <div className="flex-1 flex flex-col z-0 bg-white">
                    {/* Map Area */}
                    <div className="flex-1 relative overflow-hidden flex flex-col">
                        {/* Floating Status Badge - Non-intrusive geographical context */}
                        {!loading && derivedCounts.totalDefaulter === 0 && (
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-top-4 duration-500">
                                <div className="bg-emerald-800/90 backdrop-blur-md text-white px-6 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500/30">
                                    <Shield size={16} className="text-emerald-300" />
                                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">✅ Zero Active Defaulters</span>
                                </div>
                            </div>
                        )}
                        
                        <ErrorBoundary>
                            <HeatmapMap 
                                allMarkersForMode={allMarkersForMode}
                                mode={mode}
                                mapState={mapState}
                                mapTarget={mapTarget}
                                setCurrentZoom={setCurrentZoom}
                                selectedInfantId={selectedInfantId}
                                setSelectedInfantId={setSelectedInfantId}
                                normalizeCoords={normalizeCoords}
                                formatDisplayName={formatDisplayName}
                                formatAge={formatAge}
                                handleCall={handleCall}
                                loading={loading || isTransitioning}
                                resetViewFlag={resetViewFlag}
                                markerRefsCallback={markerRefsCallback}
                                activeFilters={activeFilters}
                                setActiveFilters={setActiveFilters}
                                derivedCounts={derivedCounts}
                                barangayBoundaryData={barangayBoundaryData}
                            />
                        </ErrorBoundary>
                    </div>

                    {/* Dedicated Bottom Rail */}
                    <div className="h-14 bg-slate-900 border-t-2 border-emerald-700 px-6 flex items-center justify-between flex-shrink-0 z-10 relative">
                        <div className="flex items-center gap-6">
                            {mode === 'all' ? (
                                <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                    <div className="flex flex-col">
                                        <span className="text-white opacity-40 mb-0.5">Defaulters</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-rose-500">Total: {derivedCounts.totalDefaulter}</span>
                                            <span className="text-white/20">•</span>
                                            <span className="text-slate-300">Mapped: {derivedCounts.mappedDefaulter}</span>
                                            {derivedCounts.unmappedDefaulter > 0 && (
                                                <>
                                                    <span className="text-white/20">•</span>
                                                    <span className="text-rose-300">Unmapped: {derivedCounts.unmappedDefaulter}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="w-[1px] h-6 bg-white/10"></div>

                                    <div className="flex flex-col">
                                        <span className="text-white opacity-40 mb-0.5">Due Soon</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-amber-400">Total: {derivedCounts.totalDueSoon}</span>
                                            <span className="text-white/20">•</span>
                                            <span className="text-slate-300">Mapped: {derivedCounts.mappedDueSoon}</span>
                                        </div>
                                    </div>

                                    <div className="w-[1px] h-6 bg-white/10"></div>

                                    <div className="flex items-center gap-4 pt-2">
                                        <span className="text-emerald-400">On Track: {derivedCounts.totalOnTrack}</span>
                                        <span className="text-slate-400">Completed: {derivedCounts.totalCompleted}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${mode === 'all' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></span>
                                    <span className="text-[11px] font-black text-white tracking-widest uppercase">
                                        {activeFilters.statuses.length < 4 || activeFilters.shortcuts.length > 0 ? 'Filtered' : 'Global'} View: {allMarkersForMode.length} Infants
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-6">
                            <button 
                                onClick={() => setResetViewFlag(prev => prev + 1)}
                                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors group"
                            >
                                <Maximize size={14} className="group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-black tracking-widest uppercase">Reset View</span>
                            </button>
                            {mode === 'priority' && mapState?.recommended_actions?.find(a => a.type === 'FIELD_TARGET') && (
                                <>
                                    <div className="w-[1px] h-4 bg-white/20"></div>
                                    <button 
                                        onClick={() => {
                                            const target = mapState.recommended_actions.find(a => a.type === 'FIELD_TARGET');
                                            setSelectedClusterId(target.targetId);
                                            setMapTarget({ lat: target.lat, lng: target.lng, bounds: target.bounds });
                                        }}
                                        className="flex items-center gap-2 text-amber-400/90 hover:text-amber-400 transition-colors group"
                                    >
                                        <Target size={14} className="group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-black tracking-widest uppercase">Focus Top Priority</span>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Side Panel Container */}
                <div className="w-[450px] flex-shrink-0 bg-slate-50 border-l border-slate-200 z-10 flex flex-col">
                    <ErrorBoundary>
                        <HeatmapSidePanel 
                            mapState={mapState}
                            mode={mode}
                            setMode={handleModeChange} 
                            activeFilters={activeFilters}
                            setActiveFilters={setActiveFilters}
                            derivedCounts={derivedCounts}
                            selectedInfantId={selectedInfantId}
                            setSelectedInfantId={setSelectedInfantId}
                            selectedClusterId={selectedClusterId}
                            setSelectedClusterId={setSelectedClusterId}
                            expandedClusters={expandedClusters}
                            toggleCluster={toggleCluster}
                            setMapTarget={setMapTarget}
                            handleCall={handleCall}
                            formatDisplayName={formatDisplayName}
                            formatAge={formatAge}
                            formatClusterAreaLabel={formatClusterAreaLabel}
                            allMarkersForMode={allMarkersForMode}
                            handleFocusInfant={handleFocusInfant}
                            clusterDeploymentRows={clusterDeploymentRows}
                        />
                    </ErrorBoundary>
                </div>

            </div>

            {/* System Status Footer */}
            <div className="h-10 bg-slate-900 flex items-center justify-between px-6 z-30 shrink-0">
                <span className="text-emerald-400 text-[10px] font-mono tracking-widest">STATUS: LIVE SYNC ACTIVE</span>
                <span className="text-slate-400 text-[10px] font-mono tracking-widest">DATABASE: SECURE | LAST UPDATED: JUST NOW</span>
            </div>

        </div>
    );
}
