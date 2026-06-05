import React from 'react';
import { InputWrapper, inputClasses } from './FormComponents';
import LocationPicker from './LocationPicker';

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
    isSearching,
    addressLookupError,
    addressLookupWarning,
    handleAddressSearchSubmit,
    handleAddressInputChange,
    showSuggestions,
    isReadOnly = false
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <InputWrapper label="First Name" required hasError={!!errors.first_name} errorMessage={errors.first_name}>
                <input name="first_name" value={formData.first_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Maria" className={inputClasses} disabled={isReadOnly} readOnly={isReadOnly} />
            </InputWrapper>
            <InputWrapper label="Last Name" required hasError={!!errors.last_name} errorMessage={errors.last_name}>
                <input name="last_name" value={formData.last_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Santos" className={inputClasses} disabled={isReadOnly} readOnly={isReadOnly} />
            </InputWrapper>
            <InputWrapper label="Middle Name" required={formData.has_no_middle_name !== true} hasError={!!errors.middle_name} errorMessage={errors.middle_name}>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <input
                            type="checkbox"
                            name="has_no_middle_name"
                            checked={formData.has_no_middle_name === true}
                            onChange={handleChange}
                            disabled={isReadOnly}
                            className="h-4 w-4 rounded border-slate-300 text-[#064E3B] focus:ring-[#064E3B]"
                        />
                        <span>No Middle Name</span>
                    </label>
                    <input
                        name="middle_name"
                        value={formData.middle_name}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        autoComplete="new-password"
                        placeholder={formData.has_no_middle_name ? 'Middle name intentionally omitted' : 'Middle Name'}
                        className={inputClasses}
                        disabled={isReadOnly || formData.has_no_middle_name === true}
                        readOnly={isReadOnly || formData.has_no_middle_name === true}
                    />
                </div>
            </InputWrapper>
            <InputWrapper label="Suffix">
                <input name="suffix" value={formData.suffix} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Jr, III" className={inputClasses} disabled={isReadOnly} readOnly={isReadOnly} />
            </InputWrapper>
            <InputWrapper label="Date of Birth" required hasError={!!errors.dob} errorMessage={errors.dob}>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} required className={inputClasses} disabled={isReadOnly} />
            </InputWrapper>
            <InputWrapper label="Sex" required hasError={!!errors.sex} errorMessage={errors.sex}>
                <select name="sex" value={formData.sex} onChange={handleChange} required className={inputClasses} disabled={isReadOnly}>
                    <option value="" disabled>Select Sex</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                </select>
            </InputWrapper>
            
            <LocationPicker
                formData={formData}
                errors={errors}
                handleChange={handleChange}
                handleBlur={handleBlur}
                handleSelectSuggestion={handleSelectSuggestion}
                searchResults={searchResults}
                noResultsFound={noResultsFound}
                mapCenter={mapCenter}
                isSearching={isSearching}
                addressLookupError={addressLookupError}
                addressLookupWarning={addressLookupWarning}
                onSearchSubmit={handleAddressSearchSubmit}
                onMapClick={handleMapClick}
                onMarkerDragEnd={handleDragEnd}
                onAddressInputChange={handleAddressInputChange}
                showSuggestions={showSuggestions}
                assignedBarangay={formData.barangay}
                isReadOnly={isReadOnly}
            />

            <div className="col-span-full">
                <InputWrapper label="Landmark / House Description" required hasError={!!errors.landmark} errorMessage={errors.landmark}>
                    <textarea 
                        name="landmark" 
                        value={formData.landmark} 
                        onChange={handleChange} 
                        required
                        placeholder="e.g. Blue gate, beside Aling Nena's store" 
                        rows="2"
                        className={`${inputClasses} resize-none`}
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                    />
                </InputWrapper>
            </div>
        </div>
    );
};

export default IdentitySection;
