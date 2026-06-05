import React from 'react';
import { InputWrapper, inputClasses } from './FormComponents';

const ImmunizationSection = ({ formData, errors, handleChange, isReadOnly = false }) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                <h3 className="text-sm font-black text-green-800 uppercase tracking-[0.1em] mb-2">At-Birth Immunization Record</h3>
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-6">Record doses already received during delivery or immediately after.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* BCG Section */}
                    <div className="bg-white p-5 rounded-xl border border-green-200 shadow-sm space-y-4">
                        <InputWrapper label="BCG" required hasError={!!errors.bcg_status}>
                            <select name="bcg_status" value={formData.bcg_status} onChange={handleChange} className={inputClasses} disabled={isReadOnly}>
                                <option value="">Select Status</option>
                                <option value="Given">Given</option>
                                <option value="Not Given">Not Given</option>
                                <option value="Unknown">Unknown</option>
                            </select>
                        </InputWrapper>
                        <InputWrapper label="Date Given" required={formData.bcg_status === 'Given'} hasError={!!errors.bcg_date}>
                            <input 
                                type="date" 
                                name="bcg_date" 
                                value={formData.bcg_date} 
                                onChange={handleChange} 
                                disabled={formData.bcg_status !== 'Given' || isReadOnly} 
                                min={formData.dob}
                                max={new Date().toISOString().split('T')[0]}
                                className={inputClasses} 
                            />
                        </InputWrapper>
                    </div>

                    {/* Hepa B Section */}
                    <div className="bg-white p-5 rounded-xl border border-green-200 shadow-sm space-y-4">
                        <InputWrapper label="Hepa B" required hasError={!!errors.hepatitis_b_status}>
                            <select name="hepatitis_b_status" value={formData.hepatitis_b_status} onChange={handleChange} className={inputClasses} disabled={isReadOnly}>
                                <option value="">Select Status</option>
                                <option value="Given within 24 hours">Given within 24 hours</option>
                                <option value="Given more than 24 hours">Given more than 24 hours</option>
                                <option value="Not Given">Not Given</option>
                                <option value="Unknown">Unknown</option>
                            </select>
                        </InputWrapper>
                        <InputWrapper label="Date Given" required={formData.hepatitis_b_status?.startsWith('Given')} hasError={!!errors.hepatitis_b_date}>
                            <input 
                                type="date" 
                                name="hepatitis_b_date" 
                                value={formData.hepatitis_b_date} 
                                onChange={handleChange} 
                                disabled={formData.hepatitis_b_status !== 'Given more than 24 hours' || isReadOnly} 
                                min={formData.dob}
                                max={new Date().toISOString().split('T')[0]}
                                className={inputClasses} 
                            />
                        </InputWrapper>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImmunizationSection;
