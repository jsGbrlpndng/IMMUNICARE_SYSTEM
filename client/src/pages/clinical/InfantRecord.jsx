import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    Baby,
    Calendar,
    User,
    Phone,
    MapPin,
    CheckCircle2,
    AlertCircle,
    Clock,
    Activity,
    ShieldCheck,
    Syringe,
    PlusCircle,
    PencilLine,
    X,
    Clipboard,
    History
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import RecordVaccinationModal from '../../components/RecordVaccinationModal';
import DoseCorrectionModal from '../../components/DoseCorrectionModal';
import { formatFullAddress } from '../../utils/addressFormatting';

/**
 * InfantRecord - High-density clinical patient profile.
 * Provides real-time NIP tracking and Dose Recording capabilities.
 */
export default function InfantRecord() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [selectedDose, setSelectedDose] = useState(null);
    const [showCorrectionModal, setShowCorrectionModal] = useState(false);
    const [selectedCorrectionDose, setSelectedCorrectionDose] = useState(null);
    const [validatingDoseId, setValidatingDoseId] = useState(null);

    const fetchRecord = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get(`/infants/${id}/vaccination-record`);
            if (res.ok) {
                const result = await res.json();
                setData(result.data);
            }
        } catch (error) {
            console.error('Error fetching clinical record:', error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchRecord();
    }, [fetchRecord]);

    const handleRecordDose = (dose) => {
        if (data?.infant?.status === 'Archived') return;
        setSelectedDose(dose);
        setShowRecordModal(true);
    };

    const handleDoseRecorded = () => {
        setShowRecordModal(false);
        fetchRecord();
    };

    const handleCorrectDose = (dose) => {
        const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
        const canCorrect = ['MIDWIFE', 'ADMIN', 'NURSE'].includes(normalizedRole);
        if (!canCorrect || !dose?.vaccination_id || data?.infant?.status === 'Archived') return;
        setSelectedCorrectionDose(dose);
        setShowCorrectionModal(true);
    };

    const handleDoseCorrectionSaved = async () => {
        setShowCorrectionModal(false);
        setSelectedCorrectionDose(null);
        await fetchRecord();
    };

    const handleValidatePendingDose = async (dose) => {
        if (!dose?.vaccination_id) return;
        setValidatingDoseId(dose.vaccination_id);
        try {
            const res = await apiClient.patch(`/vaccinations/${dose.vaccination_id}/validate`);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || payload.success === false) {
                throw new Error(payload.details || payload.message || payload.error || 'Failed to validate pending dose.');
            }
            await fetchRecord();
        } catch (error) {
            console.error('Error validating pending dose:', error);
            window.alert(error.message || 'Failed to validate pending dose.');
        } finally {
            setValidatingDoseId(null);
        }
    };

    if (loading) return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#064E3B]"></div>
        </div>
    );

    if (!data) return (
        <div className="border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-rose-100" />
            <h2 className="text-xl font-black text-slate-800">RECORD NOT FOUND</h2>
            <p className="mt-2 text-slate-500">The system cannot locate clinical data for this ID.</p>
            <button onClick={() => navigate(user?.role === 'BHW' ? '/bhw/dashboard' : '/clinical/registry')} className="mt-6 border border-slate-200 bg-slate-100 px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-200">
                Back to Registry
            </button>
        </div>
    );

    const { infant, record, summary, age_metrics } = data;
    const displayAddress = formatFullAddress({
        exactAddress: infant?.exact_address || infant?.current_address,
        barangay: infant?.barangay
    });
    const isOverdue = (summary.defaulter || summary.DEFAULTED || summary.overdue) > 0;
    const isFullyImmunized = summary.completed === summary.total_doses;
    const isArchived = infant?.status === 'Archived';
    const isBhw = user?.role === 'BHW';
    const normalizedRole = String(user?.role || '').trim().toUpperCase().replace(/\s+/g, '_');
    const canCorrectDose = ['MIDWIFE', 'ADMIN', 'NURSE'].includes(normalizedRole);
    const canValidatePendingDose = normalizedRole === 'MIDWIFE';

    const ExternalDoseBadge = () => (
        <span className="inline-flex border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-800">
            [External]
        </span>
    );

    const getClinicalStatusLabel = (vax) => {
        if (vax.status === 'COMPLETED_VALIDATED') return 'Administered';
        if (vax.status === 'PENDING_VALIDATION') return 'Pending Validation';
        if (vax.original_schedule_status === 'INELIGIBLE') return 'Ineligible';
        if (['DEFAULTER', 'DEFAULTED', 'OVERDUE'].includes(vax.original_schedule_status)) return 'Overdue';
        if (vax.original_schedule_status === 'DUE_TODAY') return 'Due Today';
        if (vax.original_schedule_status === 'DUE_SOON') return 'Due Soon';
        return 'Scheduled';
    };

    return (
        <div className="flex flex-col gap-5 pb-20">
            {/* 1. CLINICAL HEADER (STICKY) */}
            <div className="sticky top-14 z-30 -mx-8 flex flex-col justify-between gap-4 border-b border-slate-200 bg-white/95 px-8 py-4 shadow-sm backdrop-blur-md md:flex-row md:items-center">
                <div className="flex min-w-0 items-start gap-4">
                    <button 
                        onClick={() => navigate(user?.role === 'BHW' ? '/bhw/dashboard' : '/clinical/registry')}
                        className="border border-slate-200 bg-white p-2.5 text-slate-500 transition-all hover:border-[#064E3B] hover:bg-emerald-50 hover:text-[#064E3B]"
                        aria-label="Back to registry"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Clinical Patient Record</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h1 className="min-w-0 text-2xl font-black uppercase tracking-tight text-slate-950">
                                {infant.name}
                            </h1>
                            {infant.status === 'FIC' ? (
                                <span className="flex items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                    <ShieldCheck size={12} /> FIC - Fully Immunized Child
                                </span>
                            ) : infant.status === 'CIC' ? (
                                <span className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                    <ShieldCheck size={12} /> CIC - Completely Immunized Child
                                </span>
                            ) : isFullyImmunized ? (
                                <span className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                    <CheckCircle2 size={12} /> Fully Immunized
                                </span>
                            ) : isOverdue ? (
                                <span className="flex items-center gap-1.5 border border-rose-300 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-rose-700">
                                    <AlertCircle size={12} /> DEFAULTER ({summary.defaulter || summary.DEFAULTED || summary.overdue})
                                </span>
                            ) : summary.due_today > 0 ? (
                                <span className="flex items-center gap-1.5 border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800">
                                    <Clock size={12} /> Due Today ({summary.due_today})
                                </span>
                            ) : summary.due_soon > 0 ? (
                                <span className="flex items-center gap-1.5 border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                                    <Clock size={12} /> Due Soon ({summary.due_soon})
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700">
                                    <Activity size={12} /> On Track
                                </span>
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <span className="flex items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-1"><History size={12} /> ID: {infant.reference_id}</span>
                            <span className="flex items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-1"><Calendar size={12} /> {new Date(infant.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            <span className="flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-[#064E3B]"><Clock size={12} /> {age_metrics.ageInMonths} MONTHS OLD</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button className="flex items-center gap-2 border border-slate-300 bg-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-all hover:border-[#064E3B] hover:text-[#064E3B]">
                        <Clipboard size={16} /> Print Record
                    </button>
                </div>
            </div>

            {isArchived && (
                <div className="border border-slate-200 bg-slate-100 px-5 py-4 text-slate-900">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">Archived Record</div>
                    <p className="mt-1 text-sm font-bold leading-6">
                        ARCHIVED RECORD: {infant?.archive_reason || 'No reason recorded'} - {infant?.archive_notes || 'No archive notes recorded.'}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* 2. DEMOGRAPHICS & SPATIAL PANEL */}
                <div className="border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="bg-slate-100 p-2.5 text-slate-700">
                            <Baby size={20} />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Demos & Spatial</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Biological Sex</span>
                            <span className="text-xs font-bold text-slate-700">{infant.sex === 'M' ? 'MALE' : 'FEMALE'}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Birth Weight</span>
                            <span className="text-xs font-bold text-slate-700">{infant.birth_weight} KG</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Guardian</span>
                        </div>
                        <div className="flex flex-col gap-1 border-b border-slate-100 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Precise Clinical Location</span>
                            <div className="mt-1 border-l-4 border-[#064E3B] bg-slate-50 px-3 py-2">
                                <span className="block text-sm font-black leading-snug text-slate-900">
                                     {displayAddress || 'No Registered Street Address'}
                                </span>
                                <span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Landmark: {infant.landmark || 'No Landmark Recorded'}
                                </span>
                                <span className="mt-1.5 block text-[9px] font-bold uppercase tracking-widest text-[#064E3B]">Verified Geographic Node</span>
                            </div>
                        </div>
                    </div>
                </div>


                {/* 3. CPAB & MATERNAL HISTORY PANEL */}
                <div className="border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="bg-emerald-50 p-2.5 text-[#064E3B]">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Maternal Health Data</h3>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Maternal TT Status</span>
                            <span className="text-xs font-bold text-slate-700">
                                {infant.mother_tt_status ? (infant.mother_tt_status.startsWith('TT') ? infant.mother_tt_status : `TT${infant.mother_tt_status}`) : 'Unknown'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Last TT Date</span>
                            <span className="text-xs font-bold text-slate-700">{infant.last_tt_date ? new Date(infant.last_tt_date).toLocaleDateString() : 'NO RECORD'}</span>
                        </div>
                        
                        <div className="flex flex-col gap-2 border border-slate-200 bg-slate-50 p-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Birth Detail</span>
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Length at Birth</span>
                                <span className="text-xs font-black text-slate-800">
                                    {infant.length_at_birth_cm !== null && infant.length_at_birth_cm !== undefined ? `${infant.length_at_birth_cm} CM` : 'N/A'}
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Immediate Breastfeeding</span>
                                <span className={`text-xs font-black ${infant.initiated_breastfeeding ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    {infant.initiated_breastfeeding ? 'YES' : 'NO'}
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Delivery Facility</span>
                                <span className="text-[10px] font-black text-slate-800 truncate">
                                    {infant.delivery_facility_name || 'HOME/NOT SPECIFIED'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. CLINICAL SUMMARY PANEL */}
                <div className="relative overflow-hidden border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="relative z-10 mb-5 flex items-center gap-3">
                        <div className="bg-emerald-50 p-2.5 text-[#064E3B]">
                            <Activity size={20} />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">NIP Coverage Summary</h3>
                    </div>
                    <div className="relative z-10 grid grid-cols-2 gap-3">
                        <div className="border border-slate-200 bg-slate-50 p-4">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Completed</span>
                            <div className="mt-1 text-2xl font-black text-slate-800">{summary.completed} <span className="text-xs text-slate-400">/ {summary.total_doses}</span></div>
                        </div>
                        <div className={`border p-4 ${(summary.defaulter || summary.DEFAULTED || summary.overdue) > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">DEFAULTER</span>
                            <div className={`mt-1 text-2xl font-black ${(summary.defaulter || summary.DEFAULTED || summary.overdue) > 0 ? 'text-rose-700' : 'text-slate-800'}`}>{summary.defaulter || summary.DEFAULTED || summary.overdue}</div>
                        </div>
                        <div className="col-span-2 flex items-center justify-between border border-emerald-200 bg-emerald-50 p-4">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800 opacity-60">Overall Compliance</span>
                                <div className="mt-1 text-xl font-black text-emerald-800">{Math.round((summary.completed / summary.total_doses) * 100)}%</div>
                            </div>
                            <div className="relative h-16 w-16">
                                <svg className="h-16 w-16 -rotate-90 transform">
                                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-emerald-100/30" />
                                    <circle 
                                        cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" 
                                        strokeDasharray={175} 
                                        strokeDashoffset={175 - (175 * (summary.completed / summary.total_doses))} 
                                        className="text-emerald-600"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* 5. NIP VACCINATION SCHEDULE TABLE */}
            <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800">
                        <Syringe size={18} className="text-[#064E3B]" />
                        National Immunization Program Schedule
                    </h3>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chronological Sequence</span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] border-collapse text-left">
                        <thead>
                            <tr className="border-b border-[#064E3B] bg-[#064E3B]">
                                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white">Vaccine Name</th>
                                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white">Target Age</th>
                                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white">Due Date</th>
                                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white">Status</th>
                                <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white">Admin Date</th>
                                <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px] font-bold uppercase">
                            {data.record.map((vax, idx) => {
                                const isOverdueRow = ['DEFAULTER', 'DEFAULTED', 'OVERDUE'].includes(vax.original_schedule_status);
                                const isIneligibleRow = vax.original_schedule_status === 'INELIGIBLE';
                                const isCompletedRow = vax.status === 'COMPLETED_VALIDATED';
                                const isPendingRow = vax.status === 'PENDING_VALIDATION';
                                
                                // CLINICAL SAFETY ENGINE: Premature Dose Validation
                                const isPremature = vax.actual_date && vax.earliest_allowed_date && 
                                                   new Date(vax.actual_date) < new Date(vax.earliest_allowed_date);

                                const rowBg = ['DEFAULTER', 'DEFAULTED'].includes(vax.original_schedule_status) ? 'bg-rose-50' :
                                              isOverdueRow ? 'bg-rose-50/70' : 
                                              vax.original_schedule_status === 'DUE_TODAY' ? 'bg-amber-50' : 
                                              vax.original_schedule_status === 'DUE_SOON' ? 'bg-amber-50/60' : 
                                              isIneligibleRow ? 'bg-slate-50' :
                                              isCompletedRow ? 'bg-emerald-50/10' : '';

                                return (
                                    <tr key={idx} className={`${rowBg} group transition-colors hover:bg-emerald-50/30`}>
                                        <td className="px-5 py-3">
                                            <div className="font-black text-slate-900">{vax.vaccine_name}</div>
                                            <div className="mt-0.5 flex items-center gap-1 text-[9px] tracking-widest text-slate-400">
                                                {vax.vaccine_code} &bull; DOSE {vax.dose_number}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 font-bold text-slate-500">
                                            {vax.target_age || '--'}
                                        </td>
                                        <td className="px-5 py-3 text-slate-600">
                                            {new Date(vax.recommended_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="px-5 py-3">
                                            {isPremature ? (
                                                <div className="flex flex-col">
                                                    <span className="font-black tracking-tighter text-rose-700">INVALID - PREMATURE DOSE</span>
                                                    <span className="text-[8px] font-medium lowercase italic text-rose-500">administered before min age: {new Date(vax.earliest_allowed_date).toLocaleDateString()}</span>
                                                </div>
                                            ) : isCompletedRow ? (
                                                <span className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700"><CheckCircle2 size={12} /> {getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            ) : isPendingRow ? (
                                                <span className="inline-flex items-center gap-1 border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700"><Clock size={12} /> {getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            ) : isIneligibleRow ? (
                                                <span className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 px-2 py-1 text-slate-500"><AlertCircle size={12} /> {getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            ) : isOverdueRow ? (
                                                <span className="inline-flex items-center gap-1 border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700"><AlertCircle size={12} /> {getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            ) : vax.original_schedule_status === 'DUE_TODAY' ? (
                                                <span className="inline-flex items-center gap-1 border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800"><Clock size={12} /> {getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            ) : vax.original_schedule_status === 'DUE_SOON' ? (
                                                <span className="inline-flex items-center gap-1 border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700"><Clock size={12} /> {getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            ) : (
                                                <span className="inline-flex border border-slate-200 bg-white px-2 py-1 text-slate-500">{getClinicalStatusLabel(vax).toUpperCase()}</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-slate-500">
                                            {vax.actual_date ? (
                                                <div className="flex flex-col items-start gap-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span>{new Date(vax.actual_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                        {vax.is_external && <ExternalDoseBadge />}
                                                    </div>
                                                    {isPendingRow && (
                                                        <span className="max-w-[220px] text-[9px] font-bold uppercase tracking-wider text-amber-700">
                                                            Pending Midwife validation
                                                        </span>
                                                    )}
                                                    {isPendingRow && vax.recorded_by_role && (
                                                        <span className="max-w-[220px] text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                                            Encoder Role: {vax.recorded_by_role}
                                                        </span>
                                                    )}
                                                    {vax.notes && !vax.is_external && (
                                                        <span className="max-w-[220px] text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                                            {vax.notes}
                                                        </span>
                                                    )}
                                                    {vax.is_external && vax.notes && (
                                                        <span className="max-w-[220px] text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                                            {vax.notes}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            {isIneligibleRow ? (
                                                <div className="flex items-center justify-end gap-2 text-slate-400">
                                                    <span className="text-[9px] font-black uppercase tracking-widest italic">Not Clinically Eligible</span>
                                                    <AlertCircle size={14} className="text-slate-400" />
                                                </div>
                                            ) : isPendingRow ? (
                                                canValidatePendingDose && vax.vaccination_id ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleValidatePendingDose(vax)}
                                                            disabled={validatingDoseId === vax.vaccination_id}
                                                            className="inline-flex items-center gap-1.5 border border-[#064E3B] bg-[#064E3B] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#053b2e] disabled:opacity-50"
                                                        >
                                                            <ShieldCheck size={12} />
                                                            {validatingDoseId === vax.vaccination_id ? 'Approving...' : 'Approve Dose'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCorrectDose(vax)}
                                                            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:border-[#064E3B] hover:text-[#064E3B]"
                                                        >
                                                            <PencilLine size={12} />
                                                            Correct Dose
                                                        </button>
                                                    </div>
                                                ) : canCorrectDose && vax.vaccination_id ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCorrectDose(vax)}
                                                            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:border-[#064E3B] hover:text-[#064E3B]"
                                                        >
                                                            <PencilLine size={12} />
                                                            Correct Dose
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-2 text-slate-400">
                                                        <span className="text-[9px] font-black uppercase tracking-widest italic">Pending Midwife Review</span>
                                                        <Clock size={14} className="text-amber-600/70" />
                                                    </div>
                                                )
                                            ) : isCompletedRow ? (
                                                canCorrectDose && vax.vaccination_id ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCorrectDose(vax)}
                                                            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:border-[#064E3B] hover:text-[#064E3B]"
                                                        >
                                                            <PencilLine size={12} />
                                                            Correct Dose
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-end gap-2 text-slate-400">
                                                        <span className="text-[9px] font-black uppercase tracking-widest italic">Record Finalized</span>
                                                        <ShieldCheck size={14} className="text-emerald-600/50" />
                                                    </div>
                                                )
                                            ) : isArchived ? (
                                                <div className="flex items-center justify-end text-slate-400 pr-2">
                                                    <span className="text-[9px] font-black uppercase tracking-widest italic">Archived Read-Only</span>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleRecordDose(vax)}
                                                    className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest shadow-sm transition-all active:scale-95 ${
                                                        isOverdueRow ? 'animate-pulse border border-rose-700 bg-rose-700 text-white hover:bg-rose-800' : 'border border-[#064E3B] bg-[#064E3B] text-white hover:bg-emerald-900'
                                                    }`}
                                                >
                                                    Record Dose
                                                </button>
                                            )}
                                        </td>

                                    </tr>
                                );
                            })}
                        </tbody>

                    </table>
                </div>
            </div>

            {/* RECORD DOSE MODAL */}
            {!isArchived && showRecordModal && selectedDose && (
                <RecordVaccinationModal
                    isOpen={showRecordModal}
                    onClose={() => {
                        setShowRecordModal(false);
                        setSelectedDose(null);
                    }}
                    infant={{
                        id: id,
                        name: infant.name,
                        reference_id: infant.reference_id,
                        registration_status: 'APPROVED' // Clinical profile is only available for approved infants
                    }}
                    selectedVaccine={{
                        vaccineCode: selectedDose.vaccine_code,
                        vaccineName: selectedDose.vaccine_name,
                        doseNumber: selectedDose.dose_number,
                        scheduleId: selectedDose.schedule_id,
                        dueDate: selectedDose.recommended_date
                    }}
                    user={user}
                    onRecordSuccess={handleDoseRecorded}
                />
            )}

            {!isArchived && showCorrectionModal && selectedCorrectionDose && (
                <DoseCorrectionModal
                    isOpen={showCorrectionModal}
                    onClose={() => {
                        setShowCorrectionModal(false);
                        setSelectedCorrectionDose(null);
                    }}
                    onSuccess={handleDoseCorrectionSaved}
                    infant={{
                        id,
                        name: infant.name,
                        reference_id: infant.reference_id
                    }}
                    dose={selectedCorrectionDose}
                />
            )}
        </div>
    );
}
