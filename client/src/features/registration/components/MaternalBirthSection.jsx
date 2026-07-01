import React, { useEffect, useState } from 'react';
import { InputWrapper, inputClasses } from './FormComponents';
import { normalizeTTStatus, validateField } from '../../../utils/registrationValidation';

const MaternalBirthSection = ({ formData, errors, handleChange, handleBlur, isReadOnly = false }) => {
    const hasExistingBhwNotes = Boolean((formData.bhw_intake_notes || '').trim());
    const [showBhwNotes, setShowBhwNotes] = useState(hasExistingBhwNotes);
    const bhwNotesEnabled = showBhwNotes || hasExistingBhwNotes;
    const ttStatus = normalizeTTStatus(formData.mother_tt_status);
    const requiresLastTtDate = ['1', '2', '3', '4', '5'].includes(ttStatus);
    const motherTtStatusError = formData.mother_tt_status
        ? validateField('mother_tt_status', formData.mother_tt_status, formData)
        : errors.mother_tt_status;
    const lastTtDateError = requiresLastTtDate
        ? (!formData.last_tt_date ? 'Required' : validateField('last_tt_date', formData.last_tt_date, formData))
        : null;

    useEffect(() => {
        if (hasExistingBhwNotes) setShowBhwNotes(true);
    }, [hasExistingBhwNotes]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="col-span-full border-b border-slate-100 pb-2">
                <h3 className="text-[11px] font-black text-[#065f46] uppercase tracking-[0.2em]">Maternal Tetanus History</h3>
            </div>
            <InputWrapper label="Mother TT Status" required hasError={!!motherTtStatusError} errorMessage={motherTtStatusError}>
                <select name="mother_tt_status" value={formData.mother_tt_status} onChange={handleChange} disabled={isReadOnly} className={inputClasses}>
                    <option value="">Select TT status</option>
                    <option value="0">No TT history</option>
                    <option value="1">TT1</option>
                    <option value="2">TT2</option>
                    <option value="3">TT3</option>
                    <option value="4">TT4</option>
                    <option value="5">TT5</option>
                </select>
            </InputWrapper>
            <InputWrapper label="Last TT Date" required={requiresLastTtDate} hasError={!!lastTtDateError} errorMessage={lastTtDateError}>
                <input 
                    type="date" 
                    name="last_tt_date" 
                    value={formData.last_tt_date} 
                    onChange={handleChange} 
                    disabled={!requiresLastTtDate || isReadOnly}
                    max={new Date().toISOString().split('T')[0]}
                    className={inputClasses} 
                />
            </InputWrapper>


            
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
                    value={formData.birth_status || 'Pending birth weight'}
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

            <div className="col-span-full rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
                <label className="flex items-start gap-3">
                    <input
                        type="checkbox"
                        checked={bhwNotesEnabled}
                        onChange={(event) => setShowBhwNotes(event.target.checked)}
                        disabled={isReadOnly || hasExistingBhwNotes}
                        className="mt-1 h-5 w-5 rounded border-emerald-300 text-[#065f46] focus:ring-[#065f46]"
                    />
                    <span>
                        <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-[#065f46]">
                            Child has vaccine dose history from another clinic, baby book, or caregiver interview.
                        </span>
                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Enable BHW intake notes when external dose history or caregiver-provided context needs review.
                        </span>
                    </span>
                </label>

                {bhwNotesEnabled && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4">
                        <div className="mb-3">
                            <h3 className="text-[11px] font-black text-[#065f46] uppercase tracking-[0.2em]">BHW Intake Notes</h3>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Historical context from the baby book, outside clinic records, or caregiver interview.
                            </p>
                        </div>
                        <textarea
                            name="bhw_intake_notes"
                            value={formData.bhw_intake_notes || ''}
                            onChange={handleChange}
                            placeholder="Document external dose history, discrepancies in the baby book, or clinical context for Midwife review..."
                            rows="4"
                            className={`${inputClasses} min-h-[120px] resize-y rounded border border-slate-200`}
                            disabled={isReadOnly}
                            readOnly={isReadOnly}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default MaternalBirthSection;
