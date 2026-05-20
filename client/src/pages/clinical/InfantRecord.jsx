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
    X,
    Clipboard,
    History
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import RecordVaccinationModal from '../../components/RecordVaccinationModal';

/**
 * InfantRecord – High-density clinical patient profile.
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
        setSelectedDose(dose);
        setShowRecordModal(true);
    };

    const handleDoseRecorded = () => {
        setShowRecordModal(false);
        fetchRecord();
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2E7D32]"></div>
        </div>
    );

    if (!data) return (
        <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
            <AlertCircle className="w-16 h-16 text-red-100 mx-auto mb-4" />
            <h2 className="text-xl font-black text-slate-800">RECORD NOT FOUND</h2>
            <p className="text-slate-500 mt-2">The system cannot locate clinical data for this ID.</p>
            <button onClick={() => navigate(user?.role === 'BHW' ? '/bhw/dashboard' : '/clinical/registry')} className="mt-6 px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all">
                Back to Registry
            </button>
        </div>
    );

    const { infant, record, summary, age_metrics } = data;
    const isOverdue = (summary.defaulter || summary.overdue) > 0;
    const isFullyImmunized = summary.completed === summary.total_doses;

    return (
        <div className="flex flex-col gap-8 pb-20">
            {/* 1. CLINICAL HEADER (STICKY) */}
            <div className="sticky top-14 z-30 bg-white/95 backdrop-blur-md -mx-8 px-8 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate(user?.role === 'BHW' ? '/bhw/dashboard' : '/clinical/registry')}
                        className="p-3 bg-slate-50 text-slate-400 hover:text-[#2E7D32] hover:bg-green-50 rounded-xl transition-all border border-slate-100"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                                {infant.name}
                            </h1>
                            {infant.status === 'FIC' ? (
                                <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-200 flex items-center gap-1.5 shadow-md">
                                    <ShieldCheck size={12} /> FIC - Fully Immunized Child
                                </span>
                            ) : infant.status === 'CIC' ? (
                                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200 flex items-center gap-1.5 shadow-md">
                                    <ShieldCheck size={12} /> CIC - Completely Immunized Child
                                </span>
                            ) : isFullyImmunized ? (
                                <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1.5 shadow-sm">
                                    <CheckCircle2 size={12} /> Fully Immunized
                                </span>
                            ) : isOverdue ? (
                                <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-1.5 shadow-sm">
                                    <AlertCircle size={12} /> Defaulter ({summary.defaulter || summary.overdue})
                                </span>
                            ) : summary.due_today > 0 ? (
                                <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-100 flex items-center gap-1.5 shadow-sm">
                                    <Clock size={12} /> Due Today ({summary.due_today})
                                </span>
                            ) : summary.due_soon > 0 ? (
                                <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-1.5 shadow-sm">
                                    <Clock size={12} /> Due Soon ({summary.due_soon})
                                </span>
                            ) : (
                                <span className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-teal-100 flex items-center gap-1.5 shadow-sm">
                                    <Activity size={12} /> On Track
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 mt-0.5 text-[11px] font-bold text-slate-400 tracking-widest">
                            <span className="flex items-center gap-1"><History size={12} /> ID: {infant.reference_id}</span>
                            <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(infant.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            <span className="flex items-center gap-1 text-[#2E7D32] bg-green-50 px-2 rounded-md"><Clock size={12} /> {age_metrics.ageInMonths} MONTHS OLD</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2">
                        <Clipboard size={16} /> Print Record
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 2. DEMOGRAPHICS & SPATIAL PANEL */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
                            <Baby size={20} />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Demos & Spatial</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Biological Sex</span>
                            <span className="text-xs font-bold text-slate-700">{infant.sex === 'M' ? 'MALE' : 'FEMALE'}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Birth Weight</span>
                            <span className="text-xs font-bold text-slate-700">{infant.birth_weight} KG</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Guardian</span>
                        </div>
                        <div className="flex flex-col gap-1 border-b border-slate-50 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Precise Clinical Location</span>
                            <div className="mt-1">
                                <span className="text-sm font-black text-emerald-800 block leading-tight">
                                     {infant.exact_address || 'No Registered Street Address'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase mt-1 block tracking-tight">
                                    {infant.landmark || 'No Landmark Recorded'} • Subdiv/Purok Not Defined
                                </span>
                                <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mt-1.5 block">Verified Geographic Node</span>
                            </div>
                        </div>
                    </div>
                </div>


                {/* 3. CPAB & MATERNAL HISTORY PANEL */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-emerald-50 text-[#2E7D32] rounded-xl">
                            <ShieldCheck size={20} />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Maternal Health Data</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Maternal TT Status</span>
                            <span className="text-xs font-bold text-slate-700">
                                {infant.mother_tt_status ? (infant.mother_tt_status.startsWith('TT') ? infant.mother_tt_status : `TT${infant.mother_tt_status}`) : 'Unknown'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Last TT Date</span>
                            <span className="text-xs font-bold text-slate-700">{infant.last_tt_date ? new Date(infant.last_tt_date).toLocaleDateString() : 'NO RECORD'}</span>
                        </div>
                        
                        <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Birth Detail</span>
                            <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Length at Birth</span>
                                <span className="text-xs font-black text-slate-800">
                                    {infant.length_at_birth_cm !== null && infant.length_at_birth_cm !== undefined ? `${infant.length_at_birth_cm} CM` : 'N/A'}
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
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
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl">
                            <Activity size={20} />
                        </div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">NIP Coverage Summary</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 relative z-10">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Completed</span>
                            <div className="text-2xl font-black mt-1 text-slate-800">{summary.completed} <span className="text-xs text-slate-400">/ {summary.total_doses}</span></div>
                        </div>
                        <div className={`p-4 rounded-2xl border ${(summary.defaulter || summary.overdue) > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Defaulter</span>
                            <div className={`text-2xl font-black mt-1 ${(summary.defaulter || summary.overdue) > 0 ? 'text-red-600' : 'text-slate-800'}`}>{summary.defaulter || summary.overdue}</div>
                        </div>
                        <div className="col-span-2 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50 flex items-center justify-between">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800 opacity-60">Overall Compliance</span>
                                <div className="text-xl font-black mt-1 text-emerald-800">{Math.round((summary.completed / summary.total_doses) * 100)}%</div>
                            </div>
                            <div className="w-16 h-16 relative">
                                <svg className="w-16 h-16 transform -rotate-90">
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
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        <Syringe size={18} className="text-[#2E7D32]" />
                        National Immunization Program Schedule
                    </h3>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chronological Sequence</span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vaccine Name</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Age</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Due Date</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Admn. Date</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 uppercase text-[11px] font-bold">
                            {data.record.map((vax, idx) => {
                                const isOverdueRow = vax.original_schedule_status === 'OVERDUE' || vax.original_schedule_status === 'DEFAULTER' || vax.original_schedule_status === 'DROPOUT';
                                const isCompletedRow = vax.status === 'COMPLETED_VALIDATED';
                                const isPendingRow = vax.status === 'PENDING_VALIDATION';
                                
                                // CLINICAL SAFETY ENGINE: Premature Dose Validation
                                const isPremature = vax.actual_date && vax.earliest_allowed_date && 
                                                   new Date(vax.actual_date) < new Date(vax.earliest_allowed_date);

                                const rowBg = vax.original_schedule_status === 'DEFAULTER' || vax.original_schedule_status === 'DROPOUT' ? 'bg-red-100/40' :
                                              isOverdueRow ? 'bg-red-50/30' : 
                                              vax.original_schedule_status === 'DUE_TODAY' ? 'bg-orange-50/30' : 
                                              vax.original_schedule_status === 'DUE_SOON' ? 'bg-amber-50/20' : 
                                              isCompletedRow ? 'bg-emerald-50/10' : '';

                                return (
                                    <tr key={idx} className={`${rowBg} transition-colors group`}>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-800 font-black">{vax.vaccine_name}</div>
                                            <div className="text-[9px] text-slate-400 tracking-widest flex items-center gap-1 mt-0.5">
                                                {vax.vaccine_code} • DOSE {vax.dose_number}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-medium">
                                            {vax.target_age || 'ROUTINE'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {new Date(vax.recommended_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4">
                                            {isPremature ? (
                                                <div className="flex flex-col">
                                                    <span className="text-red-600 font-black tracking-tighter">INVALID - PREMATURE DOSE</span>
                                                    <span className="text-[8px] text-red-400 italic font-medium lowercase">administered before min age: {new Date(vax.earliest_allowed_date).toLocaleDateString()}</span>
                                                </div>
                                            ) : isCompletedRow ? (
                                                <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> COMPLETED</span>
                                            ) : isPendingRow ? (
                                                <span className="text-amber-500 flex items-center gap-1"><Clock size={12} /> PENDING VALIDATION</span>
                                            ) : isOverdueRow ? (
                                                <span className="text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {vax.original_schedule_status}</span>
                                            ) : (
                                                <span className="text-slate-400">UPCOMING</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">
                                            {vax.actual_date ? new Date(vax.actual_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {isCompletedRow || isPendingRow ? (
                                                <div className="flex items-center justify-end gap-2 text-slate-400">
                                                    <span className="text-[9px] font-black uppercase tracking-widest italic">Record Finalized</span>
                                                    <ShieldCheck size={14} className="text-emerald-600/50" />
                                                </div>
                                            ) : user?.role === 'BHW' ? (
                                                <div className="flex items-center justify-end text-slate-400 pr-2">
                                                    <span className="text-[9px] font-black uppercase tracking-widest italic">Read-Only</span>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => handleRecordDose(vax)}
                                                    className={`px-4 py-2 rounded-md text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm ${
                                                        isOverdueRow ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' : 'bg-emerald-800 hover:bg-emerald-900 text-white'
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
            {showRecordModal && selectedDose && (
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
        </div>
    );
}
