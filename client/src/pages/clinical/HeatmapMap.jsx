import React, { useEffect, useMemo, memo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, Polygon, useMap, Popup, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import {
    Loader2,
    ArrowRight,
    AlertTriangle,
    MapPin,
    Filter,
    Crosshair
} from 'lucide-react';
import { computeConvexHull } from '../../utils/spatialUtils';
import { barangayBoundaryStyle } from '../../utils/barangayBoundaries';
import { CLINICAL_STATUS, getClinicalStatusMeta, normalizeClinicalStatus } from '../../utils/clinicalStatus';
import 'leaflet/dist/leaflet.css';

// --- CSS Override for CDSS Popup ---
const mapStyles = `
    .clinical-cdss-popup .leaflet-popup-content-wrapper {
        padding: 0 !important;
        border-radius: 0.5rem !important;
        overflow: hidden !important;
        background: transparent !important;
        box-shadow: 0 4px 24px rgba(0,0,0,0.15) !important;
        border: 1px solid #e2e8f0 !important;
    }
    .clinical-cdss-popup .leaflet-popup-content {
        margin: 0 !important;
        width: 280px !important;
    }
    .clinical-cdss-popup .leaflet-popup-tip-container {
        display: none !important;
    }
    .leaflet-control-zoom { display: none; }
    .custom-centroid-icon { background: none !important; border: none !important; }
    .custom-div-icon { background: none !important; border: none !important; }
`;

// --- Helper: coordinate validation ---
const isValidCoordinate = (lat, lng) =>
    lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && lat !== 0;

const toMapFloat = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
};

// --- Clinical Icon Factory ---
const createClinicalIcon = (color, urgency, computed_map_status) => {
    let html = '';
    let size = [16, 16];
    let anchor = [8, 8];

    // Normalize parameters in case it's a single argument call where color = urgency
    let actualUrgency = urgency || (['DEFAULTER', 'defaulter', 'DEFAULTED', 'overdue', 'due_today', 'upcoming', 'on_track', 'completed', 'due_soon'].includes(color) ? color : null);
    let actualColor = actualUrgency === color ? null : color;

    // Force exact matching for Leaflet marker colors based on computed_map_status.
    // 4 fully independent states — must not bundle or derive one from another.
    const markerColor = getClinicalStatusMeta({
        computed_map_status,
        urgency: actualUrgency
    }).colorHex || actualColor || '#94A3B8';

    if (normalizeClinicalStatus({ computed_map_status, urgency: actualUrgency }) === 'DEFAULTED') {
        // Elevated diamond for defaulters.
        html = `
            <div class="flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" style="filter: drop-shadow(0 4px 8px rgba(239,68,68,0.6))">
                    <path d="M12 2L2 12l10 10 10-10L12 2z" fill="${markerColor}" stroke="#fff" stroke-width="3" />
                </svg>
            </div>
        `;
        size = [22, 22];
        anchor = [11, 11];
    } else {
        // Standard circle for all other states
        html = `
            <div class="flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2))">
                    <circle cx="12" cy="12" r="10" fill="${markerColor}" stroke="#fff" stroke-width="3" />
                </svg>
            </div>
        `;
        size = [16, 16];
        anchor = [8, 8];
    }

    return new L.divIcon({
        html,
        className: 'custom-div-icon',
        iconSize: size,
        iconAnchor: anchor
    });
};

const createCentroidIcon = (rank) => {
    return new L.divIcon({
        html: `
            <div style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;background:#0f172a;border:3px solid #fff;box-shadow:0 8px 16px rgba(0,0,0,0.4);color:#fff;font-weight:900;font-size:18px;font-family:system-ui,sans-serif;letter-spacing:-1px;">
                ${rank}
            </div>
        `,
        className: 'custom-centroid-icon',
        iconSize: L.point(42, 42),
        iconAnchor: L.point(21, 21)
    });
};

// --- Internal Helper Components ---
const MapController = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target && isValidCoordinate(target.lat, target.lng)) {
            if (target.bounds && target.bounds.length === 2) {
                map.fitBounds(target.bounds, { padding: [50, 50], maxZoom: 18 });
            } else {
                map.flyTo([target.lat, target.lng], 18, { duration: 1.0 });
            }
        }
    }, [target, map]);
    return null;
};

const MapZoomListener = ({ onZoomChange }) => {
    const map = useMap();
    useEffect(() => {
        const handleZoom = () => onZoomChange(map.getZoom());
        map.on('zoomend', handleZoom);
        return () => map.off('zoomend', handleZoom);
    }, [map, onZoomChange]);
    return null;
};

const MapResizeHandle = () => {
    const map = useMap();
    const resizeObserverRef = useRef(null);

    useEffect(() => {
        const container = map.getContainer();
        if (!container) return;

        const timer = setTimeout(() => { map.invalidateSize(); }, 100);

        resizeObserverRef.current = new ResizeObserver(() => {
            map.invalidateSize({ animate: false });
        });
        resizeObserverRef.current.observe(container);

        return () => {
            clearTimeout(timer);
            if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
        };
    }, [map]);

    return null;
};

const AutoBounds = ({ points, selectedInfantId, mapTarget, mode, resetViewFlag }) => {
    const map = useMap();
    const hasAutoBounded = useRef(null);
    const lastResetViewFlag = useRef(0);

    useEffect(() => {
        const isModeChange = hasAutoBounded.current !== mode;
        const isResetTriggered = resetViewFlag !== lastResetViewFlag.current;

        if (isModeChange) hasAutoBounded.current = null;
        if (!isModeChange && !isResetTriggered) return;
        if ((selectedInfantId || mapTarget) && !isResetTriggered) return;

        if (points && points.length > 0) {
            const validPoints = points.filter(p => isValidCoordinate(p.lat, p.lng));
            if (validPoints.length > 0) {
                const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                hasAutoBounded.current = mode;
                lastResetViewFlag.current = resetViewFlag;
            }
        }
    }, [points, map, selectedInfantId, mapTarget, mode, resetViewFlag]);

    return null;
};

// --- Popup content helper ---
const buildAddressLine = (pt) => {
    if (pt.exact_address) {
        // Trim the long tail (country/province) — keep just street + purok
        const parts = pt.exact_address.split(',');
        return parts.slice(0, 2).join(',').trim();
    }
    if (pt.purok) return `Purok ${pt.purok}`;
    if (pt.locality) return pt.locality;
    return null;
};

// Compute the true geometric centroid of the convex hull (average of vertices)
// This places the rank label at the visual center of the polygon, never on an infant dot.
const computeHullCentroid = (hullPoints) => {
    if (!hullPoints || hullPoints.length === 0) return null;
    const sumLat = hullPoints.reduce((s, p) => s + p[0], 0);
    const sumLng = hullPoints.reduce((s, p) => s + p[1], 0);
    return { lat: sumLat / hullPoints.length, lng: sumLng / hullPoints.length };
};

const InteractiveLegendHUD = ({ activeFilters, setActiveFilters, derivedCounts }) => {
    const toggleGroup = (statuses) => {
        setActiveFilters(prev => {
            const allActive = statuses.every(s => prev.statuses.includes(s));
            const nextStatuses = allActive
                ? prev.statuses.filter(s => !statuses.includes(s))
                : [...new Set([...prev.statuses, ...statuses])];
            return { ...prev, statuses: nextStatuses };
        });
    };

    // 4 fully independent legend items — each maps to a distinct clinical state.
    // Toggling one group NEVER affects the visibility of any other group.
    const legendItems = [
        {
            id: 'defaulter_group',
            statuses: ['defaulter'],
            label: getClinicalStatusMeta(CLINICAL_STATUS.DEFAULTED).label,
            color: getClinicalStatusMeta(CLINICAL_STATUS.DEFAULTED).colorHex,
            icon: 'diamond',
            count: derivedCounts.total_defaulters ?? derivedCounts.mappedDefaulter ?? 0
        },
        {
            id: 'due_group',
            statuses: ['due_soon'],
            label: getClinicalStatusMeta(CLINICAL_STATUS.DUE_SOON).label,
            color: getClinicalStatusMeta(CLINICAL_STATUS.DUE_SOON).colorHex,
            icon: 'circle',
            count: derivedCounts.total_due_soon ?? derivedCounts.mappedDueSoon ?? 0
        },
        {
            id: 'on_track_group',
            statuses: ['on_track'],
            label: getClinicalStatusMeta(CLINICAL_STATUS.UP_TO_DATE).label,
            color: getClinicalStatusMeta(CLINICAL_STATUS.UP_TO_DATE).colorHex,
            icon: 'circle',
            count: derivedCounts.total_on_track ?? 0
        },
        {
            id: 'completed_group',
            statuses: ['completed'],
            label: getClinicalStatusMeta(CLINICAL_STATUS.FULLY_IMMUNIZED).label,
            color: getClinicalStatusMeta(CLINICAL_STATUS.FULLY_IMMUNIZED).colorHex,
            icon: 'circle',
            count: derivedCounts.total_completed ?? 0
        },
    ];

    return (
        <div className="absolute top-6 right-6 z-[1000] bg-white/95 backdrop-blur-sm border border-slate-200 shadow-2xl rounded-2xl p-4 flex flex-col gap-3 min-w-[210px]">
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                <Filter size={12} /> Map Visibility
            </h5>
            
            <div className="flex flex-col gap-1.5">
                {legendItems.map(item => {
                    const isActive = item.statuses.some(s => activeFilters.statuses.includes(s));
                    return (
                        <div
                            key={item.id}
                            onClick={() => toggleGroup(item.statuses)}
                            className={`flex items-center justify-between gap-4 p-2.5 rounded-xl transition-all cursor-pointer ${
                                isActive ? 'bg-slate-50 border border-slate-100' : 'opacity-40 hover:opacity-60'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {item.icon === 'diamond' ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24">
                                        <path d="M12 2L2 12l10 10 10-10L12 2z" fill={item.color} />
                                    </svg>
                                ) : (
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                                )}
                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{item.label}</span>
                            </div>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${item.color}20`, color: item.color }}>
                                {item.count}
            </span>
                        </div>
                    );
                })}
            </div>
            <div className="border-t border-slate-100 pt-2">
                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest text-center">Click to toggle layer</p>
            </div>
        </div>
    );
};


// --- Memoized Main Component ---
const HeatmapMap = memo(({
    allMarkersForMode,
    mode,
    mapState,
    mapTarget,
    setCurrentZoom,
    selectedInfantId,
    setSelectedInfantId,
    normalizeCoords,
    formatDisplayName,
    formatAge,
    loading,
    resetViewFlag,
    markerRefsCallback,
    activeFilters,
    setActiveFilters,
    derivedCounts,
    barangayBoundaryData
}) => {
    const validMarkers = useMemo(() => {
        return (allMarkersForMode || []).map(pt => {
            const coords = normalizeCoords(pt);
            return { ...pt, displayLat: toMapFloat(coords.lat), displayLng: toMapFloat(coords.lng) };
        }).filter(pt => isValidCoordinate(pt.displayLat, pt.displayLng));
    }, [allMarkersForMode, normalizeCoords]);

    const validClusters = useMemo(() => {
        return (mapState?.clusters || [])
            .map(cluster => ({
                ...cluster,
                lat: toMapFloat(cluster.lat),
                lng: toMapFloat(cluster.lng),
                points: (cluster.points || []).map(point => ({
                    ...point,
                    lat: toMapFloat(point.lat),
                    lng: toMapFloat(point.lng)
                }))
            }))
            .filter(c => isValidCoordinate(c.lat, c.lng));
    }, [mapState?.clusters]);

    // Collect marker refs so parent can open a popup imperatively
    const markerRefs = useRef({});
    const collectRef = useCallback((id, ref) => {
        if (ref) markerRefs.current[id] = ref;
    }, []);

    // Expose refs map to parent via callback
    useEffect(() => {
        if (markerRefsCallback) markerRefsCallback(markerRefs);
    }, [markerRefsCallback]);

    const renderedMarkers = useMemo(() => {
        return validMarkers.map(pt => {
            const doseCount = (pt.vaccination_needs || []).length;
            const addressLine = buildAddressLine(pt);

            const statusMeta = getClinicalStatusMeta(pt);
            let statusLabel = statusMeta.label;
            let statusColor = statusMeta.colorHex;
            let actionText = 'Routine Clinical Follow-Up';

            if (statusMeta.code === 'DEFAULTED') {
                const vaccine = doseCount > 0 ? (pt.vaccination_needs[0].vaccine_name || pt.vaccination_needs[0].vaccine_code) : null;
                actionText = vaccine ? `Urgent: Administer ${vaccine}` : 'Urgent Follow-Up Required';
            } else if (statusMeta.code === 'DUE_SOON') {
                const vaccine = doseCount > 0 ? (pt.vaccination_needs[0].vaccine_name || pt.vaccination_needs[0].vaccine_code) : null;
                actionText = vaccine ? `Prepare ${vaccine}` : 'Prepare Next Dose';
            } else if (statusMeta.code === 'UP_TO_DATE') {
                actionText = pt.next_due_vaccine ? `Next Due: ${pt.next_due_vaccine}` : 'Schedule Maintained';
            } else if (statusMeta.code === 'FULLY_IMMUNIZED') {
                actionText = 'Fully Immunized (Current Phase)';
            } else if (statusMeta.code === 'OVERDUE') {
                actionText = 'Overdue follow-up required';
            } else if (statusMeta.code === 'INCOMPLETE') {
                actionText = 'Registration or validation incomplete';
            }

            return (
                <Marker
                    key={pt.id}
                    ref={(r) => collectRef(pt.id, r)}
                    position={[pt.displayLat, pt.displayLng]}
                    icon={createClinicalIcon(pt.marker_color, pt.urgency, pt.computed_map_status)}
                    zIndexOffset={pt.computed_map_status === 'DEFAULTER' || pt.urgency === 'defaulter' ? 5000 : (pt.computed_map_status === 'DUE_SOON' ? 4000 : 1000)}
                    eventHandlers={{
                        click: () => setSelectedInfantId(pt.id)
                    }}
                >
                    <Popup className="clinical-cdss-popup" closeButton={false}>
                        <div style={{ width: 280, background: '#fff', fontFamily: 'system-ui,sans-serif' }}>
                            {/* Header */}
                            <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {formatDisplayName(pt)}
                                    </span>
                                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: statusColor }}>
                                        {statusLabel}
                                    </span>
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {formatAge(pt.age_months)} · {pt.reference_id || 'REF-TBD'}
                                </div>
                            </div>

                            {/* Address */}
                            {addressLine && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 14px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                                    </svg>
                                    <span style={{ fontSize: 11, color: '#475569', fontWeight: 600, lineHeight: 1.4 }}>{addressLine}</span>
                                </div>
                            )}

                            {/* Directive Logic */}
                            <div style={{ padding: '12px 14px', background: '#fff' }}>
                                <div style={{ fontSize: 9, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>
                                    Clinical Directive
                                </div>
                                <div style={{ background: '#f0f9ff', borderLeft: '4px solid #0369a1', padding: '10px 12px', borderRadius: '0 8px 8px 0' }}>
                                    <p style={{ fontSize: 12, fontWeight: 900, color: '#0c4a6e', margin: 0, lineHeight: 1.3 }}>{pt.clinical_directive || actionText}</p>
                                    <p style={{ fontSize: 10, color: '#0369a1', margin: '4px 0 0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {doseCount} doses pending
                                    </p>
                                </div>
                            </div>

                            {/* Actions Set */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #f1f5f9' }}>
                                <button
                                    onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}`}
                                    style={{ padding: '14px', background: '#fff', color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', borderRight: '1px solid #f1f5f9', cursor: 'pointer' }}
                                >
                                    Profile
                                </button>
                                <button
                                    onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}?tab=schedule`}
                                    style={{ padding: '14px', background: '#fff', color: '#0f172a', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', cursor: 'pointer' }}
                                >
                                    Schedule
                                </button>
                            </div>
                            <button
                                onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}?tab=address`}
                                style={{ width: '100%', padding: '14px', background: '#059669', color: '#fff', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', border: 'none', cursor: 'pointer' }}
                            >
                                Validate Address
                            </button>
                        </div>
                    </Popup>
                </Marker>
            );
        });
    }, [validMarkers, formatDisplayName, formatAge, setSelectedInfantId, collectRef]);

    return (
        <div className="h-full w-full flex flex-col relative bg-white">
            <style dangerouslySetInnerHTML={{ __html: mapStyles }} />

            <div className="flex-1 relative overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 bg-white/70 z-[2000] flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="text-emerald-700 animate-spin" size={28} />
                            <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">Updating Triage...</p>
                        </div>
                    </div>
                )}

                <MapContainer
                    center={[14.3596, 121.0426]}
                    zoom={16}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                    zoomControl={false}
                    trackResize={true}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        maxZoom={19}
                    />

                    <MapResizeHandle />
                    <MapController target={mapTarget} />
                    <MapZoomListener onZoomChange={setCurrentZoom} />
                    <AutoBounds
                        points={validMarkers.map(pt => ({ lat: pt.displayLat, lng: pt.displayLng }))}
                        selectedInfantId={selectedInfantId}
                        mapTarget={mapTarget}
                        mode={mode}
                        resetViewFlag={resetViewFlag}
                    />

                    <ScaleControl position="bottomleft" />

                    {barangayBoundaryData && (
                        <GeoJSON
                            key="barangay-boundary"
                            data={barangayBoundaryData}
                            style={barangayBoundaryStyle}
                        />
                    )}

                    {/* Priority Area Polygons + Area Labels */}
                    {mode === 'priority' && validClusters.map((cluster, i) => {
                        const hullPoints = computeConvexHull(cluster.points || []);

                        let color = '#e11d48';
                        if (cluster.severity === 'medium') color = '#f59e0b';
                        if (cluster.severity === 'low') color = '#64748b';

                        return (
                            <React.Fragment key={`hotspot-${i}`}>
                                {hullPoints.length >= 3 && (
                                    <Polygon
                                        positions={hullPoints}
                                        pathOptions={{ color, fillColor: color, fillOpacity: 0.08, weight: 2, dashArray: '8, 6' }}
                                    />
                                )}

                            </React.Fragment>
                        );
                    })}

                    {renderedMarkers}
                </MapContainer>

                <InteractiveLegendHUD 
                    activeFilters={activeFilters} 
                    setActiveFilters={setActiveFilters} 
                    derivedCounts={derivedCounts}
                />
            </div>
        </div>
    );
});

export default HeatmapMap;
