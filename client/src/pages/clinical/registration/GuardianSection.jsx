import React from 'react';
import { InputWrapper, inputClasses } from './FormComponents';

const GuardianSection = ({ formData, errors, handleChange, handleBlur }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <InputWrapper label="Mother's Maiden Name" required hasError={!!errors.mothers_maiden_name} errorMessage={errors.mothers_maiden_name}>
                <input name="mothers_maiden_name" value={formData.mothers_maiden_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Elena Santos" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Father's Full Name" hasError={!!errors.father_name}>
                <input name="father_name" value={formData.father_name} onChange={handleChange} onBlur={handleBlur} autoComplete="new-password" placeholder="e.g. Roberto Santos" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Caregiver Relationship" required hasError={!!errors.caregiver_relationship}>
                <select name="caregiver_relationship" value={formData.caregiver_relationship} onChange={handleChange} className={inputClasses}>
                    <option value="">Select Relationship</option>
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Grandparent">Grandparent</option>
                    <option value="Guardian">Guardian</option>
                </select>
            </InputWrapper>
            <InputWrapper label="Caregiver Phone (09XXXXXXXXX)" required hasError={!!errors.caregiver_phone} errorMessage={errors.caregiver_phone}>
                <input name="caregiver_phone" value={formData.caregiver_phone} onChange={handleChange} placeholder="09171234567" className={inputClasses} />
            </InputWrapper>
            <InputWrapper label="Pregnancy Order">
                <input type="number" name="pregnancy_order" value={formData.pregnancy_order} onChange={handleChange} placeholder="e.g. 1" className={inputClasses} />
            </InputWrapper>
        </div>
    );
};

export default GuardianSection;
