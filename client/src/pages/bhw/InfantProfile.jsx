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
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import {
    Calendar,
    User,
    ChevronLeft,
    CheckCircle2,
    ShieldAlert,
    MapPin,
    X
} from 'lucide-react';
import NipScheduleTable from '../../components/NipScheduleTable';
import { formatDate, formatAge } from '../../utils/formatters';

const InfantProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

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

    const handleApproveClick = async (vaccine) => {
        if (!window.confirm(`Are you sure you want to approve and lock the ${vaccine.vaccineName} (Dose #${vaccine.doseNumber}) record? This will make it official for reporting.`)) {
            return;
        }

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
            alert(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500 font-medium tracking-tight">Loading profile...</div>;
    if (error) return <div className="p-8 text-center text-red-500 font-medium">{error}</div>;
    if (!infant) return <div className="p-8 text-center text-gray-500 font-medium">Infant not found</div>;

    const isClinicalStaff = false;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => {
                    if (location.pathname.startsWith('/clinical')) {
                        navigate('/clinical/dashboard');
                    } else {
                        navigate('/bhw/dashboard');
                    }
                }} className="p-2 hover:bg-gray-100 rounded-full transition">
                    <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{infant.name}</h1>
                    <div className="flex items-center gap-2">
                        <p className="text-gray-500">Reference ID: {infant.reference_id}</p>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md ${infant.registration_status === 'Approved'
                            ? 'bg-green-50 text-green-700 border border-green-100'
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                            {infant.registration_status || 'Pending'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Registration Pending Banner */}
            {infant.registration_status !== 'Approved' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-amber-900 font-bold text-sm">Registration Pending Midwife Validation</p>
                        <p className="text-amber-700 text-xs mt-0.5">
                            This infant's record is currently provisional. Local dose recording is disabled until a midwife approves the registration.
                        </p>
                    </div>
                </div>
            )}

            {/* Infant Details Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                        <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Date of Birth</p>
                        <p className="font-medium text-gray-900">{formatDate(infant.dob)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                        <User className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Age</p>
                        <p className="font-medium text-gray-900">
                            {formatAge(schedule?.age_metrics?.ageInMonths, schedule?.age_metrics?.ageInWeeks)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                        <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Exact Address</p>
                        <p className="font-medium text-gray-900">{infant.exact_address || 'Address not geocoded'}</p>
                    </div>
                </div>
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
                <div className="fixed bottom-8 right-8 z-[100] flex items-center gap-4 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-500 border border-white/10">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <p className="font-bold text-sm tracking-tight text-white">Record Saved</p>
                        <p className="text-xs text-gray-400 font-medium">Vaccination recorded successfully.</p>
                    </div>
                    <button onClick={() => setShowSuccessToast(false)} className="ml-4 text-gray-500 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default InfantProfile;
