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
    showSuggestions
}) => {
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
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} required className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Sex" required hasError={!!errors.sex} errorMessage={errors.sex}>
                <select name="sex" value={formData.sex} onChange={handleChange} required className={inputClasses}>
                    <option value="">Select Sex</option>
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
                    />
                </InputWrapper>
            </div>
        </div>
    );
};

export default IdentitySection;
