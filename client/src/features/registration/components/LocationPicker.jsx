import React from 'react';
import { AlertTriangle, Loader2, MapPin, Maximize2, Minimize2, Search } from 'lucide-react';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { barangayBoundaryStyle, getBarangayBoundaryGeoJson } from '../../../utils/barangayBoundaries';
import { normalizeBarangayDisplay, normalizeBarangayKey } from '../../../utils/barangayCanonical';
import { InputWrapper, inputClasses } from './FormComponents';

const SAN_PEDRO_CENTER = [14.3596, 121.0426];
const BARANGAY_CENTERS = {
    'BAGONG SILANG': { lat: 14.3357, lng: 121.0265 },
    CALENDOLA: { lat: 14.3416, lng: 121.0345 },
    ESTRELLA: { lat: 14.3350, lng: 121.0195 },
    GSIS: { lat: 14.3504, lng: 121.0399 },
    LANGGAM: { lat: 14.3261, lng: 121.0179 },
    LARAM: { lat: 14.3293, lng: 121.0232 },
    MAGSAYSAY: { lat: 14.3372, lng: 121.0332 },
    NARRA: { lat: 14.3312, lng: 121.0259 },
    RIVERSIDE: { lat: 14.3290, lng: 121.0270 },
    SAMPAGUITA: { lat: 14.3443, lng: 121.0353 },
    UB: { lat: 14.3335, lng: 121.0245 },
    UBL: { lat: 14.3325, lng: 121.0205 },
    MUNICIPALITY: { lat: 14.3596, lng: 121.0426 }
};

const SAN_PEDRO_BOUNDS = [
    [14.30, 120.99],
    [14.39, 121.08]
];

const toDecimalFloat = (value) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(8)) : null;
};

const hasValidCoordinate = (lat, lng) => {
    const latitude = toDecimalFloat(lat);
    const longitude = toDecimalFloat(lng);

    return (
        latitude !== null &&
        longitude !== null &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180 &&
        latitude !== 0 &&
        longitude !== 0
    );
};

const getSafeCenter = (center) => (
    hasValidCoordinate(center?.[0], center?.[1])
        ? [toDecimalFloat(center[0]), toDecimalFloat(center[1])]
        : SAN_PEDRO_CENTER
);

const MapController = ({ center, hasPinnedLocation }) => {
    const map = useMap();

    React.useEffect(() => {
        const safeCenter = getSafeCenter(center);
        map.flyTo(safeCenter, hasPinnedLocation ? 17 : 14, { duration: 0.8 });
    }, [center, hasPinnedLocation, map]);

    return null;
};

const BarangayViewportController = ({ assignedBarangay, hasPinnedLocation }) => {
    const map = useMap();

    React.useEffect(() => {
        if (hasPinnedLocation) return;

        const normalizedBarangay = normalizeBarangayKey(assignedBarangay) || 'MUNICIPALITY';
        const center = BARANGAY_CENTERS[normalizedBarangay] || BARANGAY_CENTERS.MUNICIPALITY;
        map.flyTo([center.lat, center.lng], normalizedBarangay === 'MUNICIPALITY' ? 14 : 16, { duration: 0.8 });
    }, [assignedBarangay, hasPinnedLocation, map]);

    return null;
};

const MapResizeInvalidator = ({ isExpanded }) => {
    const map = useMap();

    React.useEffect(() => {
        const timer = window.setTimeout(() => {
            map.invalidateSize({ animate: false });
        }, 120);

        return () => window.clearTimeout(timer);
    }, [isExpanded, map]);

    return null;
};

const LocationMapEvents = ({ latitude, longitude, onMapClick, onMarkerDragEnd }) => {
    useMapEvents({
        click(event) {
            if (typeof onMapClick !== 'function') return;
            const lat = toDecimalFloat(event.latlng.lat);
            const lng = toDecimalFloat(event.latlng.lng);
            if (lat !== null && lng !== null) {
                onMapClick(lat, lng);
            }
        }
    });

    if (!hasValidCoordinate(latitude, longitude)) return null;

    return (
        <Marker
            position={[toDecimalFloat(latitude), toDecimalFloat(longitude)]}
            draggable
            eventHandlers={{
                dragend: (event) => {
                    if (typeof onMarkerDragEnd !== 'function') return;
                    const position = event.target.getLatLng();
                    const lat = toDecimalFloat(position.lat);
                    const lng = toDecimalFloat(position.lng);
                    if (lat !== null && lng !== null) {
                        onMarkerDragEnd(lat, lng);
                    }
                }
            }}
        />
    );
};

const LocationPicker = ({
    formData = {},
    errors = {},
    handleChange,
    handleBlur,
    handleSelectSuggestion,
    searchResults = [],
    noResultsFound = false,
    mapCenter,
    isSearching = false,
    addressLookupError = '',
    addressLookupWarning = '',
    onSearchSubmit,
    onMapClick,
    onMarkerDragEnd,
    onAddressInputChange,
    showSuggestions = false,
    assignedBarangay = '',
    pendingOutOfBarangayLocation = null,
    outOfBarangayReason = '',
    outOfBarangayConfirmed = false,
    onOutOfBarangayReasonChange,
    onOutOfBarangayConfirmChange,
    onCancelOutOfBarangayLocation,
    isReadOnly = false
}) => {
    const safeMapCenter = getSafeCenter(mapCenter);
    const hasPinnedLocation = hasValidCoordinate(formData.latitude, formData.longitude);
    const [isExpanded, setIsExpanded] = React.useState(false);
    const boundaryBarangay = normalizeBarangayKey(assignedBarangay || formData.barangay);
    const barangayBoundaryData = React.useMemo(
        () => getBarangayBoundaryGeoJson(boundaryBarangay),
        [boundaryBarangay]
    );

    React.useEffect(() => {
        if (!isExpanded) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsExpanded(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isExpanded]);

    return (
        <div className="col-span-full space-y-4">
            <div className="relative">
                <InputWrapper label="Search Address (San Pedro, Laguna)" required hasError={!!errors.exact_address} errorMessage={errors.exact_address}>
                    <form
                        className="relative flex items-center"
                        onSubmit={(event) => {
                            event.preventDefault();
                            onSearchSubmit?.();
                        }}
                    >
                        <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                        <input
                            name="exact_address"
                            value={formData.exact_address || ''}
                            onChange={onAddressInputChange || handleChange}
                            onBlur={handleBlur}
                            disabled={isReadOnly}
                            readOnly={isReadOnly}
                            required
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                            data-lpignore="true"
                            data-form-type="other"
                            placeholder="Type address, street, purok, or landmark"
                            className={`${inputClasses} pl-10 pr-10`}
                        />
                        {isSearching && <Loader2 className="w-4 h-4 absolute right-3 animate-spin text-[#065f46]" />}
                    </form>
                </InputWrapper>

                {showSuggestions && searchResults.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-md shadow-xl overflow-hidden z-[2000] absolute w-full mt-1 max-h-64 overflow-y-auto">
                        {searchResults.map((res) => (
                            <button
                                key={`${res.place_id || res.display_name}-${res.lat}-${res.lon}`}
                                type="button"
                                onMouseDown={(event) => {
                                    if (!isReadOnly) event.preventDefault();
                                }}
                                onClick={() => !isReadOnly && handleSelectSuggestion(res)}
                                className="w-full text-left p-3 text-sm hover:bg-emerald-50 border-b last:border-0 transition-colors"
                                disabled={isReadOnly}
                            >
                                <span className="font-semibold block text-slate-800 leading-snug">{res.display_name}</span>
                                {res.precision === 'barangay' && (
                                    <span className="text-[11px] font-semibold text-amber-700 block mt-1">
                                        Barangay-level result. Use the map pin for the exact household point.
                                    </span>
                                )}
                                {res.precision === 'approximate' && (
                                    <span className="text-[11px] font-semibold text-slate-500 block mt-1">
                                        Approximate match. Confirm by clicking or dragging the pin.
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {noResultsFound && !isSearching && (formData.exact_address || '').length >= 3 && !formData.is_location_verified && (
                    <div className="bg-white border border-rose-200 rounded-md shadow-xl overflow-hidden z-[2000] absolute w-full mt-1 p-4">
                        <p className="text-xs font-semibold text-slate-700">No San Pedro match found. Click the map to save the exact household point.</p>
                    </div>
                )}

                {addressLookupError && !isSearching && (
                    <div className="mt-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                        {addressLookupError}
                    </div>
                )}

                {addressLookupWarning && !addressLookupError && !isSearching && (
                    <div className="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        {addressLookupWarning}
                    </div>
                )}
            </div>

                <InputWrapper label="Assigned Barangay (Spatial Lock Active)">
                <div className="relative flex items-center">
                    <MapPin className="w-4 h-4 absolute left-3 text-emerald-600" />
                    <input
                        name="barangay"
                        value={formData.barangay || 'Municipality'}
                        readOnly
                        className={`${inputClasses} pl-10 bg-slate-100 cursor-not-allowed font-semibold text-emerald-900 border-emerald-200`}
                    />
                </div>
            </InputWrapper>

            <div
                className={
                    isExpanded
                        ? 'fixed inset-0 z-[9999] h-screen w-screen overflow-hidden bg-slate-900'
                        : 'relative h-[320px] rounded-md border border-slate-300 overflow-hidden shadow-inner z-10 mt-2'
                }
            >
                {isReadOnly && (
                    <div className="absolute inset-0 z-[1100] bg-transparent cursor-not-allowed" aria-hidden="true" />
                )}
                <MapContainer
                    center={safeMapCenter}
                    zoom={hasPinnedLocation ? 17 : 14}
                    maxBounds={SAN_PEDRO_BOUNDS}
                    maxBoundsViscosity={1}
                    maxZoom={19}
                    minZoom={13}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={!isReadOnly}
                >
                    <TileLayer
                        attribution="Tiles &copy; Esri"
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={19}
                    />
                    <TileLayer
                        attribution="&copy; CARTO"
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
                        maxZoom={19}
                        zIndex={650}
                    />
                    {barangayBoundaryData && (
                        <GeoJSON
                            key={`location-picker-boundary-${boundaryBarangay}`}
                            data={barangayBoundaryData}
                            style={barangayBoundaryStyle}
                        />
                    )}
                    <MapResizeInvalidator isExpanded={isExpanded} />
                    <LocationMapEvents
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        onMapClick={isReadOnly ? undefined : onMapClick}
                        onMarkerDragEnd={isReadOnly ? undefined : onMarkerDragEnd}
                    />
                    <MapController center={safeMapCenter} hasPinnedLocation={hasPinnedLocation} />
                    <BarangayViewportController assignedBarangay={assignedBarangay || formData.barangay} hasPinnedLocation={hasPinnedLocation} />
                </MapContainer>
                <button
                    type="button"
                    onClick={() => setIsExpanded((value) => !value)}
                    className="absolute top-2 left-2 z-[1000] inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition-colors hover:bg-white"
                    aria-label={isExpanded ? 'Minimize map' : 'Maximize map'}
                    title={isExpanded ? 'Minimize map' : 'Maximize map'}
                >
                    {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <div className="absolute top-2 right-2 z-[1000] bg-white/95 px-3 py-1.5 rounded-md text-[10px] font-semibold text-slate-600 shadow-sm pointer-events-none uppercase tracking-widest border border-slate-200">
                    Click Map or Drag Pin
                </div>
                {hasPinnedLocation && (
                    <div className="absolute bottom-4 left-4 z-[1000] bg-[#065f46] text-white px-4 py-2 rounded-md flex items-center gap-2 shadow-xl border border-green-700/50">
                        <MapPin className="w-3.5 h-3.5 text-green-200" />
                        <span className="text-[11px] font-semibold uppercase tracking-normal">
                            GPS: {toDecimalFloat(formData.latitude).toFixed(6)}, {toDecimalFloat(formData.longitude).toFixed(6)}
                        </span>
                    </div>
                )}
            </div>

            {pendingOutOfBarangayLocation && !isReadOnly && (
                <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-900">
                                Out-of-Barangay Registration Exception
                            </p>
                            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                                The selected location is outside your assigned barangay. This may affect barangay reports,
                                defaulter tracking, and clustering. You can keep this pin, but final submission requires an
                                authorized exception reason and confirmation.
                            </p>
                            <div className="mt-3 grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-2">
                                <span>Assigned Barangay: <strong className="text-slate-950">{normalizeBarangayDisplay(assignedBarangay) || '--'}</strong></span>
                                <span>Selected Barangay: <strong className="text-slate-950">{pendingOutOfBarangayLocation.barangay || '--'}</strong></span>
                            </div>

                            <label className="mt-4 block">
                                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                                    Exception Reason
                                </span>
                                <textarea
                                    value={outOfBarangayReason}
                                    onChange={(event) => onOutOfBarangayReasonChange?.(event.target.value)}
                                    rows="3"
                                    placeholder="Example: referral, temporary residence, staffing shortage, transfer, or service coverage exception."
                                    className="mt-2 min-h-[96px] w-full rounded-lg border border-amber-200 bg-white p-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#064E3B] focus:ring-2 focus:ring-emerald-900/10"
                                />
                            </label>

                            <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3">
                                <input
                                    type="checkbox"
                                    checked={outOfBarangayConfirmed}
                                    onChange={(event) => onOutOfBarangayConfirmChange?.(event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-amber-300 text-[#064E3B] focus:ring-[#064E3B]"
                                />
                                <span className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">
                                    I confirm this is an authorized out-of-barangay registration.
                                </span>
                            </label>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={onCancelOutOfBarangayLocation}
                                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:border-slate-500"
                                >
                                    Cancel Selection
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
};

export default LocationPicker;
export { hasValidCoordinate, toDecimalFloat };
