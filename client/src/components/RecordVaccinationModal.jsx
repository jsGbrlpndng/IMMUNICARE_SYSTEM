import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import {
    X,
    Calendar,
    User,
    Syringe,
    AlertCircle,
    AlertTriangle
} from 'lucide-react';
import apiClient from '../services/apiClient';
import JustificationModal from './JustificationModal';

const toDateOnlyString = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const raw = value.toString().trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return toDateOnlyString(parsed);
};

const dateStringToDayNumber = (dateString) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day) / 86400000;
};

const readServerError = async (response) => {
    let payload = null;
    try {
        payload = await response.json();
    } catch (error) {
        return `HTTP ${response.status}`;
    }

    return payload?.details || payload?.message || payload?.error || `HTTP ${response.status}`;
};

/**
 * RecordVaccinationModal - Extracted component for recording vaccinations.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - infant: object { name, reference_id }
 * - selectedVaccine: object { vaccineCode, vaccineName, doseNumber, scheduleId, dueDate }
 * - user: object { id, role, full_name, name }
 * - onRecordSuccess: function (updatedSchedule)
 */
const RecordVaccinationModal = ({
    isOpen,
    onClose,
    infant,
    selectedVaccine,
    user,
    onRecordSuccess
}) => {
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [recordForm, setRecordForm] = useState({
        administered_date: toDateOnlyString(new Date()),
        site_of_injection: 'Left Thigh',
        batch_number: '',
        brand: '',
        notes: '',
        vaccinator_name: user?.full_name || user?.name || '',
        confirmation: false
    });

    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideContext, setOverrideContext] = useState(null);

    const regStatus = infant?.registration_status?.toUpperCase();
    const userRole = user?.role?.toUpperCase();
    const canRecord = userRole === 'ADMIN' || userRole === 'MIDWIFE' || userRole === 'BHW' || userRole === 'SUPER_ADMIN';
    const isBHW = userRole === 'BHW';

    if (!isOpen) return null;

    console.log("CURRENT INFANT STATUS:", regStatus);
    // Guard against explicitly non-approved infants, but allow if status is undefined or null (e.g., from NIP schedule)
    const isApproved = !regStatus || regStatus === 'APPROVED';

    // Dates & Validation Logic
    const getDaysDiff = (adminDateStr, dueDateStr) => {
        if (!dueDateStr) return 0;
        const adminDay = dateStringToDayNumber(toDateOnlyString(adminDateStr));
        const dueDay = dateStringToDayNumber(toDateOnlyString(dueDateStr));
        if (adminDay === null || dueDay === null) return 0;
        return adminDay - dueDay;
    };

    const effectiveAllowedDate = selectedVaccine?.earliestAllowedDate ||
        selectedVaccine?.earliest_allowed_date ||
        selectedVaccine?.dueDate;
    const daysDiff = getDaysDiff(recordForm.administered_date, effectiveAllowedDate);
    const isGracePeriod = daysDiff >= -4 && daysDiff <= -1;
    const isHardStop = daysDiff <= -5;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!canRecord) {
            setSubmitError('PERMISSIONS_ERROR: Only Super Admins, Admins, Midwives, and BHWs are authorized to record vaccinations.');
            return;
        }

        if (!isApproved) {
            setSubmitError('REGISTRATION_PENDING: Infant must be approved before recording vaccinations.');
            return;
        }

        if (isHardStop) {
            setSubmitError('INVALID: Minimum interval not met. Early administration destroys immunity. Action blocked.');
            return;
        }

        // PILLAR 1: Temporal Validation (Strict Date Logic)
        const todayString = toDateOnlyString(new Date());
        const adminDateString = toDateOnlyString(recordForm.administered_date);
        const dobDateString = toDateOnlyString(infant?.dob);

        if (!adminDateString || adminDateString > todayString) {
            setSubmitError('TEMPORAL VIOLATION: Cannot record a vaccination in the future.');
            return;
        }

        if (dobDateString && adminDateString < dobDateString) {
            setSubmitError('TEMPORAL VIOLATION: Cannot record a vaccination before the infant was born.');
            return;
        }

        if (!recordForm.confirmation) {
            setSubmitError('Please confirm the vaccination.');
            return;
        }

        if (!recordForm.batch_number) {
            setSubmitError('Batch number is required.');
            return;
        }

        const exactVaccineCode = selectedVaccine.vaccineCode || selectedVaccine.vaccine_code || selectedVaccine.vaccine;
        const exactScheduleId = selectedVaccine.scheduleId || selectedVaccine.schedule_id;
        const exactInfantId = infant.id || selectedVaccine.infantId;

        if (!exactVaccineCode || !exactInfantId) {
            setSubmitError('Missing critical vaccination data (Vaccine Code or Infant ID). Cannot record dose.');
            console.error('[VALIDATION ERROR] Missing data:', { exactVaccineCode, exactInfantId, selectedVaccine });
            return;
        }
        
        console.log('[DEBUG] RecordVaccinationModal passing infant_id:', exactInfantId);

        try {
            setSubmitting(true);
            setSubmitError(null);

            // Guaranteeing object shape per approval constraints
            const payload = {
                infant_id: exactInfantId,
                vaccine_name: selectedVaccine.vaccineName || selectedVaccine.vaccine_name || 'Unknown',
                vaccine_code: exactVaccineCode,
                dose_number: selectedVaccine.doseNumber || selectedVaccine.dose_number || 1,
                schedule_id: exactScheduleId || null,
                batch_number: recordForm.batch_number,
                site_of_injection: recordForm.site_of_injection,
                vaccinator_id: user?.id,
                vaccinator_name: recordForm.vaccinator_name || 'System',
                administered_date: recordForm.administered_date,
                brand: recordForm.brand || 'N/A',
                notes: recordForm.notes,
                recorded_by_role: user?.role,
                override_early_dose: false, // Override logic is separate if needed, but hardstop enforces strictly now
                validation_status: isBHW ? 'PENDING_VALIDATION' : 'VALIDATED'
            };

            // [LOG] Recording Vaccination Payload - Mandatory for verification
            console.log('[DEBUG] Recording Vaccination Payload:', payload);

            const response = await apiClient.post('/vaccinations', payload);

            if (!response.ok) {
                const errorMessage = await readServerError(response);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.success) {
                onRecordSuccess(data.data);
                onClose();
            }

        } catch (err) {
            console.error('Error recording vaccination:', err);
            setSubmitError(err.message || 'Failed to record vaccination. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOverrideSubmit = async (justification) => {
        if (justification) {
            setRecordForm(prev => ({
                ...prev,
                notes: prev.notes ? `${prev.notes}\n\n[JUSTIFICATION]: ${justification}` : `[JUSTIFICATION]: ${justification}`
            }));
        }
        setShowOverrideModal(false);
        setTimeout(() => {
            document.getElementById('vax-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }, 100);
    };

    // Extract JSX into a named constant so it can be routed through createPortal.
    // This completely detaches the modal from the StaffLayout stacking context
    // and guarantees the overlay covers the full viewport at all times.
    const modalContent = (
        <div className="fixed top-0 left-0 w-screen h-screen z-[99999] bg-black/50 flex items-center justify-center">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                {/* STICKY HEADER */}
                <div className="sticky top-0 z-10 px-8 py-5 border-b border-slate-200 bg-white flex justify-between items-center">
                    <div>
                        <h3 className="font-extrabold text-slate-900 text-xl tracking-tight uppercase">Record Vaccination</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold uppercase tracking-wider rounded-sm">
                                {selectedVaccine?.vaccineName}
                            </span>
                            <span className="text-slate-500 text-xs font-semibold">Dose #{selectedVaccine?.doseNumber}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-[4px] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar bg-slate-50">
                    
                    <div className="bg-white p-4 rounded-sm border border-slate-200 flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-[4px] border border-slate-100 flex items-center justify-center text-slate-600">
                            <User className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient Context</p>
                            <p className="text-sm font-bold text-slate-900">{infant.name} <span className="text-slate-400 font-medium ml-2">ID: {infant.reference_id}</span></p>
                        </div>
                    </div>

                    {isBHW && (
                        <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-amber-900 font-bold text-sm uppercase tracking-wide">Provisional Record</p>
                                <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                                    You are recording this dose as a BHW. It will be marked as <strong>Pending Validation</strong> and must be approved by a Midwife.
                                </p>
                            </div>
                        </div>
                    )}

                    {isGracePeriod && !isHardStop && (
                        <div className="bg-yellow-50 border border-yellow-300 rounded-sm p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-yellow-900 font-bold text-sm uppercase tracking-wide">Grace Period Active</p>
                                <p className="text-yellow-800 text-xs mt-1 leading-relaxed">
                                    Administering within 4-day grace period. This dose is clinically valid but technically early.
                                </p>
                            </div>
                        </div>
                    )}

                    {isHardStop && (
                        <div className="bg-red-50 border border-red-300 rounded-sm p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-red-900 font-bold text-sm uppercase tracking-wide">Clinical Hard Stop</p>
                                <p className="text-red-800 text-xs mt-1 leading-relaxed font-medium">
                                    {effectiveAllowedDate && `(Earliest allowed: ${new Date(effectiveAllowedDate).toLocaleDateString()}) `}
                                    INVALID: Minimum interval not met. Early administration destroys immunity. Action blocked.
                                </p>
                            </div>
                        </div>
                    )}

                    <form id="vax-form" onSubmit={handleSubmit} className="space-y-5 bg-white p-6 rounded-sm border border-slate-200">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Date Selection */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5" /> Date Administered
                                </label>
                                <input
                                    type="date"
                                    required
                                    max={new Date().toISOString().split('T')[0]}
                                    value={recordForm.administered_date}
                                    onChange={e => setRecordForm({ ...recordForm, administered_date: e.target.value })}
                                    className={`w-full px-4 py-3 bg-slate-50 border rounded-[4px] focus:ring-2 focus:ring-green-700/20 focus:border-green-700 outline-none font-semibold text-slate-900 transition-colors ${isHardStop ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 text-red-900' : 'border-slate-200'}`}
                                />
                            </div>

                            {/* Provider Name */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5" /> Provider Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Name of health worker"
                                    value={recordForm.vaccinator_name || ''}
                                    onChange={e => setRecordForm({ ...recordForm, vaccinator_name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-[4px] focus:ring-2 focus:ring-green-700/20 focus:border-green-700 outline-none font-semibold text-slate-900 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Route and Batch */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Syringe className="w-3.5 h-3.5" /> Route / Site
                                </label>
                                <select
                                    value={recordForm.site_of_injection}
                                    onChange={e => setRecordForm({ ...recordForm, site_of_injection: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-[4px] focus:ring-2 focus:ring-green-700/20 focus:border-green-700 outline-none font-semibold text-slate-900 appearance-none transition-colors"
                                >
                                    <option>Left Thigh</option>
                                    <option>Right Thigh</option>
                                    <option>Left Arm</option>
                                    <option>Right Arm</option>
                                    <option>Oral</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                    Batch Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: BN123456"
                                    value={recordForm.batch_number || ''}
                                    onChange={e => setRecordForm({ ...recordForm, batch_number: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-[4px] focus:ring-2 focus:ring-green-700/20 focus:border-green-700 outline-none font-semibold text-slate-900 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Brand and Notes */}
                        <div className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vaccine Brand (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="Enter brand name"
                                    value={recordForm.brand || ''}
                                    onChange={e => setRecordForm({ ...recordForm, brand: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-[4px] focus:ring-2 focus:ring-green-700/20 focus:border-green-700 outline-none font-semibold text-slate-900 transition-colors"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Clinical Notes</label>
                                <textarea
                                    rows="2"
                                    placeholder="Observations, adverse reactions (if any)..."
                                    value={recordForm.notes}
                                    onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-[4px] focus:ring-2 focus:ring-green-700/20 focus:border-green-700 outline-none font-semibold text-slate-900 resize-none transition-colors"
                                />
                            </div>
                        </div>

                        {/* Confirmation Section */}
                        <div className="pt-2">
                            <div className={`p-4 rounded-sm border flex gap-3 ${isHardStop ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-green-50/50 border-green-200'}`}>
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        id="confirm"
                                        disabled={isHardStop}
                                        checked={recordForm.confirmation}
                                        onChange={e => setRecordForm({ ...recordForm, confirmation: e.target.checked })}
                                        className="w-5 h-5 text-green-700 border-slate-300 rounded-sm focus:ring-green-700 cursor-pointer"
                                    />
                                </div>
                                <label htmlFor="confirm" className={`text-sm font-semibold leading-snug cursor-pointer select-none ${isHardStop ? 'text-slate-500' : 'text-slate-800'}`}>
                                    I confirm that this vaccination was officially administered to the patient and all details are clinically accurate.
                                </label>
                            </div>
                        </div>
                    </form>
                </div>

                {/* STICKY FOOTER */}
                <div className="sticky bottom-0 z-10 px-8 py-5 border-t border-slate-200 bg-white flex items-center justify-between gap-6">
                    <div className="flex-1 overflow-hidden">
                        {submitError && (
                            <div role="alert" className="flex items-center gap-2 text-red-800 bg-red-50 px-3 py-2 rounded-[4px] border border-red-300 shadow-sm">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <p className="text-[11px] font-black leading-tight uppercase tracking-wider">{submitError}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-[4px] text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            form="vax-form"
                            type="submit"
                            disabled={!recordForm.confirmation || isHardStop || !recordForm.batch_number || submitting || !canRecord}
                            className={`px-8 py-2.5 rounded-[4px] text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-colors
                                ${isHardStop || !recordForm.confirmation || !recordForm.batch_number || submitting || !canRecord
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-green-700 text-white hover:bg-green-800'}`}
                        >
                            {submitting ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                'Record Dose'
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <JustificationModal
                isOpen={showOverrideModal}
                onClose={() => setShowOverrideModal(false)}
                onSubmit={handleOverrideSubmit}
                infantName={overrideContext?.infantName}
                vaccine={overrideContext?.vaccine}
                overrideType={overrideContext?.overrideType}
            />
        </div>
    );

    // Render via portal — detaches from StaffLayout's stacking context entirely,
    // guaranteeing z-[99999] covers the full viewport above NIPTimelineModal z-[9999]
    return ReactDOM.createPortal(modalContent, document.body);
};


export default RecordVaccinationModal;
