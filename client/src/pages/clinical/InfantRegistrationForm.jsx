import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';
import { 
    ClipboardCheck, CheckCircle, Save, Loader2, SaveAll, AlertTriangle, Check, ChevronLeft, ChevronRight, Info
} from 'lucide-react';

// Sub-components
import { StepIndicator } from './registration/FormComponents';
import IdentitySection from './registration/IdentitySection';
import GuardianSection from './registration/GuardianSection';
import MaternalBirthSection from './registration/MaternalBirthSection';
import ImmunizationSection from './registration/ImmunizationSection';
import ReviewSection from './registration/ReviewSection';

// Validation Logic
import { validateField, isStepValid } from '../../utils/registrationValidation';
import { getBarangayCenter } from '../../utils/barangayConfig';

const initialFormState = {
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    dob: '',
    sex: '',
    birth_weight: '',
    length_at_birth_cm: '',
    birth_status: 'Normal',
    mothers_maiden_name: '',
    father_name: '',
    caregiver_relationship: '',
    caregiver_phone: '',
    barangay: 'Langgam', 
    locality: '',
    landmark: '',
    current_address: '',
    exact_address: '',
    mother_tt_status: '0', 
    pregnancy_order: '',
    last_tt_date: '',
    tt_history_unknown: false,
    delivery_facility_name: '',
    initiated_breastfeeding: false,
    bcg_status: '',
    bcg_date: '',
    hepatitis_b_status: '',
    hepatitis_b_date: '',
    birth_setting: 'FACILITY',
    registration_status: '',
    latitude: null,
    longitude: null,
    is_location_verified: false,
    // BHW/Emergency fields
    is_emergency: false,
    emergency_justification: ''
};

export default function InfantRegistrationForm({ userRole: forcedRole, onComplete }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { id: routeId } = useParams();
    const { user } = useAuth();
    const userRole = forcedRole || user?.role;
    
    // UI States
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [toast, setToast] = useState(null);
    const [submissionError, setSubmissionError] = useState(null);
    
    // Data States
    const [formData, setFormData] = useState(initialFormState);
    const [errors, setErrors] = useState({});
    const [duplicateMatches, setDuplicateMatches] = useState([]);
    const [overrideReason, setOverrideReason] = useState('');
    const [registeredInfantInfo, setRegisteredInfantInfo] = useState(null);

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const currentStatus = (formData.status || formData.registration_status || '').toUpperCase();
    const isReadOnly = ['PENDING', 'PENDING_VALIDATION', 'REJECTED'].includes(currentStatus);

    // Geocoding States
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [noResultsFound, setNoResultsFound] = useState(false);
    const [mapCenter, setMapCenter] = useState([14.3596, 121.0426]); 
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const skipNextFetch = useRef(false);
    const searchTimeoutRef = useRef(null);
    const STEPS = useMemo(() => [
        { id: 1, title: 'Identity' },
        { id: 2, title: 'Guardian' },
        { id: 3, title: 'Clinical' },
        { id: 4, title: 'Doses' },
        { id: 5, title: 'Review' }
    ], []);

    const resetForm = useCallback(() => {
        const targetName = user?.assigned_barangay || 'MUNICIPALITY';
        const center = getBarangayCenter(targetName);
        setFormData({ ...initialFormState, barangay: user?.assigned_barangay?.toUpperCase() || '' });
        setErrors({});
        setCurrentStep(1);
        setIsSuccess(false);
        setSubmissionError(null);
        setDuplicateMatches([]);
        setOverrideReason('');
        setSearchResults([]);
        setMapCenter([center.lat, center.lng]);
    }, [user?.assigned_barangay]);

    // --- Initialize Spatial Context on Mount ---
    useEffect(() => {
        const targetName = user?.assigned_barangay || 'MUNICIPALITY';
        const center = getBarangayCenter(targetName);
        setFormData(prev => ({ ...prev, barangay: user?.assigned_barangay?.toUpperCase() || '' }));
        setMapCenter([center.lat, center.lng]);
    }, [user?.assigned_barangay]);

    // --- Address Search Debounce Effect ---
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(formData.exact_address);
        }, 800);
        return () => clearTimeout(timer);
    }, [formData.exact_address]);

    // --- Address Search Fetch Effect ---
    useEffect(() => {
        if (skipNextFetch.current) return;
        
        if (!debouncedSearchTerm || debouncedSearchTerm.length < 3) {
            setSearchResults([]);
            setNoResultsFound(false);
            return;
        }

        const controller = new AbortController();
        
        const performSearch = async () => {
            setIsSearching(true);
            setNoResultsFound(false);
            setSubmissionError(null);

            try {
                const userBarangay = user?.assigned_barangay || '';
                const strictQuery = userBarangay 
                    ? `${debouncedSearchTerm}, ${userBarangay}, San Pedro, Laguna`
                    : `${debouncedSearchTerm}, San Pedro, Laguna`;

                const response = await apiClient.get(`/geo/search?q=${encodeURIComponent(strictQuery)}`, {
                    signal: controller.signal
                });

                if (response.status === 429) {
                    throw new Error('RATE_LIMIT');
                }

                if (!response.ok) throw new Error('FETCH_ERROR');

                let data = await response.json();

                // Fallback ONLY if result is truly empty and status is 200 OK
                if ((!data || data.length === 0) && userBarangay) {
                    const fallbackQuery = `${debouncedSearchTerm}, San Pedro, Laguna, Philippines`;
                    const fallbackRes = await apiClient.get(`/geo/search?q=${encodeURIComponent(fallbackQuery)}`, {
                        signal: controller.signal
                    });
                    
                    if (fallbackRes.status === 429) throw new Error('RATE_LIMIT');
                    if (fallbackRes.ok) data = await fallbackRes.json();
                }

                setSearchResults(data || []);
                setNoResultsFound(!data || data.length === 0);
            } catch (err) {
                if (err.name === 'AbortError') return; // Silent background fail
                
                if (err.message === 'RATE_LIMIT') {
                    setSubmissionError("Geocoding server busy. Please wait a few seconds...");
                } else {
                    console.error("Geocoding failure:", err);
                }
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        performSearch();
        return () => controller.abort();
    }, [debouncedSearchTerm, user?.assigned_barangay]);

    // --- Load Existing Data (for Drafts/Corrections) ---
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const registrationId = routeId || params.get('id');
        
        if (registrationId) {
            const fetchRegistration = async () => {
                setIsLoading(true);
                try {
                    const res = await apiClient.get(`/registrations/${registrationId}`);
                    if (res.ok) {
                        const data = await res.json();
                        // Flatten JSONB data into form state
                        const reg = data.data;
                        const flatData = {
                            ...initialFormState,
                            ...(reg.registration_data || {}),
                            id: reg.id,
                            registration_status: reg.status || reg.registration_status,
                            status: reg.status || reg.registration_status,
                            correction_notes: reg.correction_notes || ''
                        };
                        setFormData(flatData);
                        
                        const statusVal = (reg.status || reg.registration_status || '').toUpperCase();
                        if (['PENDING', 'PENDING_VALIDATION', 'REJECTED'].includes(statusVal)) {
                            setCurrentStep(5);
                        }
                        
                        // Update map center if coordinates exist
                        if (flatData.latitude && flatData.longitude) {
                            setMapCenter([flatData.latitude, flatData.longitude]);
                        }
                    }
                } catch (err) {
                    console.error("Failed to load registration:", err);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchRegistration();
        }
    }, [location.search]);



    const handleSelectSuggestion = (res) => {
        skipNextFetch.current = true;
        const lat = parseFloat(res.lat);
        const lon = parseFloat(res.lon);
        
        let identifiedBarangay = user?.assigned_barangay || formData.barangay || 'Langgam';
        const address = res.display_name;
        const barangayOptions = ['Langgam', 'Calendola', 'GSIS', 'Magsaysay', 'Sampaguita', 'UBL', 'UB', 'Laram', 'Estrella', 'Bagong Silang', 'Riverside', 'Narra'];
        for (const b of barangayOptions) {
            if (address.toLowerCase().includes(b.toLowerCase())) {
                identifiedBarangay = b;
                break;
            }
        }

        setFormData(prev => ({
            ...prev,
            exact_address: address,
            latitude: lat,
            longitude: lon,
            barangay: identifiedBarangay,
            is_location_verified: true
        }));
        
        setMapCenter([lat, lon]);
        setSearchResults([]);
    };

    const handleReverseGeocode = async (lat, lon) => {
        setIsSearching(true);
        try {
            const response = await apiClient.get(`/geo/reverse?lat=${lat}&lon=${lon}`);
            if (response.ok) {
                const data = await response.json();
                const address = data.display_name;
                
                let identifiedBarangay = user?.assigned_barangay || formData.barangay || 'Langgam';
                const barangayOptions = ['Langgam', 'Calendola', 'GSIS', 'Magsaysay', 'Sampaguita', 'UBL', 'UB', 'Laram', 'Estrella', 'Bagong Silang', 'Riverside', 'Narra'];
                for (const b of barangayOptions) {
                    if (address.toLowerCase().includes(b.toLowerCase())) {
                        identifiedBarangay = b;
                        break;
                    }
                }

                setFormData(prev => ({
                    ...prev,
                    exact_address: address,
                    barangay: identifiedBarangay,
                    is_location_verified: true
                }));
                setMapCenter([lat, lon]); 
            }
        } catch (err) {
            console.error("Reverse geocoding error:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleMapClick = (lat, lng) => {
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng, is_location_verified: true }));
        handleReverseGeocode(lat, lng);
    };

    const handleDragEnd = (lat, lng) => {
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng, is_location_verified: true }));
        handleReverseGeocode(lat, lng);
    };

    // --- Form Handlers ---
    const handleChange = (e) => {
        const { name, type, checked, value } = e.target;
        
        if (name === 'exact_address') {
            skipNextFetch.current = false;
        }

        let newFormData = {
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        };



        if (name === 'dob') {
            if (newFormData.hepatitis_b_status === 'Given within 24 hours') {
                newFormData.hepatitis_b_date = value;
            }
        }

        // --- Clinical Automation: Birth Status ---
        if (name === 'birth_weight') {
            const weight = parseFloat(value);
            if (!isNaN(weight)) {
                newFormData.birth_status = weight < 2.5 ? 'Low Birth Weight' : weight > 4.0 ? 'Macrosomia' : 'Normal';
            }
        }
        
        // Logical Resets
        if (name === 'tt_history_unknown' && checked) {
            newFormData.mother_tt_status = '0';
            newFormData.last_tt_date = '';
        }
        // --- Immunization Logic & Automation ---
        if (name === 'bcg_status') {
            if (value === 'Not Given' || value === 'Unknown' || value === '') {
                newFormData.bcg_date = '';
            }
        }
        
        if (name === 'hepatitis_b_status') {
            if (value === 'Given within 24 hours') {
                newFormData.hepatitis_b_date = formData.dob;
            } else if (value === 'Not Given' || value === 'Unknown' || value === '') {
                newFormData.hepatitis_b_date = '';
            }
        }

        setFormData(newFormData);
        const errorMessage = validateField(name, type === 'checkbox' ? checked : value);
        setErrors(prev => ({ ...prev, [name]: errorMessage }));
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;
        const nameFields = ['first_name', 'last_name', 'middle_name', 'suffix', 'mothers_maiden_name', 'father_name', 'exact_address'];
        if (nameFields.includes(name) && value) {
            const titleCased = value.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            setFormData(prev => ({ ...prev, [name]: titleCased }));
        }
    };

    const handleNext = async () => {
        if (!isStepValid(currentStep, formData, errors)) {
            // Force error display on missing fields
            const stepFields = {
                1: ['first_name', 'last_name', 'dob', 'sex', 'barangay', 'exact_address', 'landmark'],
                2: ['mothers_maiden_name', 'caregiver_relationship', 'caregiver_phone'],
                3: ['birth_weight', 'length_at_birth_cm'],
                4: ['bcg_status', 'hepatitis_b_status']
            }[currentStep] || [];
            
            const newErrors = { ...errors };
            stepFields.forEach(f => {
                const fieldError = validateField(f, formData[f]);
                if (fieldError) newErrors[f] = fieldError;
                else if (formData[f] === '' || formData[f] === null || formData[f] === undefined) {
                    newErrors[f] = "Required";
                }
            });
            setErrors(newErrors);
            console.log("Form Validation Errors:", newErrors);
            return;
        }

        if (currentStep === 4) {
            setIsCheckingDuplicates(true);
            try {
                const res = await apiClient.post('/infants/check-duplicates', formData);
                if (res.ok) {
                    const data = await res.json();
                    setDuplicateMatches(data.matches || []);
                }
            } catch (err) {
                console.error("Duplicate check failed:", err);
            } finally {
                setIsCheckingDuplicates(false);
            }
        }

        setCurrentStep(prev => Math.min(prev + 1, 5));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        setCurrentStep(prev => Math.max(prev - 1, 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveDraft = async () => {
        setIsSavingDraft(true);
        setSubmissionError(null);
        try {
            const res = await apiClient.post('/registrations', {
                data: { ...formData, registration_status: 'DRAFT' }
            });
            if (res.ok) {
                setToast('Draft Saved Successfully');
                setTimeout(() => setToast(null), 3000);
            } else {
                const err = await res.json();
                setSubmissionError(err.error || 'Failed to save draft');
            }
        } catch (e) {
            setSubmissionError('Network error while saving draft');
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleConfirmSubmit = async () => {
        setIsSubmitting(true);
        setSubmissionError(null);
        try {
            const normalizedFormData = {
                ...formData,
                barangay: formData.barangay?.toUpperCase()
            };
            let res;
            if (userRole === 'BHW') {
                // BHW Workflow: Submit for validation
                res = await apiClient.post('/registrations', {
                    data: { ...normalizedFormData, status: 'Pending', registration_status: 'PENDING_VALIDATION' }
                });
            } else if (formData.is_emergency) {
                // Midwife Emergency Workflow: Direct promotion with justification
                res = await apiClient.post('/registrations/emergency', {
                    data: normalizedFormData,
                    justification: formData.emergency_justification
                });
            } else {
                // Midwife Standard Workflow: Direct registration
                const payload = { 
                    ...normalizedFormData, 
                    registration_status: 'VALIDATED',
                    is_duplicate: duplicateMatches.length > 0,
                    duplicate_override_reason: overrideReason
                };
                res = await apiClient.post('/infants', payload);
            }

            if (res.ok) {
                const data = await res.json(); 
                const returnedData = data.data || data;

                if (userRole === 'BHW') {
                    isMounted.current = false;
                    navigate('/bhw/dashboard', { replace: true });
                    if (onComplete) onComplete();
                    return;
                }

                setRegisteredInfantInfo({
                    id: returnedData.id || returnedData.infantId,
                    name: `${formData.first_name} ${formData.last_name}`,
                    referenceId: returnedData.reference_id || returnedData.referenceId
                });
                setIsSuccess(true); 
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (onComplete) onComplete();
            } else {
                const data = await res.json();
                setSubmissionError(data.error || 'Registration failed.');
            }
        } catch(e) {
            setSubmissionError('Network error connecting to Backend.');
        } finally {
            if (isMounted.current) {
                setIsSubmitting(false);
            }
        }
    };


    if (isSuccess) {
        return (
            <div className="min-h-screen bg-[#F4F7F4] -m-4 md:-m-8 pb-24 font-sans flex items-center justify-center p-6">
                <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl border border-slate-200 p-12 text-center animate-in zoom-in-95 fade-in duration-500">
                    <div className="w-24 h-24 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-10">
                        <div className="w-16 h-16 bg-[#065f46] rounded-full flex items-center justify-center shadow-lg shadow-green-200">
                            <CheckCircle className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 mb-4">Registration Complete</h1>
                    <p className="text-slate-500 font-medium mb-12 leading-relaxed">
                        <span className="font-black text-slate-800">{registeredInfantInfo?.name}</span> has been securely added to the registry. 
                        {user?.role === 'BHW' ? ' Midwife validation is now required.' : ' Schedules and clinical records are now active.'}
                    </p>
                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={() => navigate(userRole === 'BHW' ? `/bhw/infants/${registeredInfantInfo?.id}` : `/clinical/infants/${registeredInfantInfo?.id}`)}
                            className="w-full bg-[#065f46] hover:bg-[#064E3B] text-white py-3 px-8 rounded-md font-semibold text-sm uppercase tracking-wide shadow-md transition-all active:scale-95">
                            View Infant Record
                        </button>
                        <button 
                            onClick={resetForm}
                            className="w-full border-2 border-[#065f46] text-[#065f46] bg-transparent hover:bg-emerald-50 py-3 px-8 rounded-md font-semibold text-sm uppercase tracking-wide transition-all">
                            Register Another Infant
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F4F7F4] -m-4 md:-m-8 pb-24 font-sans relative">
            {toast && (
                <div className="fixed top-24 right-8 bg-[#064E3B] text-white px-8 py-4 rounded-2xl shadow-2xl z-[9999] flex items-center gap-4 animate-in fade-in slide-in-from-top-5">
                    <Check className="w-5 h-5 text-green-300" />
                    <span className="font-black text-xs uppercase tracking-widest">{toast}</span>
                </div>
            )}

            <div className="max-w-4xl mx-auto pt-10 px-4">
                <button
                    onClick={() => navigate(userRole === 'BHW' ? '/bhw/dashboard' : '/clinical/dashboard')}
                    className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors mb-6 font-bold text-xs uppercase tracking-wider"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Dashboard</span>
                </button>
                <div className="flex items-center justify-between mb-10">
                    <div>
                        <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-4">
                            <ClipboardCheck className="w-10 h-10 text-[#065f46]" />
                            Registration Gate
                        </h1>
                        <p className="text-slate-500 font-bold text-sm mt-2">Clinical Intake & Spatial Validation System</p>
                    </div>
                </div>

                {((formData.status === 'Needs Correction' || formData.status === 'NEEDS_CORRECTION' || formData.registration_status === 'NEEDS_CORRECTION' || formData.registration_status === 'Needs Correction') && formData.correction_notes) && (
                    <div className="mb-8 bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 flex items-center gap-4 animate-in slide-in-from-top-5">
                        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-amber-800 uppercase tracking-[0.15em]">⚠️ Midwife Notes / Correction Required</span>
                            <span className="text-sm font-bold text-amber-950 mt-1">{formData.correction_notes}</span>
                        </div>
                    </div>
                )}

                {/* Pending Validation Banner */}
                {(currentStatus === 'PENDING' || currentStatus === 'PENDING_VALIDATION') && (
                    <div className="mb-8 bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 flex items-center gap-4 animate-in slide-in-from-top-5">
                        <Info className="w-6 h-6 text-blue-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-blue-800 uppercase tracking-[0.15em]">🔒 Pending Validation</span>
                            <span className="text-sm font-bold text-blue-950 mt-1">This record is currently locked and pending validation by your Midwife.</span>
                        </div>
                    </div>
                )}

                {/* Rejected Banner */}
                {currentStatus === 'REJECTED' && (
                    <div className="mb-8 bg-red-50 border-2 border-red-200 rounded-2xl p-6 flex items-center gap-4 animate-in slide-in-from-top-5">
                        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-red-800 uppercase tracking-[0.15em]">❌ Record Rejected</span>
                            <span className="text-sm font-bold text-red-950 mt-1">
                                RECORD REJECTED: {formData.correction_notes || 'No reason specified.'}
                            </span>
                        </div>
                    </div>
                )}

                <StepIndicator currentStep={currentStep} steps={STEPS} isReadOnly={isReadOnly} />

                <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-200 overflow-hidden mb-12">
                    <div className="p-10 md:p-12">
                        {currentStep === 1 && (
                            <IdentitySection 
                                formData={formData} 
                                errors={errors} 
                                handleChange={handleChange} 
                                handleBlur={handleBlur}
                                handleSelectSuggestion={handleSelectSuggestion}
                                searchResults={searchResults}
                                isSearching={isSearching}
                                noResultsFound={noResultsFound}
                                mapCenter={mapCenter}
                                handleMapClick={handleMapClick}
                                handleDragEnd={handleDragEnd}
                            />
                        )}
                        {currentStep === 2 && <GuardianSection formData={formData} errors={errors} handleChange={handleChange} handleBlur={handleBlur} />}
                        {currentStep === 3 && <MaternalBirthSection formData={formData} errors={errors} handleChange={handleChange} handleBlur={handleBlur} />}
                        {currentStep === 4 && <ImmunizationSection formData={formData} errors={errors} handleChange={handleChange} />}
                        {currentStep === 5 && (
                            <ReviewSection 
                                formData={formData} 
                                duplicateMatches={duplicateMatches} 
                                overrideReason={overrideReason} 
                                setOverrideReason={setOverrideReason} 
                                userRole={userRole}
                                handleChange={handleChange}
                                isReadOnly={isReadOnly}
                            />
                        )}
                    </div>

                    <div className="bg-slate-50/50 border-t border-slate-200 p-8 flex items-center justify-between">
                        {!isReadOnly ? (
                            <>
                                <button 
                                    onClick={handleBack}
                                    disabled={currentStep === 1 || isSubmitting}
                                    className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all ${
                                        currentStep === 1 ? 'opacity-0 pointer-events-none' : 'text-slate-400 hover:text-slate-800'
                                    }`}>
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>

                                <div className="flex items-center gap-6">
                                    {userRole === 'BHW' && currentStep === 5 && (
                                        <button 
                                            onClick={handleSaveDraft}
                                            disabled={isSavingDraft || isSubmitting}
                                            className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-3 rounded-md font-semibold text-sm uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-50">
                                            {isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            Save Draft
                                        </button>
                                    )}
                                    {currentStep < 5 ? (
                                        <button 
                                            onClick={handleNext}
                                            disabled={isCheckingDuplicates}
                                            className="flex items-center gap-3 bg-[#065f46] hover:bg-[#064E3B] text-white px-8 py-3 rounded-md font-semibold text-sm uppercase tracking-wide shadow-md transition-all active:scale-[0.98] disabled:opacity-50">
                                            {isCheckingDuplicates ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Checking...
                                                </>
                                            ) : (
                                                <>
                                                    Next Step
                                                    <ChevronRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={handleConfirmSubmit}
                                            disabled={isSubmitting || (duplicateMatches.length > 0 && !overrideReason) || !formData.latitude || !formData.longitude || !formData.exact_address || (formData.is_emergency && !formData.emergency_justification)}
                                            className="flex items-center gap-3 bg-[#065f46] hover:bg-[#064E3B] text-white px-8 py-3 rounded-md font-semibold text-sm uppercase tracking-wide shadow-md transition-all active:scale-[0.98] disabled:opacity-50">
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Committing...
                                                </>
                                            ) : (
                                                <>
                                                    <SaveAll className="w-5 h-5" />
                                                    {userRole === 'BHW' ? 'Submit for Validation' : 'Finish & Register'}
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="w-full flex justify-center py-2">
                                <span className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                    🔒 This record is in Read-Only Mode
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {submissionError && (
                    <div className="mt-8 bg-red-50 border-2 border-red-200 rounded-2xl p-6 flex items-center gap-4 animate-in shake duration-500">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-red-800 uppercase tracking-[0.15em]">Submission Error</span>
                            <span className="text-sm font-bold text-red-900">{submissionError}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
