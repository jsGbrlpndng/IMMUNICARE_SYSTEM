import React from 'react';
/**
 * Infant Profile Page
 * 
 * Clinical staff (Midwives, BHWs) navigate here from Dashboard/My Infants by clicking an infant.
 * This table is the single place to record doses via the Record Vaccination button.
 * Caregivers consume this as a read-only timeline of their child's health.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../../services/apiClient';
import { useAuth } from '../../../contexts/AuthContext';
import { useFeedback } from '../../../contexts/FeedbackContext';
import {
    Calendar,
    User,
    ChevronLeft,
    CheckCircle2,
    ShieldAlert,
    MapPin,
    Syringe,
    X
} from 'lucide-react';
import NipScheduleTable from '../../../components/NipScheduleTable';
import { formatDate, formatAge } from '../../../utils/formatters';
import { formatFullAddress } from '../../../utils/addressFormatting';

const InfantProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { showToast, showConfirm } = useFeedback();

    const [loading, setLoading] = useState(true);
    const [infant, setInfant] = useState(null);
    const [schedule, setSchedule] = useState(null);
    const [error, setError] = useState(null);

    const [showSuccessToast, setShowSuccessToast] = useState(false);

    useEffect(() => {
        fetchInfantData();
    }, [id]);

    const fetchInfantData = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get(`/infants/${id}/vaccination-record`);

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    // Not JSON
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            if (data.success) {
                setInfant(data.data.infant);
                setSchedule(data.data);
            }
            setLoading(false);
        } catch (err) {
            console.error('Error fetching infant profile:', err);
            setError(err.message || 'Failed to load infant profile');
            setLoading(false);
        }
    };

    const handleRecordSuccess = () => {
        fetchInfantData();
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
    };

    const handleApproveClick = (vaccine) => {
        showConfirm({
            title: 'Approve & Lock Dose',
            message: `Are you sure you want to approve and lock the ${vaccine.vaccineName} (Dose #${vaccine.doseNumber}) record? This will make it official for reporting.`,
            onConfirm: async () => {
                try {
                    setLoading(true);
                    const response = await apiClient.patch(`/vaccinations/${vaccine.vaccinationId}/validate`, {});
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Failed to validate vaccination');
                    }
                    await fetchInfantData();
                } catch (err) {
                    console.error('Error validating dose:', err);
                    showToast(`Error: ${err.message}`, 'error');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    if (loading) return <div className="border border-slate-200 bg-white p-8 text-center text-sm font-bold tracking-tight text-slate-500">Loading profile...</div>;
    if (error) return <div className="border border-rose-200 bg-rose-50 p-8 text-center text-sm font-bold text-rose-700">{error}</div>;
    if (!infant) return <div className="border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">Infant not found</div>;

    const isClinicalStaff = false;
    const isApproved = ['APPROVED', 'Approved'].includes(infant.registration_status);
    const scheduleRows = Array.isArray(schedule?.record) ? schedule.record : [];
    const completedDoseCount = scheduleRows.filter((dose) => ['COMPLETED', 'COMPLETED_VALIDATED'].includes(dose.status)).length;
    const pendingDoseCount = scheduleRows.filter((dose) => dose.status === 'PENDING_VALIDATION').length;
    const upcomingDoseCount = Math.max(scheduleRows.length - completedDoseCount - pendingDoseCount, 0);
    const displayAddress = formatFullAddress({
        exactAddress: infant.exact_address || infant.current_address,
        barangay: infant.barangay
    });
    const statCards = [
        {
            label: 'Date of Birth',
            value: formatDate(infant.dob),
            icon: Calendar
        },
        {
            label: 'Current Age',
            value: formatAge(schedule?.age_metrics?.ageInMonths, schedule?.age_metrics?.ageInWeeks),
            icon: User
        },
        {
            label: 'Exact Address',
            value: displayAddress || 'Address not geocoded',
            icon: MapPin
        },
        {
            label: 'NIP Coverage',
            value: `${completedDoseCount}/${scheduleRows.length || 0} completed`,
            icon: Syringe
        }
    ];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                <button onClick={() => {
                    if (location.pathname.startsWith('/clinical')) {
                        navigate('/clinical/dashboard');
                    } else {
                        navigate('/bhw/dashboard');
                    }
                        }} className="mt-0.5 border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-[#064E3B] hover:bg-emerald-50 hover:text-[#064E3B]" aria-label="Back to dashboard">
                            <ChevronLeft className="h-5 w-5" />
                </button>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Infant Clinical Profile</p>
                            <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-slate-950">{infant.name}</h1>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">Reference ID: {infant.reference_id}</span>
                                <span className={`border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${isApproved
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}>
                            {infant.registration_status || 'Pending'}
                        </span>
                                {infant.barangay && (
                                    <span className="border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Barangay {infant.barangay}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[260px]">
                        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-lg font-black text-slate-950">{completedDoseCount}</p>
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Completed</p>
                        </div>
                        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-lg font-black text-amber-700">{pendingDoseCount}</p>
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Pending</p>
                        </div>
                        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-lg font-black text-[#064E3B]">{upcomingDoseCount}</p>
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Open</p>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500">
                    Profile values are shown from the approved infant record and vaccination schedule.
                </div>
            </div>

            {/* Registration Pending Banner */}
            {!isApproved && (
                <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 p-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                        <p className="text-sm font-black text-amber-900">Registration Pending Midwife Validation</p>
                        <p className="mt-0.5 text-xs font-semibold text-amber-700">
                            This infant's record is currently provisional. Local dose recording is disabled until a midwife approves the registration.
                        </p>
                    </div>
                </div>
            )}

            {/* Infant Details Card */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {statCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{card.label}</p>
                                    <p className="mt-2 text-sm font-black leading-snug text-slate-950">{card.value}</p>
                                </div>
                                <div className="bg-emerald-50 p-2 text-[#064E3B]">
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* NIP Schedule Table Component */}
            <NipScheduleTable
                schedule={schedule}
                isClinicalStaff={isClinicalStaff}
                onRecordClick={() => {}}
                registrationStatus={infant.registration_status}
                userRole={user?.role}
                onApproveClick={handleApproveClick}
            />

            {/* Success Toast */}
            {showSuccessToast && (
                <div className="fixed bottom-8 right-8 z-[100] flex items-center gap-4 border border-emerald-900 bg-slate-950 px-5 py-4 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className="flex h-8 w-8 items-center justify-center bg-emerald-600">
                        <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-black tracking-tight text-white">Record Saved</p>
                        <p className="text-xs font-semibold text-slate-300">Vaccination recorded successfully.</p>
                    </div>
                    <button onClick={() => setShowSuccessToast(false)} className="ml-4 text-slate-400 transition-colors hover:text-white">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default InfantProfile;
