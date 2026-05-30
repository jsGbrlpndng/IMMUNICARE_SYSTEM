import React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Popup, Marker, Rectangle, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Map as MapIcon, Layers, AlertCircle, Loader2, Info, Filter, Navigation, Users, X, Activity, MapPin, ChevronRight } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import apiClient from '../../services/apiClient';

// Components
// No external charts needed for this view

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Configurable Route Origin: defaults to Langgam Health Center. 
// Can be changed to user location or midwife base.
const ROUTE_ORIGIN = { lat: 14.3550, lng: 121.0500, label: "Langgam Health Center" };
const DEFAULT_ZOOM = 15;

const toMapFloat = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

// ---------------------------------------------------------------------------
// Auto-Focus & Bounds Component
// ---------------------------------------------------------------------------
function MapEffects({ boundsData }) {
    const map = useMap();

    useEffect(() => {
        if (!boundsData) return;

        const bounds = L.latLngBounds(
            [boundsData.minLat - 0.005, boundsData.minLng - 0.005], // Add padding
            [boundsData.maxLat + 0.005, boundsData.maxLng + 0.005]
        );

        // Frame the map to Langgam and strictly lock panning
        map.fitBounds(bounds);
        map.setMaxBounds(bounds);

    }, [map, boundsData]);

    return null;
}

function MapFlyController({ target }) {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.lat, target.lng], 18, { duration: 1.5 });
        }
    }, [map, target]);
    return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AnalyticsMap() {
    const navigate = useNavigate();
    const [mapData, setMapData] = useState({ clusters: [], noise: [], all_infants: [], counts: { all: 0, total_defaulters: 0, total_due_soon: 0 } });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overdue'); // Default to triage
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [flyToTarget, setFlyToTarget] = useState(null);

    // Layer Toggles
    const [layers, setLayers] = useState({
        heatmap: false,
        clusters: true,
        pins: true,
        boundary: true
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get('/heatmap/langgam');
            if (res.ok) {
                const data = await res.json();
                setMapData(data);
            }
        } catch (err) {
            console.error('[Heatmap] Failed to load spatial data:', err);
            setError(err.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleLayer = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

    // Filtered data based on active tab and search query
    const filteredInfants = useMemo(() => {
        let list = [];
        if (activeTab === 'all') list = mapData.all_infants;
        else if (activeTab === 'overdue') list = mapData.all_infants.filter(p => p.computed_map_status === 'DEFAULTER' || p.urgency === 'defaulter');
        else if (activeTab === 'due_soon') list = mapData.all_infants.filter(p => p.computed_map_status === 'DUE_SOON' || p.status === 'due_soon');

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => 
                p.patient_name?.toLowerCase().includes(q) || 
                p.exact_address?.toLowerCase().includes(q) ||
                p.detected_area?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [activeTab, searchQuery, mapData]);

    const getMarkerIcon = (pt) => {
        let color = 'bg-slate-400';
        const status = pt.computed_map_status || pt.status;
        if (status === 'DEFAULTER' || pt.urgency === 'defaulter') color = 'bg-rose-600';
        else if (status === 'DUE_SOON') color = 'bg-amber-500';
        else if (status === 'due_soon') color = 'bg-blue-500';
        else if (status === 'COMPLETED' || status === 'fic') color = 'bg-emerald-500';

        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="w-3 h-3 ${color} rounded-full border-2 border-white shadow-md"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] gap-4">
            {/* --- Operational Header --- */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 w-fit">
                        {[
                            { id: 'all', label: 'All Infants', count: mapData.counts?.all },
                            { id: 'overdue', label: 'Defaulters', count: mapData.counts?.total_defaulters || 0 },
                            { id: 'due_soon', label: 'Due Soon', count: mapData.counts?.total_due_soon || 0 }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                                    activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeTab === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                    {tab.count || 0}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 max-w-md relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                            type="text"
                            placeholder="Search by name, address, or neighborhood..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => setLayers(l => ({ ...l, clusters: !l.clusters }))}
                            className={`p-2.5 rounded-xl border transition-all ${layers.clusters ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                            <Users size={18} />
                        </button>
                        <button onClick={() => setLayers(l => ({ ...l, heatmap: !l.heatmap }))}
                            className={`p-2.5 rounded-xl border transition-all ${layers.heatmap ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-400'}`}>
                            <Activity size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Main Workspace --- */}
            <div className="flex-1 flex gap-4 overflow-hidden">
                {/* Map Area */}
                <div className="flex-1 relative bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                    {loading && (
                        <div className="absolute inset-0 z-[1001] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-emerald-600" size={32} />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recalculating Spatial Triage...</span>
                        </div>
                    )}

                    <MapContainer
                        center={[14.3550, 121.0500]}
                        zoom={15}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                    >
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                            attribution='&copy; CARTO'
                        />
                        <MapFlyController target={flyToTarget} />
                        
                        {layers.boundary && mapData.bounds && (
                            <Rectangle 
                                bounds={[[mapData.bounds.minLat, mapData.bounds.minLng], [mapData.bounds.maxLat, mapData.bounds.maxLng]]}
                                pathOptions={{ color: '#059669', weight: 1, fill: false, dashArray: '5, 10' }}
                            />
                        )}

                        {/* Clusters (Risk Zones) */}
                        {layers.clusters && activeTab === 'overdue' && mapData.clusters?.map((cluster, i) => {
                            const lat = toMapFloat(cluster.lat);
                            const lng = toMapFloat(cluster.lng);
                            if (lat === null || lng === null) return null;
                            return (
                            <Circle
                                key={`cluster-${i}`}
                                center={[lat, lng]}
                                radius={cluster.zero_dose > 0 ? 150 : 100}
                                eventHandlers={{ click: () => setSelectedItem({ type: 'cluster', data: cluster }) }}
                                pathOptions={{
                                    fillColor: cluster.zero_dose > 0 ? '#F43F5E' : '#D97706',
                                    color: cluster.zero_dose > 0 ? '#F43F5E' : '#D97706',
                                    fillOpacity: 0.1,
                                    weight: 1,
                                    dashArray: '5, 10'
                                }}
                            />
                        );
                        })}

                        {/* Household Pins */}
                        {layers.pins && filteredInfants.map((pt, i) => {
                            const lat = toMapFloat(pt.lat ?? pt.latitude);
                            const lng = toMapFloat(pt.lng ?? pt.longitude);
                            if (lat === null || lng === null) return null;
                            return (
                            <Marker
                                key={`pt-${pt.id}`}
                                position={[lat, lng]}
                                icon={getMarkerIcon(pt)}
                                eventHandlers={{ click: () => setSelectedItem({ type: 'infant', data: pt }) }}
                            >
                                <Popup>
                                    <div className="p-1">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{pt.detected_area}</p>
                                        <p className="text-sm font-black text-slate-800">{pt.patient_name}</p>
                                        <div className="mt-2 flex gap-2">
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                pt.computed_map_status === 'DEFAULTER' || pt.urgency === 'defaulter' ? 'bg-rose-50 text-rose-600' :
                                                pt.status === 'due_soon' ? 'bg-blue-50 text-blue-600' :
                                                pt.status === 'fic' ? 'bg-emerald-50 text-emerald-600' :
                                                'bg-amber-50 text-amber-600'
                                            }`}>
                                                {pt.status}
                                            </span>
                                            {pt.overdue_doses > 0 && (
                                                <span className="text-[8px] font-black bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded uppercase">
                                                    {pt.overdue_doses} Overdue
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                        })}
                    </MapContainer>

                    {/* Legend Overlay */}
                    <div className="absolute bottom-6 left-6 z-[1000] bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-xl space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-rose-600" />
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Defaulter (Critical)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Overdue</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Due Soon</span>
                        </div>
                    </div>
                </div>

                {/* Execution Side Panel */}
                <div className="w-96 bg-white rounded-2xl border border-slate-200 shadow-lg flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Field Action Workspace</h3>
                        <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={16} />
                        </button>
                    </div>

                    {selectedItem ? (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {selectedItem.type === 'cluster' ? (
                                <>
                                    <div className="p-6 bg-white border-b border-slate-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                            <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">High Risk Cluster</span>
                                        </div>
                                        <h4 className="text-2xl font-black text-slate-900 leading-none">{selectedItem.data.cluster_id}</h4>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
                                            {selectedItem.data.total_infants} Households Requiring Visit
                                        </p>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Priority Visit Ranking</p>
                                        {selectedItem.data.points.sort((a,b) => b.overdue_doses - a.overdue_doses).map((pt, i) => (
                                            <div 
                                                key={pt.id} 
                                                onClick={() => setFlyToTarget({ lat: pt.lat, lng: pt.lng })}
                                                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-400 transition-all group cursor-pointer"
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[13px] font-black text-slate-900 group-hover:text-emerald-600 transition-colors">{pt.patient_name}</span>
                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${pt.computed_map_status === 'DEFAULTER' || pt.urgency === 'defaulter' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                                        {pt.status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                    <MapPin size={10} className="text-slate-300" />
                                                    {pt.detected_area || 'Langgam Proper'}
                                                </div>
                                                <div className="mt-3 flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase">{pt.overdue_doses} Missed Doses</span>
                                                    <button onClick={(e) => { e.stopPropagation(); navigate(`/clinical/infants/${pt.id}`); }} className="text-[9px] font-black text-emerald-600 uppercase underline decoration-2 underline-offset-2">View Profile</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="p-6 space-y-6">
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
                                        <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
                                            selectedItem.data.computed_map_status === 'DEFAULTER' || selectedItem.data.urgency === 'defaulter' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                                        }`}>
                                            <Users size={32} />
                                        </div>
                                        <h4 className="text-xl font-black text-slate-900">{selectedItem.data.patient_name}</h4>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">{selectedItem.data.detected_area}</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Risk Level</span>
                                            <span className={`text-[10px] font-black uppercase ${selectedItem.data.computed_map_status === 'DEFAULTER' || selectedItem.data.urgency === 'defaulter' ? 'text-rose-600' : 'text-amber-600'}`}>
                                                {selectedItem.data.computed_map_status === 'DEFAULTER' || selectedItem.data.urgency === 'defaulter' ? 'High Concern' : 'Moderate'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Missed Doses</span>
                                            <span className="text-xl font-black text-slate-900">{selectedItem.data.overdue_doses}</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={() => navigate(`/clinical/infants/${selectedItem.data.id}`)}
                                        className="w-full bg-slate-900 text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl transition-all hover:bg-slate-800 active:scale-95"
                                    >
                                        Open Health Record
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 border border-slate-100">
                                <Navigation size={32} className="text-slate-300" />
                            </div>
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">No Selection</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 leading-relaxed">
                                Click a high-risk zone or household pin to begin visit planning.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

