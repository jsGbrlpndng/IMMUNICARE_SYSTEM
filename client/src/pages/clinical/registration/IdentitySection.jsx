import React from 'react';
import { Search, Loader2, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { InputWrapper, inputClasses } from './FormComponents';

// --- Defensive Utility ---
const isValidCoordinate = (lat, lng) => {
    return (
        typeof lat === 'number' && 
        typeof lng === 'number' && 
        !isNaN(lat) && 
        !isNaN(lng) && 
        lat >= -90 && lat <= 90 && 
        lng >= -180 && lng <= 180 &&
        lat !== 0 && lng !== 0
    );
};

const MapController = ({ center }) => {
    const map = useMap();
    React.useEffect(() => {
        if (center && isValidCoordinate(center[0], center[1])) { 
            map.flyTo(center, 17, { duration: 1.5 });
        }
    }, [center, map]);
    return null;
};

const LocationMarker = ({ latitude, longitude, onMapClick, onDragEnd }) => {
    useMapEvents({
        click(e) {
            const { lat, lng } = e.latlng;
            onMapClick(lat, lng);
        },
    });

    return isValidCoordinate(latitude, longitude) ? (
        <Marker 
            position={[latitude, longitude]} 
            draggable={true}
            eventHandlers={{
                dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    onDragEnd(position.lat, position.lng);
                },
            }}
        />
    ) : null;
};

const IdentitySection = ({ 
    formData, 
    errors, 
    handleChange, 
    handleSelectSuggestion,
    searchResults,
    handleMapClick,
    handleDragEnd,
    handleBlur,
    noResultsFound,
    mapCenter,
    isSearching
}) => {
    // Standardize map center fallback - now strictly locked
    const safeMapCenter = isValidCoordinate(mapCenter?.[0], mapCenter?.[1]) 
        ? mapCenter 
        : [14.3318, 121.0220];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <InputWrapper label="First Name" required hasError={!!errors.first_name} errorMessage={errors.first_name}>
                <input name="first_name" value={formData.first_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Maria" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Last Name" required hasError={!!errors.last_name} errorMessage={errors.last_name}>
                <input name="last_name" value={formData.last_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Santos" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Middle Name">
                <input name="middle_name" value={formData.middle_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="Middle Name" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Suffix">
                <input name="suffix" value={formData.suffix} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Jr, III" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Date of Birth" required hasError={!!errors.dob} errorMessage={errors.dob}>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Sex" required hasError={!!errors.sex} errorMessage={errors.sex}>
                <select name="sex" value={formData.sex} onChange={handleChange} className={inputClasses}>
                    <option value="">Select Sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                </select>
            </InputWrapper>
            
            <div className="col-span-full space-y-4">
                <div className="relative">
                    <InputWrapper label="Search Address (San Pedro, Laguna)" required hasError={!!errors.exact_address} errorMessage={errors.exact_address}>
                        <div className="relative flex items-center">
                            <Search className="w-4 h-4 ml-3 text-slate-400" />
                            <input 
                                name="exact_address"
                                value={formData.exact_address}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                autoComplete="new-password"
                                placeholder="Type address (e.g. Narciso St, Langgam)" 
                                className={inputClasses}
                            />
                            {isSearching && <Loader2 className="w-4 h-4 mr-3 animate-spin text-[#065f46]" />}
                        </div>
                    </InputWrapper>
                    
                    {searchResults && searchResults.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-[2000] absolute w-full mt-1 max-h-60 overflow-y-auto">
                            {searchResults.map((res, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => handleSelectSuggestion(res)}
                                    className="w-full text-left p-3 text-sm hover:bg-green-50 border-b last:border-0 transition-colors"
                                >
                                    <span className="font-bold block text-slate-800">{res.display_name}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {noResultsFound && !isSearching && formData.exact_address.length >= 3 && !formData.is_location_verified && (
                        <div className="bg-white border border-rose-200 rounded-lg shadow-xl overflow-hidden z-[2000] absolute w-full mt-1 p-4 text-center">
                            <p className="text-xs font-bold text-slate-600 mb-2">No exact match found in San Pedro.</p>
                            <div className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-50 py-2 rounded-md">
                                Click on the map to drop pin manually
                            </div>
                        </div>
                    )}
                </div>
                
                <InputWrapper label="Assigned Barangay (Spatial Lock Active)">
                    <div className="relative flex items-center">
                        <MapPin className="w-4 h-4 absolute left-3 text-emerald-600" />
                        <input 
                            name="barangay" 
                            value={formData.barangay || 'Global / Municipal'} 
                            readOnly 
                            className={`${inputClasses} pl-10 bg-slate-100 cursor-not-allowed font-bold text-emerald-900 border-emerald-200`} 
                        />
                    </div>
                </InputWrapper>


                <div className="h-[300px] rounded-xl border border-slate-300 overflow-hidden shadow-inner relative z-10 group mt-2">
                    <MapContainer 
                        center={safeMapCenter} 
                        zoom={15} 
                        maxBounds={[[14.31, 121.00], [14.36, 121.05]]}
                        maxZoom={17}
                        minZoom={13}
                        style={{ height: '100%', width: '100%' }}
                        scrollWheelZoom={false}
                    >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <LocationMarker 
                            latitude={formData.latitude} 
                            longitude={formData.longitude} 
                            onMapClick={handleMapClick}
                            onDragEnd={handleDragEnd}
                        />
                        <MapController center={safeMapCenter} />
                    </MapContainer>
                    <div className="absolute top-2 right-2 z-[1000] bg-white/90 px-3 py-1.5 rounded-lg text-[10px] font-black text-slate-600 shadow-sm pointer-events-none uppercase tracking-widest border border-slate-200">
                        Drag Pin or Click Map
                    </div>
                    {isValidCoordinate(formData.latitude, formData.longitude) && (
                        <div className="absolute bottom-4 left-4 z-[1000] bg-[#065f46] text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-xl animate-in slide-in-from-bottom-2 duration-300 border border-green-700/50">
                            <MapPin className="w-3.5 h-3.5 text-green-200" />
                            <span className="text-[11px] font-black uppercase tracking-tight">
                                GPS LOCKED: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                            </span>
                        </div>
                    )}
                </div>

                <InputWrapper label="Landmark / House Description" required hasError={!!errors.landmark} errorMessage={errors.landmark}>
                    <textarea 
                        name="landmark" 
                        value={formData.landmark} 
                        onChange={handleChange} 
                        placeholder="e.g. Blue gate, beside Aling Nena's store" 
                        rows="2"
                        className={`${inputClasses} resize-none`}
                    />
                </InputWrapper>
            </div>
        </div>
    );
};

export default IdentitySection;
