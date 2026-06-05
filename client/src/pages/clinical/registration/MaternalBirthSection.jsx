import React from 'react';
import { InputWrapper, inputClasses } from './FormComponents';

const MaternalBirthSection = ({ formData, errors, handleChange, handleBlur, isReadOnly = false }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="col-span-full border-b border-slate-100 pb-2">
                <h3 className="text-[11px] font-black text-[#065f46] uppercase tracking-[0.2em]">Maternal Tetanus History</h3>
            </div>
            <InputWrapper label="Mother TT Status">
                <select name="mother_tt_status" value={formData.mother_tt_status} onChange={handleChange} disabled={formData.tt_history_unknown || isReadOnly} className={inputClasses}>
                    <option value="0">Unknown / No History</option>
                    <option value="TT1">TT1 (No protection)</option>
                    <option value="TT2">TT2 (3 years protection)</option>
                    <option value="TT3">TT3 (5 years protection)</option>
                    <option value="TT4">TT4 (10 years protection)</option>
                    <option value="TT5">TT5 (Life-long protection)</option>
                </select>
            </InputWrapper>
            <InputWrapper label="Last TT Date" hasError={!!errors.last_tt_date} errorMessage={errors.last_tt_date}>
                <input 
                    type="date" 
                    name="last_tt_date" 
                    value={formData.last_tt_date} 
                    onChange={handleChange} 
                    disabled={formData.tt_history_unknown || isReadOnly} 
                    max={new Date().toISOString().split('T')[0]}
                    className={inputClasses} 
                />
            </InputWrapper>
            <div className="flex items-center gap-3 px-1 py-2">
                <input type="checkbox" name="tt_history_unknown" id="tt_history_unknown" checked={formData.tt_history_unknown} onChange={handleChange} disabled={isReadOnly} className="w-5 h-5 accent-[#065f46] rounded" />
                <label htmlFor="tt_history_unknown" className="text-xs font-black text-slate-500 uppercase tracking-widest cursor-pointer select-none">TT History Unknown</label>
            </div>


            
            <div className="col-span-full border-b border-slate-100 pb-2 mt-4">
                <h3 className="text-[11px] font-black text-[#065f46] uppercase tracking-[0.2em]">Birth Information</h3>
            </div>
            <InputWrapper label="Birth Weight (kg)" required hasError={!!errors.birth_weight} errorMessage={errors.birth_weight}>
                <input 
                    type="number" 
                    step="0.01" 
                    name="birth_weight" 
                    value={formData.birth_weight} 
                    onChange={handleChange} 
                    placeholder="e.g. 3.20" 
                    className={inputClasses}
                    disabled={isReadOnly}
                    readOnly={isReadOnly}
                />
            </InputWrapper>
            <InputWrapper label="Birth Status (Auto-calculated)">
                <input 
                    name="birth_status" 
                    value={formData.birth_status} 
                    readOnly 
                    className={`${inputClasses} bg-slate-50 text-slate-500 cursor-not-allowed`} 
                />
            </InputWrapper>
            
            <InputWrapper label="Length at Birth (cm)" required hasError={!!errors.length_at_birth_cm} errorMessage={errors.length_at_birth_cm}>
                <input 
                    type="number" 
                    step="0.1" 
                    name="length_at_birth_cm" 
                    value={formData.length_at_birth_cm} 
                    onChange={handleChange} 
                    placeholder="e.g. 50.5" 
                    className={inputClasses}
                    disabled={isReadOnly}
                    readOnly={isReadOnly}
                />
            </InputWrapper>

            <InputWrapper label="Birth Setting">
                <select name="birth_setting" value={formData.birth_setting} onChange={handleChange} className={inputClasses} disabled={isReadOnly}>
                    <option value="FACILITY">Hospital / Health Center / Facility</option>
                    <option value="HOME">Home Delivery</option>
                </select>
            </InputWrapper>

            {formData.birth_setting === 'FACILITY' && (
                <InputWrapper label="Name of Hospital / Facility" required hasError={!!errors.delivery_facility_name} errorMessage={errors.delivery_facility_name}>
                    <input 
                        name="delivery_facility_name" 
                        value={formData.delivery_facility_name} 
                        onChange={handleChange} 
                        onBlur={handleBlur}
                        autoComplete="new-password"
                        placeholder="e.g. San Pedro District Hospital" 
                        className={inputClasses}
                        disabled={isReadOnly}
                        readOnly={isReadOnly}
                    />
                </InputWrapper>
            )}

            <div className="col-span-full bg-blue-50/50 p-6 rounded-2xl border border-blue-100/50 mt-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-black text-blue-900 uppercase tracking-widest cursor-pointer select-none">
                            Initiated breastfeeding immediately after birth
                        </label>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight">Requirement: Lasting 90 mins after delivery</span>
                    </div>
                    
                    <div className="flex items-center gap-2 p-1 bg-white border border-blue-100 rounded-xl">
                        <button
                            type="button"
                            onClick={() => handleChange({ target: { name: 'initiated_breastfeeding', value: true } })}
                            disabled={isReadOnly}
                            className={`flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${formData.initiated_breastfeeding === true ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-blue-400 hover:bg-blue-50'}`}
                        >
                            Yes
                        </button>
                        <button
                            type="button"
                            onClick={() => handleChange({ target: { name: 'initiated_breastfeeding', value: false } })}
                            disabled={isReadOnly}
                            className={`flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${formData.initiated_breastfeeding === false ? 'bg-slate-200 text-slate-600' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                            No
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MaternalBirthSection;
