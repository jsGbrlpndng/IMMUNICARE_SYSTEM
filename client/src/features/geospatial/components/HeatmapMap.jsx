import React, { useEffect, useMemo, memo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, Polygon, useMap, Popup, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import {
    Loader2,
    ArrowRight,
    AlertTriangle,
    MapPin,
    Filter,
    Crosshair,
    Maximize2,
    Minimize2
} from 'lucide-react';
import { computeConvexHull } from '../../../utils/spatialUtils';
import { barangayBoundaryStyle } from '../../../utils/barangayBoundaries';
import { CLINICAL_STATUS, getClinicalStatusMeta, normalizeClinicalStatus } from '../../../utils/clinicalStatus';
import 'leaflet/dist/leaflet.css';

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
                <svg class="clinical-marker-svg clinical-marker-svg--defaulter" width="22" height="22" viewBox="0 0 24 24">
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
                <svg class="clinical-marker-svg clinical-marker-svg--standard" width="16" height="16" viewBox="0 0 24 24">
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
            <div class="clinical-centroid-rank">
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

const MapResizeInvalidator = ({ isExpanded }) => {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize({ animate: false });
        const timer = setTimeout(() => {
            map.invalidateSize({ animate: false });
        }, 100);
        return () => clearTimeout(timer);
    }, [isExpanded, map]);
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
                                    <div className={`clinical-legend-dot clinical-legend-dot--${item.id}`}></div>
                                )}
                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tight">{item.label}</span>
                            </div>
                            <span className={`clinical-legend-count clinical-legend-count--${item.id}`}>
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
    barangayBoundaryData,
    isExpanded,
    setIsExpanded
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
                        <div className="clinical-map-popup-card">
                            {/* Header */}
                            <div className="clinical-map-popup-header">
                                <div className="clinical-map-popup-title-row">
                                    <span className="clinical-map-popup-name">
                                        {formatDisplayName(pt)}
                                    </span>
                                    <span className={`clinical-map-popup-status clinical-map-popup-status--${statusMeta.code.toLowerCase()}`}>
                                        {statusLabel}
                                    </span>
                                </div>
                                <div className="clinical-map-popup-meta">
                                    {formatAge(pt.age_months)} · {pt.reference_id || 'REF-TBD'}
                                </div>
                            </div>

                            {/* Address */}
                            {addressLine && (
                                <div className="clinical-map-popup-address">
                                    <svg className="clinical-map-popup-address-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                                    </svg>
                                    <span className="clinical-map-popup-address-text">{addressLine}</span>
                                </div>
                            )}

                            {/* Directive Logic */}
                            <div className="clinical-map-popup-directive">
                                <div className="clinical-map-popup-directive-label">
                                    Clinical Directive
                                </div>
                                <div className="clinical-map-popup-directive-box">
                                    <p className="clinical-map-popup-directive-text">{pt.clinical_directive || actionText}</p>
                                    <p className="clinical-map-popup-dose-count">
                                        {doseCount} doses pending
                                    </p>
                                </div>
                            </div>

                            {/* Actions Set */}
                            <div className="clinical-map-popup-actions">
                                <button
                                    onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}`}
                                    className="clinical-map-popup-action clinical-map-popup-action--split"
                                >
                                    Profile
                                </button>
                                <button
                                    onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}?tab=schedule`}
                                    className="clinical-map-popup-action"
                                >
                                    Schedule
                                </button>
                            </div>
                            <button
                                onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}?tab=address`}
                                className="clinical-map-popup-validate"
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
            <div className="flex-1 relative overflow-hidden">
                {/* Fullscreen Toggle Button */}
                <button
                    type="button"
                    onClick={() => setIsExpanded(prev => !prev)}
                    className="absolute top-6 left-6 z-[1000] p-2.5 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-2xl rounded-xl hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-center"
                    title={isExpanded ? 'Minimize Map' : 'Maximize Map'}
                >
                    {isExpanded ? <Minimize2 size={16} className="text-slate-800" /> : <Maximize2 size={16} className="text-slate-800" />}
                </button>

                {loading && (
                    <div className="absolute inset-0 bg-white/70 z-[2000] flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="text-[#084C39] animate-spin" size={28} />
                            <p className="text-[10px] font-black text-[#084C39] uppercase tracking-widest">Updating Triage...</p>
                        </div>
                    </div>
                )}

                <MapContainer
                    center={[14.3596, 121.0426]}
                    zoom={16}
                    className="z-0 h-full w-full"
                    zoomControl={false}
                    trackResize={true}
                >
                    <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution="Tiles &copy; Esri"
                        maxZoom={19}
                    />
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                        attribution="&copy; CARTO"
                        maxZoom={19}
                        zIndex={650}
                    />

                    <MapResizeHandle />
                    <MapResizeInvalidator isExpanded={isExpanded} />
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
