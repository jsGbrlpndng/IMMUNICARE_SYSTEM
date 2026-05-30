import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Polygon, Popup, ScaleControl, useMap } from 'react-leaflet';
import { ClipboardList, MapPinned, ShieldCheck, UserRoundCheck } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { getBarangayCenter } from '../../utils/barangayConfig';
import { barangayBoundaryStyle, getBarangayBoundaryGeoJson } from '../../utils/barangayBoundaries';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';

const CLUSTER_COLORS = ['#0f766e', '#16a34a', '#d97706', '#dc2626', '#2563eb'];

const normalizeBarangay = (value) => (value || 'LANGGAM').trim().toUpperCase();

const toFloat = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getClusterId = (cluster, index) => cluster?.clusterId || cluster?.id || `area-${index + 1}`;

const getClusterCount = (cluster) => Number(cluster?.infant_count || cluster?.total_infants || cluster?.count || 0);

const getClusterStatus = (cluster) => {
    if (cluster?.status) return cluster.status;
    if (cluster?.severity === 'critical' || cluster?.severity === 'high') return 'Requires Intervention';
    return 'Follow-up in Progress';
};

const getClusterCenter = (cluster) => {
    const clusterPoints = (cluster?.points || [])
        .map(getPointCenter)
        .filter(Boolean);

    if (clusterPoints.length > 0) {
        const totals = clusterPoints.reduce(
            (acc, point) => ({
                lat: acc.lat + point[0],
                lng: acc.lng + point[1],
            }),
            { lat: 0, lng: 0 }
        );

        return [
            totals.lat / clusterPoints.length,
            totals.lng / clusterPoints.length,
        ];
    }

    const lat = toFloat(cluster?.lat ?? cluster?.centroid_latitude);
    const lng = toFloat(cluster?.lng ?? cluster?.centroid_longitude);
    if (lat == null || lng == null) return null;
    return [lat, lng];
};

const getClusterBounds = (cluster) => {
    if (Array.isArray(cluster?.bounds)) return cluster.bounds;
    if (typeof cluster?.bounds === 'string') {
        try {
            const parsed = JSON.parse(cluster.bounds);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
};

const getPointCenter = (point) => {
    const lat = toFloat(point?.lat);
    const lng = toFloat(point?.lng);
    if (lat == null || lng == null) return null;
    return [lat, lng];
};

const computeConvexHull = (points) => {
    const mappedPoints = (points || [])
        .map((point) => ({ ...point, lat: toFloat(point?.lat), lng: toFloat(point?.lng) }))
        .filter((point) => point.lat != null && point.lng != null);

    if (mappedPoints.length < 3) return mappedPoints.map((point) => [point.lat, point.lng]);

    const sorted = [...mappedPoints].sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));
    const cross = (origin, a, b) => (a.lng - origin.lng) * (b.lat - origin.lat) - (a.lat - origin.lat) * (b.lng - origin.lng);
    const lower = [];
    const upper = [];

    sorted.forEach((point) => {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    });

    [...sorted].reverse().forEach((point) => {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    });

    lower.pop();
    upper.pop();
    return lower.concat(upper).map((point) => [point.lat, point.lng]);
};

const isValidBounds = (bounds) => (
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    Array.isArray(bounds[0]) &&
    Array.isArray(bounds[1]) &&
    bounds[0].every((value) => Number.isFinite(Number(value))) &&
    bounds[1].every((value) => Number.isFinite(Number(value)))
);

const FlyToCluster = ({ cluster }) => {
    const map = useMap();

    useEffect(() => {
        if (!cluster) return;

        const bounds = getClusterBounds(cluster);
        if (isValidBounds(bounds)) {
            map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 18, duration: 0.8 });
            return;
        }

        const center = getClusterCenter(cluster);
        if (center) {
            map.flyTo(center, 18, { duration: 0.8 });
        }
    }, [cluster, map]);

    return null;
};

export default function AdminSpatialMap() {
    const { user } = useAuth();
    const [spatialData, setSpatialData] = useState({
        barangay: '',
        cluster_count: 0,
        defaulters_in_clusters: 0,
        clusters: [],
        active_staff: [],
        bhw_options: [],
        midwife_options: []
    });
    const [selectedClusterId, setSelectedClusterId] = useState(null);
    const [assigningIds, setAssigningIds] = useState({});
    const [pendingAssignments, setPendingAssignments] = useState({});
    const [assignmentMessages, setAssignmentMessages] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const assignedBarangay = normalizeBarangay(spatialData.barangay || user?.assigned_barangay || user?.assignedBarangay || user?.barangay || user?.locality);
    const barangayCenter = getBarangayCenter(assignedBarangay);
    const barangayBoundaryData = getBarangayBoundaryGeoJson(assignedBarangay);

    useEffect(() => {
        let active = true;

        const loadSpatialData = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await apiClient.get('/admin/spatial/deployments');
                const payload = response.ok ? await response.json() : {};

                if (!response.ok) {
                    console.error('[ADMIN_SPATIAL_ANALYSIS] request failed', {
                        status: response.status,
                        statusText: response.statusText,
                        payload
                    });
                    if (active) setError('Unable to load field deployment areas.');
                    return;
                }

                const clusters = Array.isArray(payload?.deployments)
                    ? payload.deployments
                    : (Array.isArray(payload?.clusters) ? payload.clusters : []);
                if (active) {
                    setSpatialData({
                        barangay: payload?.barangay || '',
                        cluster_count: Number(payload?.cluster_count || clusters.length || 0),
                        defaulters_in_clusters: Number(payload?.defaulters_in_clusters || clusters.reduce((sum, cluster) => sum + getClusterCount(cluster), 0)),
                        clusters,
                        active_staff: payload?.active_staff || [],
                        bhw_options: payload?.active_bhws || payload?.bhw_options || [],
                        midwife_options: payload?.active_midwives || payload?.midwife_options || []
                    });
                    setSelectedClusterId((current) => current || (clusters[0] ? getClusterId(clusters[0], 0) : null));
                }
            } catch (requestError) {
                console.error('[ADMIN_SPATIAL_ANALYSIS]', requestError);
                if (active) setError('Unable to load field deployment areas.');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadSpatialData();
        return () => {
            active = false;
        };
    }, []);

    const saveAssignment = async (assignmentId) => {
        const staffId = pendingAssignments[assignmentId];
        if (!assignmentId || !staffId) return;
        setAssigningIds((prev) => ({ ...prev, [assignmentId]: true }));
        setAssignmentMessages((prev) => ({ ...prev, [assignmentId]: '' }));
        try {
            const response = await apiClient.put(`/admin/spatial/deployments/${assignmentId}/assign`, {
                assigned_staff_id: staffId
            });
            const payload = response.ok ? await response.json() : {};
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to assign field staff');
            }

            setSpatialData((prev) => ({
                ...prev,
                clusters: (prev.clusters || []).map((cluster) => (
                    cluster.id === assignmentId
                        ? {
                            ...cluster,
                            assigned_bhw_id: payload?.assignment?.assigned_bhw_id || staffId,
                            assigned_staff_id: payload?.assignment?.assigned_staff_id || staffId,
                            assigned_user_name: payload?.assignment?.assigned_user_name || payload?.assigned_staff?.full_name || cluster.assigned_user_name,
                            assigned_user_role: payload?.assignment?.assigned_user_role || payload?.assigned_staff?.role || cluster.assigned_user_role,
                            assigned_bhw_name: payload?.assignment?.assigned_user_name || payload?.assigned_staff?.full_name || cluster.assigned_bhw_name,
                            status: payload?.assignment?.status || 'Pending'
                        }
                        : cluster
                ))
            }));
            setAssignmentMessages((prev) => ({ ...prev, [assignmentId]: 'Assignment Saved' }));
            window.setTimeout(() => {
                setAssignmentMessages((prev) => {
                    const next = { ...prev };
                    delete next[assignmentId];
                    return next;
                });
            }, 2600);
        } catch (assignError) {
            console.error('[ADMIN_CLUSTER_ASSIGNMENT]', assignError);
            setAssignmentMessages((prev) => ({
                ...prev,
                [assignmentId]: assignError.message || 'Unable to save assignment.'
            }));
        } finally {
            setAssigningIds((prev) => ({ ...prev, [assignmentId]: false }));
        }
    };

    const clusters = spatialData.clusters || [];
    const selectedCluster = useMemo(
        () => clusters.find((cluster, index) => getClusterId(cluster, index) === selectedClusterId) || null,
        [clusters, selectedClusterId]
    );

    const totalInfants = clusters.reduce((sum, cluster) => sum + getClusterCount(cluster), 0);
    const activeBhws = spatialData.bhw_options || [];
    const activeMidwives = spatialData.midwife_options || [];
    const activeStaffCount = activeBhws.length + activeMidwives.length;

    return (
        <div className="space-y-6 p-5 lg:p-8">
            <section className="bg-[#166534] text-white border border-[#14532d] rounded-sm shadow-sm">
                <div className="px-8 py-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100">San Pedro Field Operations</p>
                        <h1 className="mt-3 text-3xl font-black tracking-tight">Admin Spatial Analysis</h1>
                        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-emerald-50">
                            Field deployment view for {assignedBarangay}. Results are bounded to the assigned barangay map extent.
                        </p>
                    </div>
                    <div className="border border-emerald-400/30 bg-emerald-950/20 px-5 py-4">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">Active Areas</p>
                        <p className="mt-1 text-3xl font-black">{loading ? '...' : spatialData.cluster_count}</p>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-6 py-5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-emerald-50 text-emerald-700">
                                <ClipboardList className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Field Deployment & Triage</p>
                                <h2 className="text-base font-black text-slate-950">Priority Outreach Areas</h2>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 px-6 py-6">
                        <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 p-4">
                            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-800" />
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider text-emerald-900">
                                    Standardized Cluster Detection (Min. 3 Infants)
                                </p>
                                <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">
                                    System-wide detection rules are locked for consistent field planning.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Active Areas</p>
                                <p className="mt-2 text-2xl font-black text-slate-950">{loading ? '...' : clusters.length}</p>
                            </div>
                            <div className="border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Defaulters</p>
                                <p className="mt-2 text-2xl font-black text-slate-950">{loading ? '...' : totalInfants}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {loading ? (
                                <p className="border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                                    Loading active field areas...
                                </p>
                            ) : error ? (
                                <p className="border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm font-bold text-rose-700">
                                    {error}
                                </p>
                            ) : clusters.length === 0 ? (
                                <p className="border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-bold text-slate-500">
                                    No priority outreach areas detected.
                                </p>
                            ) : (
                                clusters.map((cluster, index) => {
                                    const clusterId = getClusterId(cluster, index);
                                    const active = clusterId === selectedClusterId;
                                    const count = getClusterCount(cluster);
                                    const status = getClusterStatus(cluster);
                                    const currentAssignedStaffId = cluster?.assigned_bhw_id || '';
                                    const pendingStaffId = pendingAssignments[cluster.id] ?? currentAssignedStaffId;
                                    const assignmentChanged = pendingStaffId && pendingStaffId !== currentAssignedStaffId;
                                    const message = assignmentMessages[cluster.id];

                                    return (
                                        <div
                                            key={clusterId}
                                            className={`w-full border text-left transition ${
                                                active
                                                    ? 'border-emerald-800 bg-emerald-50'
                                                    : 'border-slate-200 bg-white hover:border-emerald-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setSelectedClusterId(clusterId)}
                                                className="w-full px-4 py-4 text-left"
                                            >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-950">
                                                        {cluster?.cluster_label || cluster?.locality || `Priority Area ${index + 1}`}
                                                    </p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                                        {count} defaulters in this area
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 rounded-sm px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
                                                    status === 'Requires Intervention'
                                                        ? 'bg-rose-50 text-rose-700'
                                                        : 'bg-amber-50 text-amber-700'
                                                }`}>
                                                    {status}
                                                </span>
                                            </div>
                                            </button>
                                            <div className="mx-4 mb-4 border-t border-slate-200 pt-3">
                                            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                                                <UserRoundCheck className="h-4 w-4 text-emerald-700" />
                                                Assigned: {cluster?.assigned_user_name || cluster?.assigned_bhw_name || 'Pending assignment'}
                                                {cluster?.assigned_user_role ? ` (${cluster.assigned_user_role})` : ''}
                                            </div>
                                            <select
                                                value={pendingStaffId}
                                                disabled={Boolean(assigningIds[cluster.id]) || activeStaffCount === 0}
                                                onChange={(event) => {
                                                    setPendingAssignments((prev) => ({
                                                        ...prev,
                                                        [cluster.id]: event.target.value
                                                    }));
                                                    setAssignmentMessages((prev) => ({
                                                        ...prev,
                                                        [cluster.id]: ''
                                                    }));
                                                }}
                                                className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none transition focus:border-emerald-800 disabled:bg-slate-100 disabled:text-slate-400"
                                            >
                                                <option value="">
                                                    {activeStaffCount ? 'Select deployment staff' : 'No active staff available'}
                                                </option>
                                                {activeBhws.length > 0 && (
                                                    <optgroup label="Assign BHW (Mobilization)">
                                                        {activeBhws.map((bhw) => (
                                                            <option key={bhw.id} value={bhw.id}>
                                                                {bhw.full_name || bhw.id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {activeMidwives.length > 0 && (
                                                    <optgroup label="Deploy Midwife (Mobile Clinic)">
                                                        {activeMidwives.map((midwife) => (
                                                            <option key={midwife.id} value={midwife.id}>
                                                                {midwife.full_name || midwife.id}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>
                                            <div className="mt-3 flex flex-col gap-2">
                                                <button
                                                    type="button"
                                                    disabled={!pendingStaffId || !assignmentChanged || Boolean(assigningIds[cluster.id])}
                                                    onClick={() => saveAssignment(cluster.id)}
                                                    className="inline-flex w-full items-center justify-center rounded-sm bg-[#084C39] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#07362A] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                                                >
                                                    {assigningIds[cluster.id] ? 'Saving Assignment...' : 'Save Assignment'}
                                                </button>
                                                {message && (
                                                    <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${
                                                        message === 'Assignment Saved' ? 'text-emerald-800' : 'text-rose-700'
                                                    }`}>
                                                        {message}
                                                    </p>
                                                )}
                                            </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </aside>

                <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Assigned Barangay Boundary</p>
                            <h2 className="text-xl font-black text-slate-950">{assignedBarangay} Field Deployment Map</h2>
                        </div>
                        <div className="inline-flex items-center gap-2 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
                            <MapPinned className="h-4 w-4" />
                            Strict Barangay Scope
                        </div>
                    </div>

                    <div className="h-[660px] w-full">
                        <MapContainer
                            center={[barangayCenter.lat, barangayCenter.lng]}
                            zoom={barangayCenter.zoom || 16}
                            minZoom={15}
                            maxZoom={19}
                            scrollWheelZoom
                            style={{ height: '100%', width: '100%' }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <FlyToCluster cluster={selectedCluster} />
                            <ScaleControl position="bottomleft" />

                            {barangayBoundaryData && (
                                <GeoJSON
                                    key={`barangay-boundary-${assignedBarangay}`}
                                    data={barangayBoundaryData}
                                    style={barangayBoundaryStyle}
                                />
                            )}

                            {clusters.map((cluster, index) => {
                                const clusterId = getClusterId(cluster, index);
                                const active = clusterId === selectedClusterId;
                                const color = active ? '#dc2626' : CLUSTER_COLORS[index % CLUSTER_COLORS.length];
                                const hull = computeConvexHull(cluster.points || []);

                                return (
                                    <React.Fragment key={clusterId}>
                                        {hull.length >= 3 && (
                                            <Polygon
                                                positions={hull}
                                                pathOptions={{
                                                    color,
                                                    fillColor: color,
                                                    fillOpacity: active ? 0.22 : 0.14,
                                                    weight: active ? 4 : 3,
                                                }}
                                                eventHandlers={{ click: () => setSelectedClusterId(clusterId) }}
                                            >
                                                <Popup>
                                                    <div className="text-sm">
                                                        <p className="font-black text-slate-950">{cluster?.cluster_label || cluster?.locality || `Priority Area ${index + 1}`}</p>
                                                        <p className="font-semibold text-slate-600">{getClusterCount(cluster)} defaulters require follow-up</p>
                                                        <p className="mt-1 text-xs font-semibold text-slate-500">
                                                            Assigned: {cluster?.assigned_user_name || cluster?.assigned_bhw_name || 'Pending'}
                                                            {cluster?.assigned_user_role ? ` (${cluster.assigned_user_role})` : ''}
                                                        </p>
                                                    </div>
                                                </Popup>
                                            </Polygon>
                                        )}
                                        {(cluster.points || []).map((point) => {
                                            const pointCenter = getPointCenter(point);
                                            if (!pointCenter) return null;
                                            return (
                                                <CircleMarker
                                                    key={`${clusterId}-${point.id}`}
                                                    center={pointCenter}
                                                    radius={6}
                                                    pathOptions={{
                                                        color: '#ffffff',
                                                        fillColor: color,
                                                        fillOpacity: 0.82,
                                                        weight: 2,
                                                    }}
                                                >
                                                    <Popup>
                                                        <div className="text-sm">
                                                            <p className="font-black text-slate-950">{point.reference_id || point.id}</p>
                                                            <p className="font-semibold text-slate-700">{point.first_name || 'Infant'} {point.last_name || ''}</p>
                                                            <p className="text-xs font-medium text-slate-500">{point.purok || cluster?.locality || assignedBarangay}</p>
                                                        </div>
                                                    </Popup>
                                                </CircleMarker>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>
            </section>
        </div>
    );
}
