import React from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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

const normalizeBarangay = (value) => (value || '').toString().trim().toUpperCase();

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

        const normalizedBarangay = normalizeBarangay(assignedBarangay) || 'MUNICIPALITY';
        const center = BARANGAY_CENTERS[normalizedBarangay] || BARANGAY_CENTERS.MUNICIPALITY;
        map.flyTo([center.lat, center.lng], normalizedBarangay === 'MUNICIPALITY' ? 14 : 16, { duration: 0.8 });
    }, [assignedBarangay, hasPinnedLocation, map]);

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
    isReadOnly = false
}) => {
    const safeMapCenter = getSafeCenter(mapCenter);
    const hasPinnedLocation = hasValidCoordinate(formData.latitude, formData.longitude);

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
                            className={`${inputClasses} pl-10 pr-24`}
                        />
                        {isSearching && <Loader2 className="w-4 h-4 absolute right-20 animate-spin text-[#065f46]" />}
                        <button
                            type="submit"
                            disabled={isReadOnly || isSearching || (formData.exact_address || '').trim().length < 3}
                            className="absolute right-2 rounded-md bg-[#065f46] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            Search
                        </button>
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

            <div className="relative h-[320px] rounded-md border border-slate-300 overflow-hidden shadow-inner z-10 mt-2">
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
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationMapEvents
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        onMapClick={isReadOnly ? undefined : onMapClick}
                        onMarkerDragEnd={isReadOnly ? undefined : onMarkerDragEnd}
                    />
                    <MapController center={safeMapCenter} hasPinnedLocation={hasPinnedLocation} />
                    <BarangayViewportController assignedBarangay={assignedBarangay || formData.barangay} hasPinnedLocation={hasPinnedLocation} />
                </MapContainer>
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
        </div>
    );
};

export default LocationPicker;
export { hasValidCoordinate, toDecimalFloat };
