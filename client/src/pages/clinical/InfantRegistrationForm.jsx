import React from 'react';
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
import {
    getBarangayFromAddress,
    isInsideSanPedro,
    normalizeAddressResult,
    rankSuggestions,
    reverseGeocodeLatLng
} from '../../utils/addressGeocoding';
import { hasValidCoordinate, toDecimalFloat } from './registration/LocationPicker';

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
    precision: '',
    location_precision: '',
    is_location_verified: false,
    // BHW/Emergency fields
    is_emergency: false,
    emergency_justification: ''
};

const readApiError = async (response, fallbackMessage) => {
    try {
        const data = await response.json();
        return data?.details || data?.message || data?.error || fallbackMessage;
    } catch {
        return fallbackMessage;
    }
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
    const correctionMessage = formData.correction_notes || '';

    // Geocoding States
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [noResultsFound, setNoResultsFound] = useState(false);
    const [addressLookupError, setAddressLookupError] = useState('');
    const [addressLookupWarning, setAddressLookupWarning] = useState('');
    const [mapCenter, setMapCenter] = useState([14.3596, 121.0426]); 
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchDebounceRef = useRef(null);
    const searchAbortRef = useRef(null);
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
        setAddressLookupError('');
        setAddressLookupWarning('');
        setDuplicateMatches([]);
        setOverrideReason('');
        setRegisteredInfantInfo(null);
        setSearchResults([]);
        setShowSuggestions(false);
        setMapCenter([center.lat, center.lng]);
    }, [user?.assigned_barangay]);

    // --- Initialize Spatial Context on Mount ---
    useEffect(() => {
        const targetName = user?.assigned_barangay || 'MUNICIPALITY';
        const center = getBarangayCenter(targetName);
        setFormData(prev => ({ ...prev, barangay: user?.assigned_barangay?.toUpperCase() || '' }));
        setMapCenter([center.lat, center.lng]);
    }, [user?.assigned_barangay]);

    useEffect(() => {
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
            searchAbortRef.current?.abort();
        };
    }, []);

    const runAddressSuggestionSearch = useCallback(async (query, { selectFirst = false } = {}) => {
        const trimmedQuery = (query || '').trim();

        searchAbortRef.current?.abort();

        if (!trimmedQuery || trimmedQuery.length < 3) {
            setSearchResults([]);
            setNoResultsFound(false);
            setAddressLookupError('');
            setShowSuggestions(false);
            return;
        }

        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);
        setNoResultsFound(false);
        setSubmissionError(null);

        try {
            const userBarangay = user?.assigned_barangay || formData.barangay || '';
            const params = new URLSearchParams({
                q: trimmedQuery,
                barangay: userBarangay,
                city: 'San Pedro',
                state: 'Laguna',
                country: 'Philippines',
                addressdetails: '1'
            });

            const response = await apiClient.get(`/geo/search?${params.toString()}`, {
                signal: controller.signal
            });

            if (response.status === 429) {
                throw new Error('RATE_LIMIT');
            }

            if (!response.ok) throw new Error('FETCH_ERROR');

            const data = await response.json();
            const rankedResults = rankSuggestions(
                (data || []).map(normalizeAddressResult).filter(Boolean),
                trimmedQuery,
                userBarangay
            );

            if (selectFirst) {
                setSearchResults([]);
                setNoResultsFound(rankedResults.length === 0);
                setShowSuggestions(false);

                if (rankedResults.length === 0) {
                    setAddressLookupError('Could not find a San Pedro address match. Please click the map to pin the exact household point.');
                    return;
                }

                handleSelectSuggestion(rankedResults[0]);
                return;
            }

            setSearchResults(rankedResults);
            setShowSuggestions(true);
            setNoResultsFound(rankedResults.length === 0);
            setAddressLookupError(rankedResults.length === 0 ? 'Could not find an exact address. Please click the map or refine the search.' : '');
            setAddressLookupWarning(
                rankedResults.length > 0 && rankedResults.every((result) => result.precision === 'barangay')
                    ? 'Only barangay-level result found. Type a street/purok/landmark or click the exact map location.'
                    : ''
            );
        } catch (err) {
            if (err.name === 'AbortError') return;

            if (err.message === 'RATE_LIMIT') {
                setSubmissionError("Geocoding server busy. Please wait a few seconds...");
            } else {
                console.error("Geocoding failure:", err);
            }
            setSearchResults([]);
            setShowSuggestions(false);
        } finally {
            setIsSearching(false);
        }
    }, [user?.assigned_barangay, formData.barangay]);

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
                        const existingLat = toDecimalFloat(flatData.latitude);
                        const existingLng = toDecimalFloat(flatData.longitude);
                        if (hasValidCoordinate(existingLat, existingLng)) {
                            setFormData(prev => ({ ...prev, latitude: existingLat, longitude: existingLng }));
                            setMapCenter([existingLat, existingLng]);
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



    const updateLocationFields = useCallback((locationData = {}) => {
        const lat = toDecimalFloat(locationData.latitude ?? locationData.lat);
        const lng = toDecimalFloat(locationData.longitude ?? locationData.lng ?? locationData.lon);

        if (!hasValidCoordinate(lat, lng)) {
            setAddressLookupError('Location coordinates are invalid. Please select another San Pedro address or click the map.');
            return false;
        }

        const addressLabel = locationData.exact_address || locationData.current_address || '';
        if (!isInsideSanPedro(lat, lng, addressLabel)) {
            setAddressLookupError('Selected location is outside San Pedro, Laguna.');
            return false;
        }

        setFormData(prev => ({
            ...prev,
            ...(locationData.exact_address ? { exact_address: locationData.exact_address } : {}),
            ...(locationData.current_address ? { current_address: locationData.current_address } : {}),
            ...(locationData.locality ? { locality: locationData.locality } : {}),
            ...(locationData.barangay ? { barangay: locationData.barangay } : {}),
            latitude: lat,
            longitude: lng,
            precision: locationData.precision || prev.precision || 'approximate',
            location_precision: locationData.location_precision || locationData.precision || prev.location_precision || 'approximate',
            is_location_verified: locationData.is_location_verified ?? true
        }));
        setErrors(prev => ({ ...prev, exact_address: '' }));
        setMapCenter([lat, lng]);
        return true;
    }, []);

    const buildRegistrationPayload = useCallback((data, overrides = {}) => ({
        data: {
            ...data,
            sex: data.sex === 'M' || data.sex === 'F' ? data.sex : '',
            latitude: toDecimalFloat(data.latitude),
            longitude: toDecimalFloat(data.longitude),
            exact_address: data.exact_address || '',
            current_address: data.current_address || data.exact_address || '',
            registration_status: data.registration_status,
            ...overrides
        }
    }), []);

    const handleSelectSuggestion = (res) => {
        const normalizedResult = normalizeAddressResult(res);
        if (!normalizedResult) return;

        const lat = toDecimalFloat(normalizedResult.lat);
        const lon = toDecimalFloat(normalizedResult.lon);
        const address = normalizedResult.display_name;
        const identifiedBarangay = normalizedResult.barangay || user?.assigned_barangay || formData.barangay || '';
        const precision = normalizedResult.precision || 'approximate';
        const assignedBarangay = (user?.assigned_barangay || '').toUpperCase();
        const isBarangayMismatch = assignedBarangay && identifiedBarangay && assignedBarangay !== identifiedBarangay.toUpperCase();
        const lowPrecisionWarning = precision === 'barangay'
            ? 'Barangay-level only - type street/purok/landmark or click exact location on map.'
            : precision === 'approximate'
                ? 'Address label is approximate. Click the exact map location if needed.'
                : '';

        updateLocationFields({
            exact_address: address,
            current_address: address,
            locality: identifiedBarangay,
            latitude: lat,
            longitude: lon,
            precision,
            location_precision: precision,
            barangay: identifiedBarangay,
            is_location_verified: true
        });
        
        setSearchResults([]);
        setShowSuggestions(false);
        setNoResultsFound(false);
        setAddressLookupError('');
        setAddressLookupWarning(isBarangayMismatch ? 'Location is inside San Pedro but outside your assigned barangay.' : lowPrecisionWarning);
    };

    const handleAddressSearchSubmit = async () => {
        const query = (formData.exact_address || '').trim();
        if (query.length < 3) return;

        if (searchResults.length > 0) {
            handleSelectSuggestion(searchResults[0]);
            return;
        }

        setAddressLookupError('');
        setAddressLookupWarning('');
        runAddressSuggestionSearch(query, { selectFirst: true });
    };

    const handleReverseGeocode = async (lat, lon) => {
        const controller = new AbortController();
        setIsSearching(true);
        setSearchResults([]);
        setShowSuggestions(false);
        setNoResultsFound(false);
        setAddressLookupError('');
        setAddressLookupWarning('');
        try {
            const result = await reverseGeocodeLatLng({ apiClient, lat, lng: lon, signal: controller.signal, clicked: true });
            if (!result) {
                if (!isInsideSanPedro(lat, lon)) {
                    setAddressLookupError('Selected location is outside San Pedro, Laguna.');
                    return;
                }

                const fallbackBarangay = user?.assigned_barangay || formData.barangay || 'San Pedro';
                const fallbackAddress = `Pinned GPS point, ${fallbackBarangay}, San Pedro, Laguna, Philippines`;
                updateLocationFields({
                    exact_address: fallbackAddress,
                    current_address: fallbackAddress,
                    locality: fallbackBarangay,
                    latitude: lat,
                    longitude: lon,
                    precision: 'approximate',
                    location_precision: 'approximate',
                    barangay: fallbackBarangay,
                    is_location_verified: true
                });
                setSearchResults([]);
                setShowSuggestions(false);
                setNoResultsFound(false);
                setAddressLookupWarning('Exact GPS point saved. Address label is approximate.');
                return;
            }

            const address = result.display_name;
            const identifiedBarangay = result.barangay || getBarangayFromAddress(result) || user?.assigned_barangay || formData.barangay || '';
            const precision = result.precision || 'approximate';
            const assignedBarangay = (user?.assigned_barangay || '').toUpperCase();
            const isBarangayMismatch = assignedBarangay && identifiedBarangay && assignedBarangay !== identifiedBarangay.toUpperCase();
            const lowPrecisionWarning = precision === 'approximate' || precision === 'barangay'
                ? 'Exact GPS point saved. Address label is approximate.'
                : '';

            updateLocationFields({
                exact_address: address,
                current_address: address,
                locality: identifiedBarangay,
                latitude: lat,
                longitude: lon,
                precision,
                location_precision: precision,
                barangay: identifiedBarangay,
                is_location_verified: true
            });
            setSearchResults([]);
            setShowSuggestions(false);
            setNoResultsFound(false);
            setAddressLookupWarning(isBarangayMismatch ? 'Location is inside San Pedro but outside your assigned barangay.' : lowPrecisionWarning);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Reverse geocoding error:", err);
                if (isInsideSanPedro(lat, lon)) {
                    const fallbackBarangay = user?.assigned_barangay || formData.barangay || 'San Pedro';
                    const fallbackAddress = `Pinned GPS point, ${fallbackBarangay}, San Pedro, Laguna, Philippines`;
                    updateLocationFields({
                        exact_address: fallbackAddress,
                        current_address: fallbackAddress,
                        locality: fallbackBarangay,
                        latitude: lat,
                        longitude: lon,
                        precision: 'approximate',
                        location_precision: 'approximate',
                        barangay: fallbackBarangay,
                        is_location_verified: true
                    });
                    setAddressLookupWarning('Exact GPS point saved. Address label is approximate.');
                } else {
                    setAddressLookupError('Selected location is outside San Pedro, Laguna.');
                }
            }
        } finally {
            setIsSearching(false);
        }
    };

    const handleMapClick = (lat, lng) => {
        const latitude = toDecimalFloat(lat);
        const longitude = toDecimalFloat(lng);
        if (!hasValidCoordinate(latitude, longitude)) return;
        searchAbortRef.current?.abort();
        setSearchResults([]);
        setShowSuggestions(false);
        setNoResultsFound(false);
        updateLocationFields({ latitude, longitude, precision: 'approximate', location_precision: 'approximate', is_location_verified: true });
        handleReverseGeocode(latitude, longitude);
    };

    const handleDragEnd = (lat, lng) => {
        const latitude = toDecimalFloat(lat);
        const longitude = toDecimalFloat(lng);
        if (!hasValidCoordinate(latitude, longitude)) return;
        searchAbortRef.current?.abort();
        setSearchResults([]);
        setShowSuggestions(false);
        setNoResultsFound(false);
        updateLocationFields({ latitude, longitude, precision: 'approximate', location_precision: 'approximate', is_location_verified: true });
        handleReverseGeocode(latitude, longitude);
    };

    // --- Form Handlers ---
    const handleChange = (e) => {
        const { name, type, checked, value } = e.target;
        
        if (name === 'exact_address') {
            setAddressLookupWarning('');
            setSearchResults([]);
            setShowSuggestions(false);
        }

        let newFormData = {
            ...formData,
            [name]: type === 'checkbox' ? checked : value
        };

        if (name === 'exact_address') {
            newFormData = {
                ...newFormData,
                latitude: null,
                longitude: null,
                precision: '',
                location_precision: '',
                is_location_verified: false
            };
        }



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

    const handleAddressInputChange = (event) => {
        handleChange(event);

        const query = event.target.value || '';
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

        setAddressLookupWarning('');
        setAddressLookupError('');
        setNoResultsFound(false);

        if (query.trim().length < 3) {
            searchAbortRef.current?.abort();
            setSearchResults([]);
            setShowSuggestions(false);
            return;
        }

        searchDebounceRef.current = setTimeout(() => {
            runAddressSuggestionSearch(query);
        }, 350);
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
            const res = await apiClient.post('/registrations', buildRegistrationPayload(formData, { registration_status: 'DRAFT' }));
            if (res.ok) {
                setToast('Draft Saved Successfully');
                setTimeout(() => setToast(null), 3000);
            } else {
                const errorMessage = await readApiError(res, 'Failed to save draft');
                setSubmissionError(errorMessage);
            }
        } catch (e) {
            setSubmissionError(e.message || 'Network error while saving draft');
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
                barangay: formData.barangay?.toUpperCase(),
                sex: formData.sex === 'M' || formData.sex === 'F' ? formData.sex : '',
                latitude: toDecimalFloat(formData.latitude),
                longitude: toDecimalFloat(formData.longitude),
                exact_address: formData.exact_address || '',
                current_address: formData.current_address || formData.exact_address || ''
            };
            let res;
            if (userRole === 'BHW') {
                // BHW Workflow: Submit for validation
                res = await apiClient.post('/registrations', buildRegistrationPayload(normalizedFormData, { status: 'Pending', registration_status: 'PENDING_VALIDATION' }));
            } else if (formData.is_emergency) {
                // Midwife Emergency Workflow: Direct promotion with justification
                res = await apiClient.post('/registrations/emergency', {
                    data: normalizedFormData,
                    justification: formData.emergency_justification
                });
            } else {
                setSubmissionError('Only BHW accounts can create infant registrations. Midwives validate submitted registrations from the queue.');
                return;
            }

            if (res.ok) {
                const data = await res.json(); 
                const returnedData = data.data || data;

                if (userRole === 'BHW') {
                    setRegisteredInfantInfo({
                        id: returnedData.id || returnedData.infantId,
                        name: `${formData.first_name} ${formData.last_name}`,
                        referenceId: returnedData.reference_id || returnedData.referenceId
                    });
                    setIsSuccess(true);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                const errorMessage = await readApiError(res, 'Registration failed.');
                setSubmissionError(errorMessage);
            }
        } catch(e) {
            setSubmissionError(e.message || 'Network error connecting to Backend.');
        } finally {
            if (isMounted.current) {
                setIsSubmitting(false);
            }
        }
    };


    if (isSuccess) {
        const isBhwSuccess = userRole === 'BHW';
        return (
            <div className="min-h-screen bg-[#F4F7F4] -m-4 md:-m-8 pb-24 font-sans flex items-center justify-center p-6">
                <div className="fixed inset-0 bg-slate-900/40"></div>
                <div className="bg-white max-w-lg w-full rounded-md shadow-sm border border-slate-200 p-8 text-center relative z-10 animate-in zoom-in-95 fade-in duration-300">
                    <div className="w-14 h-14 mx-auto bg-emerald-50 rounded-md flex items-center justify-center mb-6 border border-emerald-100">
                        <CheckCircle className="w-8 h-8 text-emerald-800" />
                    </div>
                    <h1 className="text-xl font-black text-slate-900 mb-3">
                        {isBhwSuccess ? 'Registration Submitted Successfully' : 'Registration Complete'}
                    </h1>
                    <p className="text-sm text-slate-600 font-semibold mb-8 leading-relaxed">
                        {isBhwSuccess
                            ? 'Registration Submitted Successfully. This record is now pending validation by the assigned Midwife.'
                            : (
                                <>
                                    <span className="font-black text-slate-800">{registeredInfantInfo?.name}</span> has been securely added to the registry. Schedules and clinical records are now active.
                                </>
                            )}
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        {isBhwSuccess ? (
                            <>
                                <button
                                    onClick={resetForm}
                                    className="flex-1 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 py-3 px-5 rounded-md font-black text-xs uppercase tracking-wider transition-colors">
                                    Register Another Infant
                                </button>
                                <button
                                    onClick={() => navigate('/bhw/dashboard')}
                                    className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white py-3 px-5 rounded-md font-black text-xs uppercase tracking-wider transition-colors">
                                    Go to Dashboard
                                </button>
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => navigate(`/clinical/infants/${registeredInfantInfo?.id}`)}
                                    className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white py-3 px-5 rounded-md font-black text-xs uppercase tracking-wider transition-colors">
                                    View Infant Record
                                </button>
                                <button 
                                    onClick={resetForm}
                                    className="flex-1 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 py-3 px-5 rounded-md font-black text-xs uppercase tracking-wider transition-colors">
                                    Register Another Infant
                                </button>
                            </>
                        )}
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

                {((formData.status === 'Needs Correction' || formData.status === 'NEEDS_CORRECTION' || formData.registration_status === 'NEEDS_CORRECTION' || formData.registration_status === 'Needs Correction') && correctionMessage) && (
                    <div className="mb-8 bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 flex items-center gap-4 animate-in slide-in-from-top-5">
                        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-amber-800 uppercase tracking-[0.15em]">Return for Correction</span>
                            <span className="text-sm font-bold text-amber-950 mt-1">{correctionMessage}</span>
                        </div>
                    </div>
                )}

                {/* Pending Validation Banner */}
                {(currentStatus === 'PENDING' || currentStatus === 'PENDING_VALIDATION') && (
                    <div className="mb-8 bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 flex items-center gap-4 animate-in slide-in-from-top-5">
                        <Info className="w-6 h-6 text-blue-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-blue-800 uppercase tracking-[0.15em]">ðŸ”’ Pending Validation</span>
                            <span className="text-sm font-bold text-blue-950 mt-1">This record is currently locked and pending validation by your Midwife.</span>
                        </div>
                    </div>
                )}

                {/* Rejected Banner */}
                {currentStatus === 'REJECTED' && (
                    <div className="mb-8 bg-red-50 border-2 border-red-200 rounded-2xl p-6 flex items-center gap-4 animate-in slide-in-from-top-5">
                        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-red-800 uppercase tracking-[0.15em]">Record Rejected</span>
                            <span className="text-sm font-bold text-red-950 mt-1">
                                RECORD REJECTED: {correctionMessage || 'No reason specified.'}
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
                                addressLookupError={addressLookupError}
                                addressLookupWarning={addressLookupWarning}
                                noResultsFound={noResultsFound}
                                mapCenter={mapCenter}
                                handleAddressSearchSubmit={handleAddressSearchSubmit}
                                handleAddressInputChange={handleAddressInputChange}
                                showSuggestions={showSuggestions}
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
                                    ðŸ”’ This record is in Read-Only Mode
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
