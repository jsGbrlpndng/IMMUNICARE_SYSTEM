import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { SummaryItem } from './FormComponents';
import { formatFullNameFromObject } from '../../../utils/formatFullName';

const ReviewGroup = ({ title, children }) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#065f46]">{title}</h3>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 md:grid-cols-2">
            {children}
        </div>
    </section>
);

const OutOfBarangayExceptionSummary = ({ data }) => {
    if (data?.out_of_barangay_exception_confirmed !== true) return null;

    return (
        <section className="overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/70 px-5 py-3 text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em]">Out-of-Barangay Exception</h3>
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-5 md:grid-cols-2">
                <SummaryItem label="Status" value="Confirmed" />
                <SummaryItem label="Exception Barangay" value={data.out_of_barangay_exception_barangay || 'Not recorded'} />
                <div className="md:col-span-2">
                    <SummaryItem label="Reason" value={data.out_of_barangay_exception_reason || 'No reason recorded.'} />
                </div>
            </div>
        </section>
    );
};

const ReviewSection = ({ 
    formData, 
    duplicateMatches, 
    overrideReason, 
    setOverrideReason,
    userRole,
    handleChange,
    isReadOnly
}) => {
    return (
        <div className="animate-in fade-in slide-in-from-right-4 space-y-6 duration-300">
            <div className="rounded-2xl border border-[#065f46] bg-[#064E3B] p-5 text-white shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100">Registration Review</p>
                <h2 className="mt-2 text-2xl font-black leading-tight">{formatFullNameFromObject(formData) || 'Infant Registration'}</h2>
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-emerald-50/80">
                    Confirm the infant identity, guardian details, birth profile, and at-birth immunization entries before submission.
                </p>
            </div>

            <ReviewGroup title="Master Patient Index">
                <SummaryItem label="Full Name" value={formatFullNameFromObject(formData)} />
                <SummaryItem label="Sex / DOB" value={`${formData.sex} | ${formData.dob ? new Date(formData.dob).toLocaleDateString() : 'N/A'}`} />
                <SummaryItem label="Location" value={`${formData.locality || 'N/A'}, ${formData.barangay}`} />
                <SummaryItem label="Full Address" value={formData.exact_address} />
                <SummaryItem label="Landmark" value={formData.landmark} />
            </ReviewGroup>

            <OutOfBarangayExceptionSummary data={formData} />

            <ReviewGroup title="Clinical Profile">
                <SummaryItem label="Mother's Maiden Name" value={formData.mothers_maiden_name} />
                <SummaryItem label="Father" value={formData.father_name} />
                <SummaryItem label="Contact" value={formData.caregiver_phone} />
                <SummaryItem label="Birth Weight" value={formData.birth_weight ? `${formData.birth_weight} kg` : 'Not recorded'} />
                <SummaryItem label="Birth Length" value={formData.length_at_birth_cm ? `${formData.length_at_birth_cm} cm` : 'Not recorded'} />
                <SummaryItem label="Birth Setting" value={formData.birth_setting === 'FACILITY' ? 'Health Facility' : 'Home Delivery'} />
                {formData.birth_setting === 'FACILITY' && (
                    <SummaryItem label="Facility Name" value={formData.delivery_facility_name} />
                )}
                <SummaryItem label="Breastfeeding" value={formData.initiated_breastfeeding ? 'Initiated Immediately' : 'Not Initiated'} />
                <SummaryItem label="Spatial Coords" value={formData.latitude ? `${formData.latitude.toFixed(6)}, ${formData.longitude.toFixed(6)}` : 'Not captured'} />
                <SummaryItem label="Maternal TT Status" value={formData.tt_history_unknown ? 'Unknown' : (formData.mother_tt_status?.startsWith('TT') ? formData.mother_tt_status : `TT${formData.mother_tt_status}`)} />
                {!formData.tt_history_unknown && formData.last_tt_date && (
                    <SummaryItem label="Last TT Date" value={new Date(formData.last_tt_date).toLocaleDateString()} />
                )}
                <SummaryItem label="BCG Status" value={formData.bcg_status || 'Pending Selection'} />
                <SummaryItem label="HepaB Status" value={formData.hepatitis_b_status || formData.hepa_b_status || 'Pending Selection'} />
                <div className="col-span-full">
                    <SummaryItem label="BHW Intake Notes" value={formData.bhw_intake_notes || 'No intake notes recorded.'} />
                </div>
            </ReviewGroup>

            {duplicateMatches.length > 0 && (
                <div className="animate-in shake rounded-2xl border-2 border-amber-200 bg-amber-50 p-6 duration-700">
                    <div className="flex items-start gap-5 text-amber-800">
                        <AlertTriangle className="w-8 h-8 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                            <h3 className="font-black text-base uppercase tracking-wider mb-2">Potential Duplicate Detected</h3>
                            <p className="text-sm font-semibold leading-relaxed mb-6 opacity-80">
                                We found {duplicateMatches.length} existing record(s) matching this infant's identity. Please review carefully before proceeding.
                            </p>
                            
                            <div className="flex flex-col gap-3 mb-8">
                                {duplicateMatches.map((match, i) => (
                                    <div key={i} className="bg-white/80 p-4 rounded-xl border border-amber-200 flex items-center justify-between shadow-sm">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{formatFullNameFromObject(match)}</span>
                                            <span className="text-[10px] font-bold text-slate-500">{new Date(match.dob).toLocaleDateString()}</span>
                                        </div>
                                        <span className="text-[10px] font-black uppercase bg-amber-200 px-3 py-1 rounded-full text-amber-900 border border-amber-300">{match.match_type}</span>
                                    </div>
                                ))}
                            </div>

                            <label className="text-[11px] font-black uppercase text-amber-700 block mb-3">Duplicate Override Reason (Required to Proceed)</label>
                            <textarea 
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                placeholder="e.g. Verified correct identity, different family branch..."
                                className="w-full bg-white border-2 border-amber-300 rounded-xl p-4 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 min-h-[100px] transition-all font-medium text-slate-800"
                                disabled={isReadOnly}
                            />
                        </div>
                    </div>
                </div>
            )}

            {(userRole?.toUpperCase() === 'MIDWIFE' || userRole?.toUpperCase() === 'ADMIN') && (
                <div className="space-y-6 rounded-2xl border-2 border-red-100 bg-red-50 p-6">
                    <div className="flex items-center gap-3 text-red-800">
                        <div className="p-2 bg-red-100 rounded-lg">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest">Clinical Emergency Override</h3>
                            <p className="text-[10px] font-bold text-red-600 uppercase tracking-tighter">Bypass standard BHW validation queue (Requires justification)</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-white/60 rounded-xl border border-red-200">
                        <input 
                            type="checkbox" 
                            name="is_emergency" 
                            id="is_emergency" 
                            checked={formData.is_emergency} 
                            onChange={handleChange} 
                            className="w-5 h-5 accent-red-600 rounded" 
                            disabled={isReadOnly}
                        />
                        <label htmlFor="is_emergency" className="text-xs font-black text-slate-700 uppercase tracking-widest cursor-pointer select-none">
                            Enable Emergency Direct Promotion
                        </label>
                    </div>

                    {formData.is_emergency && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <label className="text-[10px] font-black text-red-800 uppercase tracking-widest block ml-1">Clinical Justification (Required)</label>
                            <textarea 
                                name="emergency_justification"
                                value={formData.emergency_justification}
                                onChange={handleChange}
                                placeholder="e.g. Critical clinical intervention required, BHW unavailable..."
                                className="w-full bg-white border border-red-200 rounded-xl p-4 text-sm outline-none focus:border-red-600 focus:ring-4 focus:ring-red-600/5 min-h-[100px] transition-all font-medium"
                                disabled={isReadOnly}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReviewSection;
