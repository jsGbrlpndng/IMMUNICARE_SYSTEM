import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Popup, ScaleControl, useMap } from 'react-leaflet';
import { Activity, Filter, Loader2, MapPinned, ShieldCheck } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { getBarangayCenter } from '../../utils/barangayConfig';
import { barangayBoundaryStyle, getBarangayBoundaryGeoJson } from '../../utils/barangayBoundaries';

const STATUS_LAYERS = [
    { id: 'defaulter', label: 'Defaulter', color: '#e11d48' },
    { id: 'due_soon', label: 'Due Soon', color: '#d97706' },
    { id: 'on_track', label: 'On Track', color: '#059669' },
    { id: 'completed', label: 'Completed', color: '#64748b' },
];

const normalizeBarangay = (value) => (value || 'LANGGAM').toString().trim().toUpperCase();

const toFloat = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getInfantStatus = (infant) => {
    if (infant?.urgency) return infant.urgency;
    if (infant?.computed_map_status === 'DEFAULTER') return 'defaulter';
    if (infant?.computed_map_status === 'DUE_SOON' || infant?.computed_map_status === 'DUE_TODAY') return 'due_soon';
    if (infant?.computed_map_status === 'ON_TRACK') return 'on_track';
    return 'completed';
};

const getStatusMeta = (status) => STATUS_LAYERS.find((item) => item.id === status) || STATUS_LAYERS[2];

const FitPopulation = ({ points, boundaryData }) => {
    const map = useMap();

    useEffect(() => {
        if (boundaryData) return;
        const validPoints = (points || [])
            .map((point) => [toFloat(point.lat), toFloat(point.lng)])
            .filter(([lat, lng]) => lat != null && lng != null);

        if (validPoints.length > 0) {
            map.fitBounds(validPoints, { padding: [48, 48], maxZoom: 17 });
        }
    }, [points, boundaryData, map]);

    return null;
};

export default function AdminPopulationMap() {
    const { user } = useAuth();
    const [population, setPopulation] = useState([]);
    const [counts, setCounts] = useState({});
    const [activeStatuses, setActiveStatuses] = useState(STATUS_LAYERS.map((layer) => layer.id));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const assignedBarangay = normalizeBarangay(user?.assigned_barangay || user?.assignedBarangay || user?.barangay);
    const barangayCenter = getBarangayCenter(assignedBarangay);
    const barangayBoundaryData = useMemo(
        () => getBarangayBoundaryGeoJson(assignedBarangay),
        [assignedBarangay]
    );

    const loadPopulation = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await apiClient.get('/analytics/map-data?scope=census&eps=300&minPts=3');
            const payload = response.ok ? await response.json() : {};

            if (!response.ok) {
                console.error('[ADMIN_POPULATION_MAP] request failed', {
                    status: response.status,
                    statusText: response.statusText,
                    payload
                });
                setError('Unable to load barangay population map.');
                return;
            }

            setPopulation(Array.isArray(payload?.all_infants) ? payload.all_infants : []);
            setCounts(payload?.counts || {});
        } catch (requestError) {
            console.error('[ADMIN_POPULATION_MAP]', requestError);
            setError('Unable to load barangay population map.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPopulation();
    }, [loadPopulation]);

    const visibleInfants = useMemo(() => {
        return population
            .map((infant) => ({
                ...infant,
                lat: toFloat(infant?.lat),
                lng: toFloat(infant?.lng),
                display_status: getInfantStatus(infant)
            }))
            .filter((infant) => infant.lat != null && infant.lng != null)
            .filter((infant) => activeStatuses.includes(infant.display_status));
    }, [population, activeStatuses]);

    const toggleLayer = (status) => {
        setActiveStatuses((current) => (
            current.includes(status)
                ? current.filter((item) => item !== status)
                : [...current, status]
        ));
    };

    const statusCount = (status) => {
        if (status === 'defaulter') return counts.total_defaulters || 0;
        if (status === 'due_soon') return counts.total_due_soon || 0;
        if (status === 'on_track') return counts.total_on_track || 0;
        if (status === 'completed') return counts.total_completed || 0;
        return 0;
    };

    return (
        <div className="space-y-6 p-5 lg:p-8">
            <section className="border border-[#14532d] bg-[#166534] text-white shadow-sm">
                <div className="flex flex-col gap-5 px-8 py-7 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100">
                            Strategic Population View
                        </p>
                        <h1 className="mt-3 text-3xl font-black tracking-tight">Admin Population Heatmap</h1>
                        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-emerald-50">
                            Barangay-wide immunization visibility for {assignedBarangay}. This view tracks the full registered infant population, separate from DSS deployment clusters.
                        </p>
                    </div>
                    <div className="border border-emerald-400/30 bg-emerald-950/20 px-5 py-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">Registered Infants</p>
                        <p className="mt-1 text-3xl font-black">{loading ? '...' : population.length}</p>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
                <aside className="border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-6 py-5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center bg-emerald-50 text-emerald-800">
                                <Filter className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Map Visibility</p>
                                <h2 className="text-base font-black text-slate-950">Population Layers</h2>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 px-6 py-6">
                        <div className="border border-emerald-200 bg-emerald-50 p-4">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-800" />
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wider text-emerald-900">
                                        Barangay-scoped census layer
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">
                                        Data is scoped by the authenticated Admin session.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {STATUS_LAYERS.map((layer) => {
                                const active = activeStatuses.includes(layer.id);
                                return (
                                    <button
                                        key={layer.id}
                                        type="button"
                                        onClick={() => toggleLayer(layer.id)}
                                        className={`flex w-full items-center justify-between border px-4 py-3 text-left transition ${
                                            active ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-white opacity-45'
                                        }`}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span
                                                className="h-3 w-3 rounded-full"
                                                style={{ backgroundColor: layer.color }}
                                            />
                                            <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-700">
                                                {layer.label}
                                            </span>
                                        </span>
                                        <span
                                            className="px-2 py-1 text-[10px] font-black"
                                            style={{ backgroundColor: `${layer.color}18`, color: layer.color }}
                                        >
                                            {statusCount(layer.id)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {error && (
                            <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                                {error}
                            </div>
                        )}
                    </div>
                </aside>

                <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Assigned Barangay</p>
                            <h2 className="text-xl font-black text-slate-950">{assignedBarangay} Population Map</h2>
                        </div>
                        <div className="inline-flex items-center gap-2 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
                            <MapPinned className="h-4 w-4" />
                            Full Infant Population
                        </div>
                    </div>

                    <div className="h-[660px] w-full">
                        <MapContainer
                            center={[barangayCenter.lat, barangayCenter.lng]}
                            zoom={barangayCenter.zoom || 16}
                            minZoom={13}
                            maxZoom={19}
                            scrollWheelZoom
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <ScaleControl position="bottomleft" />
                            <FitPopulation points={visibleInfants} boundaryData={barangayBoundaryData} />

                            {barangayBoundaryData && (
                                <GeoJSON
                                    key={`admin-population-boundary-${assignedBarangay}`}
                                    data={barangayBoundaryData}
                                    style={barangayBoundaryStyle}
                                />
                            )}

                            {loading && (
                                <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="h-7 w-7 animate-spin text-emerald-800" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-900">
                                            Loading population map
                                        </p>
                                    </div>
                                </div>
                            )}

                            {visibleInfants.map((infant) => {
                                const meta = getStatusMeta(infant.display_status);
                                return (
                                    <CircleMarker
                                        key={infant.id}
                                        center={[infant.lat, infant.lng]}
                                        radius={infant.display_status === 'defaulter' ? 7 : 6}
                                        pathOptions={{
                                            color: '#ffffff',
                                            fillColor: meta.color,
                                            fillOpacity: 0.88,
                                            weight: 2
                                        }}
                                    >
                                        <Popup>
                                            <div className="text-sm">
                                                <p className="font-black text-slate-950">
                                                    {infant.first_name || 'Infant'} {infant.last_name || ''}
                                                </p>
                                                <p className="font-semibold text-slate-600">{infant.reference_id || infant.id}</p>
                                                <p className="mt-1 text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                                                    {meta.label}
                                                </p>
                                                <p className="mt-1 text-xs font-medium text-slate-500">
                                                    {infant.purok || infant.locality || infant.barangay || assignedBarangay}
                                                </p>
                                            </div>
                                        </Popup>
                                    </CircleMarker>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>
            </section>
        </div>
    );
}
