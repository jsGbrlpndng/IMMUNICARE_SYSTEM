import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    CheckCircle, 
    XCircle, 
    AlertCircle, 
    ChevronRight, 
    Search, 
    User,
    Phone,
    MapPin,
    Clock,
    Shield,
    Baby,
    Activity,
    Info
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { formatFullNameFromObject } from '../../utils/formatFullName';

const REJECTION_REASONS = [
    'Confirmed Duplicate',
    'Invalid Data',
    'Out of Jurisdiction',
    'Other'
];

const normalizeWorkflowValue = (value) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

const ValidationPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const [pendingRegistrations, setPendingRegistrations] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [stats, setStats] = useState({ processed_today: 0 });
    const [rejectionReason, setRejectionReason] = useState('');
    const [rejectionNotes, setRejectionNotes] = useState('');
    const [rejectionError, setRejectionError] = useState('');
    const [showRejectionModal, setShowRejectionModal] = useState(false);
    const [correctionNote, setCorrectionNote] = useState('');
    const [showRevisionModal, setShowRevisionModal] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalSuccess, setApprovalSuccess] = useState(null);
    const [resolvingDuplicateAlert, setResolvingDuplicateAlert] = useState(false);
    const persistedRecordId = searchParams.get('record');

    const fetchQueue = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/validation/queue');
            if (res.ok) {
                const data = await res.json();
                // Task 3: Safe, robust verification and fallback of API response extraction shape
                setPendingRegistrations(data?.queue || data?.data || data || []);
                setStats(data?.stats || { processed_today: 0 });
            }
        } catch (err) {
            console.error('[Validation] Fetch error:', err);
            setFeedback({ type: 'error', message: 'Failed to load validation queue' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    useEffect(() => {
        if (persistedRecordId && persistedRecordId !== selectedId) {
            setSelectedId(persistedRecordId);
        }
    }, [persistedRecordId, selectedId]);

    useEffect(() => {
        if (!selectedId) {
            setSelectedDetail(null);
            return;
        }

        let cancelled = false;
        const fetchDetail = async () => {
            setDetailLoading(true);
            try {
                const res = await apiClient.get(`/validation/${selectedId}`);
                const data = await res.json().catch(() => ({}));
                if (!cancelled) {
                    if (res.ok && data?.success !== false) {
                        setSelectedDetail(data);
                    } else {
                        setFeedback({ type: 'error', message: data?.error || 'Failed to load validation detail' });
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('[Validation Detail] Fetch error:', err);
                    setFeedback({ type: 'error', message: 'Failed to load validation detail' });
                }
            } finally {
                if (!cancelled) setDetailLoading(false);
            }
        };

        fetchDetail();
        return () => {
            cancelled = true;
        };
    }, [selectedId]);

    useEffect(() => {
        if (!selectedId) {
            if (searchParams.has('record')) {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete('record');
                setSearchParams(nextParams, { replace: true });
            }
            return;
        }

        if (searchParams.get('record') !== selectedId) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('record', selectedId);
            setSearchParams(nextParams, { replace: true });
        }
    }, [searchParams, selectedId, setSearchParams]);

    const queueRecord = pendingRegistrations?.find(q => q.id === selectedId);
    const selectedRecord = selectedDetail?.registration
        ? { ...(queueRecord || {}), ...selectedDetail.registration }
        : queueRecord;

    const normalizeStatus = (status) => {
        if (!status) return 'Pending';
        const s = status.toString().replace('_', ' ').toLowerCase();
        if (s.includes('given') && !s.includes('not given')) {
            if (s.includes('within 24 hours')) return 'Given within 24 hours';
            if (s.includes('more than 24 hours')) return 'Given more than 24 hours';
            return 'Given';
        }
        if (s.includes('not given')) return 'Not Given';
        if (s.includes('unknown')) return 'Unknown';
        return 'Pending';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '--';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    };

    const getStatusColor = (status) => {
        if (!status) return 'text-slate-500';
        const s = status.toString().replace('_', ' ').toLowerCase();
        if (s.includes('given') && !s.includes('not given')) return 'text-emerald-600';
        if (s.includes('not given')) return 'text-red-600';
        if (s.includes('unknown')) return 'text-slate-500';
        return 'text-slate-500';
    };

    const getStatusBgClass = (status) => {
        if (!status) return 'bg-slate-50 border-slate-200';
        const s = status.toString().replace('_', ' ').toLowerCase();
        if (s.includes('given') && !s.includes('not given')) return 'bg-emerald-50/30 border-emerald-200';
        if (s.includes('not given')) return 'bg-red-50/30 border-red-200';
        return 'bg-slate-50 border-slate-200';
    };

    const formatValidationEventLabel = (value) => {
        const normalized = String(value || '').trim().toUpperCase();
        if (normalized === 'RETURNED_FOR_CORRECTION') return 'Returned for Correction';
        if (normalized === 'REJECTED') return 'Rejected';
        if (normalized === 'APPROVED') return 'Approved';
        if (normalized === 'DIRECT_CORRECTION') return 'Direct Correction';
        return value || 'Validation Event';
    };

    const bcgDateRaw = selectedRecord?.bcg_date_given || selectedRecord?.bcg_date;
    const hepaBDateRaw = selectedRecord?.hepa_b_date_given || selectedRecord?.hepa_b_date || selectedRecord?.hepatitis_b_date;

    const record = selectedRecord ? {
        ...selectedRecord,
        bcg_status: normalizeStatus(selectedRecord?.bcg_status),
        hepa_b_status: normalizeStatus(selectedRecord?.hepa_b_status || selectedRecord?.hepatitis_b_status),
        bcg_date_given: formatDate(bcgDateRaw),
        hepa_b_date_given: formatDate(hepaBDateRaw)
    } : null;

    // Task 4: Fix At-Birth Immunization Array Check
    const checkVaxStatus = (data, type) => {
        if (!data) return false;
        
        // Check for at_birth_doses array if it exists
        if (Array.isArray(data.at_birth_doses)) {
            if (type === 'BCG') return data.at_birth_doses.includes('BCG');
            if (type === 'HepB') return data.at_birth_doses.some(d => d.includes('HepB') || d.includes('Hepatitis B'));
        }

        // Fallback to individual status keys
        if (type === 'BCG') {
            return data.bcg_status === 'GIVEN' || data.bcg_status?.includes('Given');
        }
        if (type === 'HepB') {
            return data.hepatitis_b_status?.includes('GIVEN') || data.hepatitis_b_status?.includes('Given');
        }

        return false;
    };

    // Task 2: Fix Breastfeeding Logic
    const isBreastfed = (val) => {
        if (val === true || val === 'true') return true;
        const stringVal = String(val).toLowerCase();
        return ['yes', 'initiated immediately'].includes(stringVal);
    };

    const handleApprove = async () => {
        if (!selectedId) return;
        setProcessing(true);
        try {
            const res = await apiClient.post(`/validation/${selectedId}/approve`, { notes: 'Approved by clinical reviewer' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                const approvedRecord = selectedRecord;
                const targetId = data.infantId || data.referenceId || '';
                setFeedback({ type: '', message: '' });
                
                // Immediately remove from local queue
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setSelectedDetail(null);
                setSelectedId(null);
                setShowApprovalModal(false);
                setApprovalSuccess({
                    infantId: targetId,
                    name: formatFullNameFromObject(approvedRecord) || 'Infant record',
                    referenceId: data.referenceId || approvedRecord?.reference_id || ''
                });
                fetchQueue();
            } else {
                if (res.status === 409 && data?.error_code === 'DUPLICATE_REVIEW_REQUIRED' && data?.duplicate_alert) {
                    setSelectedDetail((prev) => prev ? ({
                        ...prev,
                        registration: {
                            ...(prev.registration || {}),
                            duplicate_alert: data.duplicate_alert
                        }
                    }) : prev);
                }
                setFeedback({ type: 'error', message: data.error || 'Approval failed' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Approval request failed. Please retry.' });
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedId) return;
        const validationMessage = validateRejectionReason();
        if (validationMessage) {
            setRejectionError(validationMessage);
            return;
        }
        setProcessing(true);
        try {
            const res = await apiClient.post(`/validation/${selectedId}/reject`, {
                rejection_reason: rejectionReason.trim(),
                rejection_notes: rejectionNotes.trim()
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setFeedback({ type: 'success', message: 'Record permanently rejected.' });
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setShowRejectionModal(false);
                setRejectionError('');
                setRejectionReason('');
                setRejectionNotes('');
                setSelectedDetail((prev) => prev ? ({
                    ...prev,
                    registration: {
                        ...(prev.registration || {}),
                        status: 'REJECTED',
                        registration_status: 'REJECTED',
                        rejection_reason: rejectionReason.trim(),
                        rejection_notes: rejectionNotes.trim()
                    }
                }) : prev);
                await fetchQueue();
            } else {
                const apiError = data.error || 'Rejection failed';
                if (res.status === 400) {
                    setRejectionError(apiError);
                } else {
                    setFeedback({ type: 'error', message: apiError });
                }
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Rejection request failed. Please retry.' });
        } finally {
            setProcessing(false);
        }
    };

    const validateRejectionReason = () => {
        const reasonValue = String(rejectionReason || '').trim();
        if (!reasonValue) {
            return 'A valid rejection rationale is required to proceed.';
        }
        return '';
    };

    const handleNeedsRevision = async () => {
        if (!selectedId || !correctionNote) return;
        setProcessing(true);
        try {
            const res = await apiClient.post(`/validation/${selectedId}/return`, { correction_notes: correctionNote });
            const data = await res.json();
            if (res.ok && data.success) {
                setFeedback({ type: 'success', message: 'Record returned for correction.' });
                // Immediately remove from local queue
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setSelectedDetail(null);
                setSelectedId(null);
                setShowRevisionModal(false);
                setCorrectionNote('');
                fetchQueue(); // Background refresh
            } else {
                setFeedback({ type: 'error', message: data.error || 'Action failed' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Request failed. Please retry.' });
        } finally {
            setProcessing(false);
        }
    };

    const handleIgnoreDuplicateAlert = async () => {
        if (!selectedId || !selectedRecord) return;
        setResolvingDuplicateAlert(true);
        try {
            const currentAlert = selectedRecord?.duplicate_alert || selectedDetail?.registration?.duplicate_alert || null;
            const res = await apiClient.patch(`/validation/${selectedId}`, {
                data: {
                    ...selectedRecord,
                    duplicate_alert: null,
                    duplicate_resolution: {
                        disposition: 'CONFIRMED_UNIQUE',
                        resolved: true,
                        resolved_by: user?.id || null,
                        resolved_at: new Date().toISOString(),
                        signature: currentAlert?.signature || null,
                        status: currentAlert?.status || null
                    }
                }
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                setSelectedDetail((prev) => prev ? ({
                    ...prev,
                    registration: {
                        ...(prev.registration || {}),
                        duplicate_alert: null
                    }
                }) : prev);
                setFeedback({ type: 'success', message: 'Duplicate alert acknowledged.' });
            } else {
                setFeedback({ type: 'error', message: data.error || 'Failed to update duplicate alert.' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Failed to update duplicate alert.' });
        } finally {
            setResolvingDuplicateAlert(false);
        }
    };

    const handleMergeTransfer = async () => {
        if (!selectedId) return;
        setResolvingDuplicateAlert(true);
        try {
            const res = await apiClient.post(`/validation/${selectedId}/merge-transfer`, {
                notes: 'Merged as transfer during clinical validation.'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setSelectedDetail(null);
                setSelectedId(null);
                setApprovalSuccess({
                    infantId: data.infantId || '',
                    name: formatFullNameFromObject(selectedRecord) || 'Infant record',
                    referenceId: data.referenceId || selectedRecord?.reference_id || ''
                });
                fetchQueue();
            } else {
                setFeedback({ type: 'error', message: data.error || 'Transfer merge failed.' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Transfer merge failed.' });
        } finally {
            setResolvingDuplicateAlert(false);
        }
    };

    const physicalAddressLabel = [
        selectedRecord?.locality || selectedRecord?.barangay,
        selectedRecord?.exact_address
    ].filter(Boolean).join(' - ') || '--';

    const fhsisAssignment = user?.assigned_barangay || '--';
    const rejectionReasonValue = selectedRecord?.rejection_reason || selectedDetail?.registration?.rejection_reason || '';
    const rejectionNotesValue = selectedRecord?.rejection_notes || selectedDetail?.registration?.rejection_notes || '';
    const normalizedRecordStatus = normalizeWorkflowValue(selectedRecord?.status);
    const isRejectedRecord = normalizedRecordStatus === 'REJECTED';
    const currentUserRole = normalizeWorkflowValue(user?.role);
    const isMidwifeReviewer = currentUserRole === 'MIDWIFE';
    const hasReadOnlyValidationAccess = ['ADMIN', 'SUPER_ADMIN'].includes(currentUserRole);
    const shouldShowSuperAdminBarangay = currentUserRole === 'SUPER_ADMIN';
    const canReviewRecord = normalizedRecordStatus === 'PENDING_VALIDATION'
        && isMidwifeReviewer;
    const hasSelectedRecord = Boolean(selectedId && selectedRecord);
    const duplicateAlert = selectedRecord?.duplicate_alert || selectedDetail?.registration?.duplicate_alert || null;
    const duplicateAlertStatus = normalizeWorkflowValue(duplicateAlert?.status);
    const transferInquiryNotes = selectedDetail?.registration?.transfer_inquiry_notes
        || selectedDetail?.duplicate_review_context?.transfer_inquiry_notes
        || '';
    const duplicateAlertMessage = duplicateAlert?.message
        || (duplicateAlertStatus === 'TRANSFER_POSSIBLE'
            ? `ALERT: A record for this infant exists in ${duplicateAlert?.barangay}. Please verify if this is a transfer or a duplicate.`
            : duplicateAlertStatus === 'PROBABLE_DUPLICATE'
                ? 'ALERT: Similar infant records already exist in this barangay. Review carefully before approval.'
                : 'ALERT: An existing record matches this infant identity in this barangay. Resolve the duplicate review before approval.');
    const approvalBlockedByDuplicate = Boolean(
        canReviewRecord
        && duplicateAlertStatus
        && ['STRICT_DUPLICATE', 'PROBABLE_DUPLICATE', 'TRANSFER_POSSIBLE'].includes(duplicateAlertStatus)
    );

    return (
        <div className="min-h-screen bg-[#F4F7F9] flex flex-col font-sans antialiased text-slate-900">
            {/* San Pedro Branding Header */}
            <header className="sticky top-0 z-30 border-b border-emerald-900 bg-[#006B3F] px-4 py-3">
                <div className="mx-auto flex w-full max-w-full items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-emerald-500 rounded-sm flex items-center justify-center">
                            <Shield className="text-white" size={18} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-white uppercase leading-none">
                                Clinical Record Validation
                            </h1>
                            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">San Pedro City Health Office</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 h-8">
                        <div className="flex items-center gap-4 border-l border-emerald-800/60 pl-6">
                            <div className="flex flex-col items-end">
                                <span className="text-[8px] font-bold text-emerald-300 uppercase tracking-widest">Pending Submissions</span>
                                <span className="text-sm font-bold text-white leading-none">{pendingRegistrations?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-full flex-1 gap-2 overflow-hidden px-2 py-2">
                {/* Left: Validation Queue */}
                <div className="w-80 flex flex-shrink-0 flex-col gap-2">
                    <div className="bg-white border border-slate-300 flex flex-col flex-1 overflow-hidden">
                        <div className="p-2.5 border-b border-slate-200 bg-slate-50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                <input 
                                    type="text" 
                                    placeholder="SEARCH QUEUE..."
                                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-none text-[9px] font-bold tracking-widest outline-none uppercase"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="p-10 flex flex-col items-center justify-center gap-2">
                                    <div className="w-6 h-6 border-2 border-slate-200 border-t-[#006B3F] rounded-full animate-spin"></div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Loading...</p>
                                </div>
                            ) : (!pendingRegistrations || pendingRegistrations.length === 0) ? (
                                <div className="p-10 text-center">
                                    <Shield className="text-slate-100 mx-auto mb-2" size={24} />
                                    <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Queue Empty</h3>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {Array.isArray(pendingRegistrations) && pendingRegistrations.map(infant => (
                                        <button 
                                            key={infant?.id}
                                            onClick={() => setSelectedId(infant?.id)}
                                            className={`w-full p-4 text-left transition-all border-l-2 ${selectedId === infant?.id ? 'bg-emerald-50/40 border-l-[#006B3F]' : 'bg-white border-l-transparent hover:bg-slate-50'}`}
                                        >
                                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">{infant?.reference_id}</div>
                                            <h4 className="text-xs font-bold text-slate-800 uppercase truncate mb-1">
                                                {formatFullNameFromObject(infant)}
                                            </h4>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[8px] font-bold text-emerald-800 bg-emerald-100/50 px-1 py-0.5 uppercase">
                                                    {infant?.barangay} / {infant?.purok}
                                                </span>
                                                {shouldShowSuperAdminBarangay && (
                                                    <span className="text-[8px] font-bold text-slate-700 bg-slate-100 px-1 py-0.5 uppercase tracking-wider">
                                                        Barangay: {infant?.barangay || '--'}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Detailed Review Panel */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {!hasSelectedRecord ? (
                        <div className="h-full bg-white border border-slate-300 flex flex-col items-center justify-center text-center p-12">
                            <Shield className="text-slate-100 mb-4" size={64} />
                            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
                                {selectedId && detailLoading ? 'Loading Record' : 'No Record Selected'}
                            </h3>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-300 flex flex-col flex-1 overflow-hidden">
                            {/* Record Header */}
                            <div className="flex items-center justify-between bg-slate-900 px-4 py-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-white/5 border border-white/10 flex items-center justify-center">
                                        <Baby className="text-emerald-400" size={20} />
                                    </div>
                                        <div>
                                            <div className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest mb-0.5">Clinical Review Case</div>
                                            <h2 className="text-lg font-bold text-white uppercase tracking-tight leading-none">
                                            {formatFullNameFromObject(selectedRecord)}
                                            </h2>
                                        </div>
                                    </div>
                                <div className="text-right">
                                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest block">Reference ID</span>
                                    <span className="text-sm font-mono font-bold text-white tracking-widest">{selectedRecord?.reference_id || '--'}</span>
                                </div>
                            </div>

                            {/* Accountability Sub-Header */}
                            <div className="flex items-center justify-between border-b border-slate-300 bg-slate-50 px-4 py-2.5">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <User size={10} className="text-[#006B3F]" />
                                        <span className="text-[9px] font-bold text-slate-600 uppercase">
                                            ENCODED BY: <span className="text-slate-900 font-black">{selectedRecord?.submitted_by_name || 'BHW PERSONNEL'}</span>
                                        </span>
                                    </div>
                                    <div className="w-px h-3 bg-slate-300"></div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={10} className="text-[#006B3F]" />
                                        <span className="text-[9px] font-bold text-slate-600 uppercase">
                                            SUBMITTED: <span className="text-slate-900 font-black">{selectedRecord?.created_at ? new Date(selectedRecord.created_at).toLocaleString() : '--'}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {detailLoading && (
                                <div className="border-b border-slate-300 bg-emerald-50 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#006B3F]">
                                    Loading full validation chart...
                                </div>
                            )}

                            {duplicateAlertStatus && (
                                <div className="border-b border-amber-300 bg-amber-50 px-4 py-3">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-800">Clinical Duplicate Alert</div>
                                            <div className="mt-1 text-sm font-bold text-slate-900">
                                                {duplicateAlertMessage}
                                            </div>
                                            {Array.isArray(duplicateAlert?.matches) && duplicateAlert.matches.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {duplicateAlert.matches.map((match, index) => (
                                                        <div key={`${match.source_table || 'MATCH'}-${match.id || index}`} className="rounded border border-amber-200 bg-white px-3 py-2">
                                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-900">
                                                                {formatFullNameFromObject(match)}
                                                            </div>
                                                            <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                                                DOB: {match.dob ? new Date(match.dob).toLocaleDateString() : '--'} | Barangay: {match.barangay || '--'} | {String(match.status || 'MATCH').replace(/_/g, ' ')}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {duplicateAlertStatus === 'TRANSFER_POSSIBLE' && (
                                                <div className="mt-3 rounded border border-emerald-200 bg-white px-3 py-3">
                                                    <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#006B3F]">
                                                        Transfer Inquiry Notes
                                                    </div>
                                                    <div className="mt-2 text-[11px] font-bold leading-relaxed text-slate-900">
                                                        {transferInquiryNotes || 'No transfer inquiry notes were attached by the BHW.'}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {isMidwifeReviewer && duplicateAlertStatus === 'TRANSFER_POSSIBLE' && (
                                                <button
                                                    onClick={handleMergeTransfer}
                                                    disabled={resolvingDuplicateAlert || processing}
                                                    className="px-4 py-2 bg-[#006B3F] text-white text-[9px] font-black uppercase tracking-widest hover:bg-[#005231] disabled:opacity-50"
                                                >
                                                    Merge/Transfer Record
                                                </button>
                                            )}
                                            {isMidwifeReviewer ? (
                                                <button
                                                    onClick={handleIgnoreDuplicateAlert}
                                                    disabled={resolvingDuplicateAlert || processing}
                                                    className="px-4 py-2 border border-amber-700 text-amber-800 text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 disabled:opacity-50"
                                                >
                                                    Ignore/Confirm Unique
                                                </button>
                                            ) : (
                                                <div className="rounded border border-amber-300 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-800">
                                                    Read Only Access: Validation restricted to assigned Midwife.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Clinical Chart Grid */}
                            <div className="validation-chart-grid flex-1 overflow-y-auto p-0">
                                {isRejectedRecord && (
                                    <section className="clinical-rejection-summary border border-[#064E3B] border-l-4 border-l-[#064E3B] bg-[#F6FFFB]">
                                        <div className="border-b border-[#064E3B] bg-[#ECFDF5] px-3 py-2">
                                            <h3 className="text-[9px] font-black uppercase tracking-widest text-[#064E3B]">Clinical Rejection Summary</h3>
                                        </div>
                                        <div className="chart-grid chart-grid-single">
                                            <DataField label="Rejection Reason" value={rejectionReasonValue || '--'} highlight />
                                        </div>
                                        <div className="chart-grid chart-grid-single border-t border-[#064E3B]">
                                            <DataField label="Reviewer Notes" value={rejectionNotesValue || '--'} />
                                        </div>
                                    </section>
                                )}

                                <div className="grid grid-cols-1 gap-0 xl:grid-cols-2">
                                {/* Column 1: Identity & Locality */}
                                <div className="space-y-0">
                                    <ClinicalSection icon={<Baby size={12} className="text-[#006B3F]" />} title="Infant Demographics">
                                        <div className="chart-grid chart-grid-single">
                                            <DataField label="Legal Full Name" value={formatFullNameFromObject(selectedRecord)} />
                                        </div>
                                        <div className="chart-grid chart-grid-double border-t border-slate-300">
                                            <DataField label="Date of Birth" value={selectedRecord?.dob ? new Date(selectedRecord.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '--'} />
                                            <DataField label="Biological Sex" value={selectedRecord?.sex} />
                                        </div>
                                        <div className="chart-grid chart-grid-double border-t border-slate-300">
                                            <DataField label="Birth Weight" value={selectedRecord?.birth_weight ? `${selectedRecord.birth_weight} kg` : '--'} />
                                            <DataField label="Birth Length" value={selectedRecord?.length_at_birth_cm ? `${selectedRecord.length_at_birth_cm} cm` : '--'} />
                                        </div>
                                        <div className="chart-grid chart-grid-single border-t border-slate-300">
                                            <DataField label="Place of Birth" value={selectedRecord?.delivery_facility_name ? `${selectedRecord.birth_setting || 'FACILITY'} - ${selectedRecord.delivery_facility_name}` : (selectedRecord?.birth_setting || '--')} />
                                        </div>
                                    </ClinicalSection>

                                    <ClinicalSection icon={<MapPin size={12} className="text-[#006B3F]" />} title="Address and Locality">
                                        <div className="chart-grid chart-grid-double">
                                            <DataField label="Barangay" value={selectedRecord?.barangay} />
                                            <DataField label="Purok / Sitio" value={selectedRecord?.purok || selectedRecord?.sitio || '--'} />
                                        </div>
                                        <div className="chart-grid chart-grid-single border-t border-slate-300">
                                            <DataField label="Exact Address" value={selectedRecord?.exact_address || '--'} />
                                        </div>
                                        <div className="chart-grid chart-grid-single border-t border-slate-300">
                                            <DataField label="Landmark" value={selectedRecord?.landmark || '--'} />
                                        </div>
                                    </ClinicalSection>
                                </div>

                                {/* Column 2: Parent & Clinical */}
                                <div className="space-y-0">
                                    <ClinicalSection icon={<User size={12} className="text-[#006B3F]" />} title="Caregiver Profile">
                                        <div className="chart-grid chart-grid-single">
                                            <DataField label="Mother's Maiden Name" value={selectedRecord?.mothers_maiden_name || selectedRecord?.mother_name || '--'} />
                                        </div>
                                        <div className="chart-grid chart-grid-single border-t border-slate-300">
                                            <DataField label="Father's Full Name" value={selectedRecord?.father_name || selectedRecord?.fathers_name || 'None Provided'} />
                                        </div>
                                        <div className="chart-grid chart-grid-double border-t border-slate-300">
                                            <DataField label="Primary Phone" value={selectedRecord?.caregiver_phone || '--'} />
                                            <DataField label="Relationship" value={selectedRecord?.caregiver_relationship || 'Mother'} />
                                        </div>
                                    </ClinicalSection>

                                    <ClinicalSection icon={<Activity size={12} className="text-[#006B3F]" />} title="Maternal and Birth History">
                                        <div className="chart-grid chart-grid-double">
                                            <DataField label="Mother TT Status" value={selectedRecord?.mother_tt_status || 'Unknown'} highlight />
                                            <DataField label="Last TT Date" value={selectedRecord?.last_tt_date ? new Date(selectedRecord.last_tt_date).toLocaleDateString() : '--'} />
                                        </div>
                                        <div className="chart-grid chart-grid-double border-t border-slate-300">
                                            <DataField label="CPAB Status" value={selectedRecord?.cpab_status || 'Pending'} />
                                            <DataField label="Initiated Breastfeeding" value={isBreastfed(selectedRecord?.initiated_breastfeeding || selectedRecord?.breastfed_immediately_after_birth) ? 'YES' : 'NO'} highlight />
                                        </div>
                                    </ClinicalSection>

                                    <ClinicalSection icon={<Info size={12} className="text-[#006B3F]" />} title="BHW Intake Notes">
                                        <div className="chart-grid chart-grid-single">
                                            <DataField
                                                label="Historical Context"
                                                value={selectedRecord?.bhw_intake_notes || 'No intake notes recorded by the encoder.'}
                                            />
                                        </div>
                                    </ClinicalSection>

                                    <ClinicalSection icon={<Shield size={12} className="text-[#006B3F]" />} title="At-Birth Immunization Entries">
                                        <div className="chart-grid chart-grid-double">
                                            <div className={`min-h-[62px] border-0 p-3 ${getStatusBgClass(record.bcg_status)}`}>
                                                <div className="mb-1 text-[8px] font-black uppercase tracking-widest text-slate-500">BCG Vaccine</div>
                                                <div className={`text-[10px] font-black uppercase ${getStatusColor(record.bcg_status)}`}>
                                                    {record.bcg_status || 'Pending'}
                                                </div>
                                                <div className="mt-1 text-[8px] font-bold uppercase text-slate-600">
                                                    DATE: {['Not Given', 'Unknown', 'Pending'].includes(record.bcg_status) ? 'N/A' : record.bcg_date_given}
                                                </div>
                                            </div>

                                            <div className={`min-h-[62px] border-0 p-3 ${getStatusBgClass(record.hepa_b_status)}`}>
                                                <div className="mb-1 text-[8px] font-black uppercase tracking-widest text-slate-500">Hepatitis B</div>
                                                <div className={`text-[10px] font-black uppercase ${getStatusColor(record.hepa_b_status)}`}>
                                                    {record.hepa_b_status || 'Pending'}
                                                </div>
                                                <div className="mt-1 text-[8px] font-bold uppercase text-slate-600">
                                                    DATE: {['Not Given', 'Unknown', 'Pending'].includes(record.hepa_b_status) ? 'N/A' : record.hepa_b_date_given}
                                                </div>
                                            </div>
                                        </div>
                                    </ClinicalSection>

                                    <ClinicalSection icon={<Info size={12} className="text-[#006B3F]" />} title="Correction History">
                                        <div className="border-t border-slate-300 bg-white">
                                            {(selectedDetail?.correction_history || []).length === 0 ? (
                                                <div className="bg-white px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                    No prior correction requests recorded.
                                                </div>
                                            ) : (
                                                selectedDetail.correction_history.map((item, index) => (
                                                    <div key={`${item.timestamp || item.created_at || index}-${index}`} className="grid grid-cols-[22px_1fr] gap-3 border-b border-slate-200 px-3 py-3 last:border-b-0">
                                                        <div className="flex flex-col items-center">
                                                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[#006B3F]"></div>
                                                            {index !== (selectedDetail.correction_history.length - 1) && (
                                                                <div className="mt-1 w-px flex-1 bg-slate-300"></div>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                                                                        {formatValidationEventLabel(item.action || item.event_type || item.status)}
                                                                    </div>
                                                                    {item.reason && (
                                                                        <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-600">
                                                                            Reason: <span className="text-slate-900">{item.reason}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="mt-1 text-[10px] font-bold text-slate-800">
                                                                        {item.notes || item.correction_notes || item.rejection_notes || item.message || 'No reason specified.'}
                                                                    </div>
                                                                </div>
                                                                <div className="shrink-0 text-right">
                                                                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                                                                        {item.reviewer_name || 'Clinic Staff'}
                                                                    </div>
                                                                    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                                                                        {item.reviewer_role || item.role || '--'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="mt-2 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                                                {item.timestamp || item.created_at ? new Date(item.timestamp || item.created_at).toLocaleString() : '--'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </ClinicalSection>
                                </div>
                            </div>
                            </div>

                            {/* Action Footer */}
                            <div className="p-4 bg-white border-t border-slate-300 flex items-center justify-between">
                                {canReviewRecord ? (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setShowRevisionModal(true)}
                                                disabled={processing}
                                                className="px-4 py-2 border border-amber-600 text-amber-700 text-[9px] font-black uppercase tracking-widest hover:bg-amber-50"
                                            >
                                                <AlertCircle size={12} className="inline mr-1.5" /> Return for Correction
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setRejectionError('');
                                                    setShowRejectionModal(true);
                                                }}
                                                disabled={processing}
                                                className="px-4 py-2 border border-rose-600 text-rose-700 text-[9px] font-black uppercase tracking-widest hover:bg-rose-50"
                                            >
                                                <XCircle size={12} className="inline mr-1.5" /> Reject Record
                                            </button>
                                        </div>

                                        <button 
                                            onClick={() => setShowApprovalModal(true)}
                                            disabled={processing || approvalBlockedByDuplicate}
                                            className="px-10 py-2.5 bg-[#006B3F] text-white text-[9px] font-black uppercase tracking-[0.3em] hover:bg-[#005231] transition-all disabled:opacity-50"
                                        >
                                            {approvalBlockedByDuplicate ? 'Resolve Duplicate Alert First' : processing ? 'Processing...' : 'Approve & Promote'}
                                        </button>
                                    </>
                                ) : (
                                    <div className="w-full rounded border border-slate-300 bg-slate-50 px-4 py-3 text-center text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">
                                        {hasReadOnlyValidationAccess
                                            ? 'Read Only Access: Validation restricted to assigned Midwife.'
                                            : 'No review actions available for this record'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Modals */}
            {showRejectionModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowRejectionModal(false)}></div>
                    <div className="bg-white border border-rose-200 w-full max-w-sm relative z-10 shadow-2xl">
                        <div className="bg-rose-700 p-3 flex items-center gap-2">
                            <XCircle className="text-white" size={16} />
                            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Reject File</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-700">
                                    Rejection Reason
                                </label>
                                <select
                                    value={rejectionReason}
                                    onChange={(e) => {
                                        setRejectionReason(e.target.value);
                                        if (rejectionError) setRejectionError('');
                                    }}
                                    className="w-full border border-slate-200 bg-white p-2 text-[10px] font-semibold outline-none"
                                >
                                    <option value="">Select rejection reason</option>
                                    {REJECTION_REASONS.map((reason) => (
                                        <option key={reason} value={reason}>{reason}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-2 block text-[9px] font-black uppercase tracking-widest text-slate-700">
                                    Rejection Notes
                                </label>
                                <textarea
                                    value={rejectionNotes}
                                    onChange={(e) => {
                                        setRejectionNotes(e.target.value);
                                        if (rejectionError) setRejectionError('');
                                    }}
                                    className="w-full border border-slate-200 p-2 text-[10px] outline-none h-24"
                                    placeholder="Optional context for the rejection decision..."
                                ></textarea>
                            </div>
                            {rejectionError && (
                                <span className="block text-[10px] font-black text-rose-700">
                                    {rejectionError}
                                </span>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setShowRejectionModal(false);
                                        setRejectionError('');
                                    }}
                                    className="flex-1 py-2 text-[9px] font-bold uppercase text-slate-400"
                                >
                                    Cancel
                                </button>
                                <button onClick={handleReject} disabled={processing} className="flex-1 py-2 bg-rose-700 text-white text-[9px] font-bold uppercase">Confirm</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showRevisionModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowRevisionModal(false)}></div>
                    <div className="bg-white border border-amber-200 w-full max-w-sm relative z-10 shadow-2xl">
                        <div className="bg-amber-600 p-3 flex items-center gap-2">
                            <AlertCircle className="text-white" size={16} />
                            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Return for Correction</h3>
                        </div>
                        <div className="p-4">
                            <textarea 
                                value={correctionNote}
                                onChange={(e) => setCorrectionNote(e.target.value)}
                                className="w-full border border-slate-200 p-2 text-[10px] outline-none h-24"
                                placeholder="Specify the correction needed before resubmission..."
                            ></textarea>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setShowRevisionModal(false)} className="flex-1 py-2 text-[9px] font-bold uppercase text-slate-400">Cancel</button>
                                <button onClick={handleNeedsRevision} disabled={!correctionNote || processing} className="flex-1 py-2 bg-amber-600 text-white text-[9px] font-bold uppercase">Return</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showApprovalModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-900/60" onClick={() => setShowApprovalModal(false)}></div>
                    <div className="bg-white border border-emerald-200 w-full max-w-lg relative z-10 shadow-2xl">
                        <div className="bg-[#006B3F] p-3 flex items-center gap-2">
                            <CheckCircle className="text-white" size={16} />
                            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Approve and Promote</h3>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="border border-slate-200 bg-slate-50 p-4 space-y-3">
                                <div>
                                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Physical Address</div>
                                    <div className="mt-1 text-sm font-bold text-slate-900">{physicalAddressLabel}</div>
                                </div>
                                <div className="border-t border-slate-200 pt-3">
                                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">FHSIS Assignment</div>
                                    <div className="mt-1 text-sm font-bold text-slate-900">{fhsisAssignment}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowApprovalModal(false)} className="flex-1 py-2 text-[9px] font-bold uppercase text-slate-400">Cancel</button>
                                <button onClick={handleApprove} disabled={processing} className="flex-1 py-2 bg-[#006B3F] text-white text-[9px] font-bold uppercase">
                                    {processing ? 'Processing...' : 'Confirm Approval'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {approvalSuccess && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-900/60"></div>
                    <div className="bg-white border border-slate-200 w-full max-w-md relative z-10 shadow-sm rounded-md">
                        <div className="p-6 text-center border-b border-slate-200">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50">
                                <CheckCircle className="h-8 w-8 text-emerald-800" />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Record Validated</h3>
                            <p className="mt-2 text-sm font-semibold text-slate-500">
                                {approvalSuccess.name} has been approved and promoted to the clinical registry.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 p-5 sm:flex-row">
                            <button
                                onClick={() => {
                                    setApprovalSuccess(null);
                                    fetchQueue();
                                }}
                                className="flex-1 rounded-md bg-emerald-800 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-900"
                            >
                                Continue Validating
                            </button>
                            <button
                                onClick={() => navigate(`/clinical/infants/${approvalSuccess.infantId}`)}
                                disabled={!approvalSuccess.infantId}
                                className="flex-1 rounded-md border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                            >
                                View Infant Profile
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {feedback.message && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 border flex items-center gap-2 animate-in slide-in-from-bottom-2 ${feedback.type === 'success' ? 'bg-[#006B3F] border-emerald-900 text-white' : 'bg-rose-700 border-rose-900 text-white'}`}>
                    <span className="text-[9px] font-bold uppercase tracking-widest">{feedback.message}</span>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #006B3F; }
                .validation-chart-grid { width: 100%; max-width: 100%; }
                .chart-grid {
                    display: grid;
                    gap: 1px;
                    width: 100%;
                    max-width: 100%;
                    background: #cbd5e1;
                    padding: 1px;
                }
                .chart-grid-single { grid-template-columns: minmax(0, 1fr); }
                .chart-grid-double { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                .clinical-rejection-summary {
                    margin: 0;
                    box-shadow: inset 0 0 0 1px #064E3B;
                }
            `}} />
        </div>
    );
};

const ClinicalSection = ({ icon, title, children }) => (
    <section className="border border-slate-300 bg-white max-w-full">
        <div className="flex items-center gap-2 border-b border-slate-300 bg-slate-100 px-3 py-2">
            {icon}
            <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-800">{title}</h3>
        </div>
        {children}
    </section>
);

const DataField = ({ label, value, highlight = false, icon = null }) => (
    <div className="min-h-[48px] max-w-full bg-white px-3 py-2">
        <label className="mb-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-slate-500">
            {icon} {label}
        </label>
        <div className={`break-words text-[11px] font-black uppercase leading-snug ${highlight ? 'text-emerald-800' : 'text-slate-900'}`}>
            {value || '--'}
        </div>
    </div>
);

const VaxCard = ({ label, isGiven, date }) => (
    <div className={`p-3 border ${isGiven ? 'bg-emerald-50/30 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
        <div className={`text-[9px] font-black uppercase ${isGiven ? 'text-emerald-800' : 'text-slate-400'}`}>
            {isGiven ? 'ADMINISTERED' : 'NOT ADMINISTERED'}
        </div>
        {isGiven && date && (
            <div className="text-[7px] font-bold text-slate-500 mt-1 uppercase">DATE: {new Date(date).toLocaleDateString()}</div>
        )}
    </div>
);

export default ValidationPage;
