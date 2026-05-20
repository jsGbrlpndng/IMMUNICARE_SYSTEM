import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

const ValidationPage = () => {
    const navigate = useNavigate();
    const [pendingRegistrations, setPendingRegistrations] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    const [stats, setStats] = useState({ processed_today: 0 });
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectionModal, setShowRejectionModal] = useState(false);
    const [revisionNotes, setRevisionNotes] = useState('');
    const [showRevisionModal, setShowRevisionModal] = useState(false);

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

    const selectedRecord = pendingRegistrations?.find(q => q.id === selectedId);

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
            const data = await res.json();
            if (res.ok && data.success) {
                setFeedback({ type: 'success', message: 'Record approved and promoted to registry.' });
                
                // Immediately remove from local queue
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setSelectedId(null);
                
                // Task 4: Redirect to the newly promoted infant record
                // Task 1: Ensure referenceId is sanitized (hyphenated)
                const targetId = (data.referenceId || data.infantId || '').toString().replace(/\s+/g, '-');
                if (targetId) {
                    setTimeout(() => {
                        navigate(`/clinical/infants/${targetId}`);
                    }, 1500);
                } else {
                    fetchQueue(); // Background refresh if no ID returned
                }
            } else {
                setFeedback({ type: 'error', message: data.error || 'Approval failed' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Approval request failed. Please retry.' });
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async () => {
        if (!selectedId || !rejectionReason) return;
        setProcessing(true);
        try {
            const res = await apiClient.post(`/validation/${selectedId}/reject`, { reason: rejectionReason });
            const data = await res.json();
            if (res.ok && data.success) {
                setFeedback({ type: 'success', message: 'Record permanently rejected.' });
                // Immediately remove from local queue
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setSelectedId(null);
                setShowRejectionModal(false);
                setRejectionReason('');
                fetchQueue(); // Background refresh
            } else {
                setFeedback({ type: 'error', message: data.error || 'Rejection failed' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Rejection request failed. Please retry.' });
        } finally {
            setProcessing(false);
        }
    };

    const handleNeedsRevision = async () => {
        if (!selectedId || !revisionNotes) return;
        setProcessing(true);
        try {
            const res = await apiClient.post(`/validation/${selectedId}/needs-revision`, { notes: revisionNotes });
            const data = await res.json();
            if (res.ok && data.success) {
                setFeedback({ type: 'success', message: 'Record returned for correction.' });
                // Immediately remove from local queue
                setPendingRegistrations(prev => prev.filter(item => item.id !== selectedId));
                setSelectedId(null);
                setShowRevisionModal(false);
                setRevisionNotes('');
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

    return (
        <div className="min-h-screen bg-[#F4F7F9] flex flex-col font-sans antialiased text-slate-900">
            {/* San Pedro Branding Header */}
            <header className="bg-[#006B3F] border-b border-emerald-900 px-8 py-3 sticky top-0 z-30">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
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

            <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 flex gap-4 overflow-hidden">
                {/* Left: Validation Queue */}
                <div className="w-80 flex flex-col gap-3 flex-shrink-0">
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
                                                {infant?.first_name} {infant?.last_name}
                                            </h4>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[8px] font-bold text-emerald-800 bg-emerald-100/50 px-1 py-0.5 uppercase">
                                                    {infant?.barangay} / {infant?.purok}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Detailed Review Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {!selectedId ? (
                        <div className="h-full bg-white border border-slate-300 flex flex-col items-center justify-center text-center p-12">
                            <Shield className="text-slate-100 mb-4" size={64} />
                            <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">No Record Selected</h3>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-300 flex flex-col flex-1 overflow-hidden">
                            {/* Record Header */}
                            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-white/5 border border-white/10 flex items-center justify-center">
                                        <Baby className="text-emerald-400" size={20} />
                                    </div>
                                    <div>
                                        <div className="text-[8px] font-bold text-emerald-400/60 uppercase tracking-widest mb-0.5">Clinical Review Case</div>
                                        <h2 className="text-lg font-bold text-white uppercase tracking-tight leading-none">
                                            {selectedRecord?.first_name} {selectedRecord?.last_name}
                                        </h2>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest block">Reference ID</span>
                                    <span className="text-sm font-mono font-bold text-white tracking-widest">{selectedRecord.reference_id}</span>
                                </div>
                            </div>

                            {/* Accountability Sub-Header */}
                            <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <User size={10} className="text-[#006B3F]" />
                                        <span className="text-[9px] font-bold text-slate-600 uppercase">
                                            ENCODED BY: <span className="text-slate-900 font-black">{selectedRecord.submitted_by_name || 'BHW PERSONNEL'}</span>
                                        </span>
                                    </div>
                                    <div className="w-px h-3 bg-slate-300"></div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={10} className="text-[#006B3F]" />
                                        <span className="text-[9px] font-bold text-slate-600 uppercase">
                                            SUBMITTED: <span className="text-slate-900 font-black">{new Date(selectedRecord.created_at).toLocaleString()}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Data Grid */}
                            <div className="flex-1 p-6 grid grid-cols-2 gap-10 overflow-y-auto">
                                {/* Column 1: Identity & Locality */}
                                <div className="space-y-8">
                                    <div>
                                        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-4">
                                            <Baby size={12} className="text-[#006B3F]" />
                                            <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-widest">Infant Identity</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-5">
                                            <DataField label="Legal Full Name" value={`${selectedRecord?.first_name} ${selectedRecord?.middle_name || ''} ${selectedRecord?.last_name} ${selectedRecord?.suffix || ''}`} />
                                            <div className="grid grid-cols-2 gap-5">
                                                <DataField label="Date of Birth" value={selectedRecord?.dob ? new Date(selectedRecord.dob).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '--'} />
                                                <DataField label="Biological Sex" value={selectedRecord?.sex} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-5">
                                                <DataField label="Birth Weight" value={selectedRecord?.birth_weight ? `${selectedRecord.birth_weight} kg` : '--'} />
                                                <DataField label="Birth Length" value={selectedRecord?.length_at_birth_cm ? `${selectedRecord.length_at_birth_cm} cm` : '--'} />
                                            </div>
                                            {/* Place of Birth */}
                                            <DataField label="Place of Birth" value={selectedRecord?.delivery_facility_name ? `${selectedRecord.birth_setting || 'FACILITY'} - ${selectedRecord.delivery_facility_name}` : (selectedRecord?.birth_setting || '--')} />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-4">
                                            <MapPin size={12} className="text-[#006B3F]" />
                                            <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-widest">Locality Data</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-5">
                                            <DataField label="Barangay" value={selectedRecord.barangay} />
                                            <DataField label="Exact Address" value={selectedRecord?.exact_address || '--'} />
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Parent & Clinical */}
                                <div className="space-y-8">
                                    <div>
                                        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-4">
                                            <User size={12} className="text-[#006B3F]" />
                                            <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-widest">Parental Data</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-5">
                                            <DataField label="Mother's Maiden Name" value={selectedRecord?.mothers_maiden_name || selectedRecord?.mother_name || '--'} />
                                            <DataField label="Father's Full Name" value={selectedRecord?.father_name || selectedRecord?.fathers_name || 'None Provided'} />
                                            <div className="grid grid-cols-2 gap-5">
                                                <DataField label="Primary Phone" value={selectedRecord?.caregiver_phone || '--'} />
                                                <DataField label="Relationship" value={selectedRecord?.caregiver_relationship || 'Mother'} />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-4">
                                            <Activity size={12} className="text-[#006B3F]" />
                                            <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-widest">Clinical History</h3>
                                        </div>
                                        <div className="border border-slate-200 p-4 space-y-4">
                                            <div className="grid grid-cols-2 gap-5">
                                                <DataField label="Mother TT Status" value={selectedRecord?.mother_tt_status || 'Unknown'} highlight />
                                                <DataField label="Last TT Date" value={selectedRecord?.last_tt_date ? new Date(selectedRecord.last_tt_date).toLocaleDateString() : '--'} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-5 pt-3 border-t border-slate-100">
                                                <DataField label="CPAB Status" value={selectedRecord?.cpab_status || 'Pending'} />
                                                <DataField label="Initiated Breastfeeding" value={isBreastfed(selectedRecord?.initiated_breastfeeding || selectedRecord?.breastfed_immediately_after_birth) ? 'YES' : 'NO'} highlight />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-4">
                                            <Shield size={12} className="text-[#006B3F]" />
                                            <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-widest">At-Birth Immunization</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* BCG Vaccine */}
                                            <div className={`p-3 border ${getStatusBgClass(record.bcg_status)}`}>
                                                <div className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1">BCG Vaccine</div>
                                                <div className={`text-[9px] font-black uppercase ${getStatusColor(record.bcg_status)}`}>
                                                    {record.bcg_status || 'Pending'}
                                                </div>
                                                <div className="text-[7px] font-bold text-slate-500 mt-1 uppercase">
                                                    DATE: {['Not Given', 'Unknown', 'Pending'].includes(record.bcg_status) ? 'N/A' : record.bcg_date_given}
                                                </div>
                                            </div>

                                            {/* Hepatitis B Vaccine */}
                                            <div className={`p-3 border ${getStatusBgClass(record.hepa_b_status)}`}>
                                                <div className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-1">Hepatitis B</div>
                                                <div className={`text-[9px] font-black uppercase ${getStatusColor(record.hepa_b_status)}`}>
                                                    {record.hepa_b_status || 'Pending'}
                                                </div>
                                                <div className="text-[7px] font-bold text-slate-500 mt-1 uppercase">
                                                    DATE: {['Not Given', 'Unknown', 'Pending'].includes(record.hepa_b_status) ? 'N/A' : record.hepa_b_date_given}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Action Footer */}
                            <div className="p-4 bg-white border-t border-slate-300 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setShowRevisionModal(true)}
                                        disabled={processing}
                                        className="px-4 py-2 border border-amber-600 text-amber-700 text-[9px] font-black uppercase tracking-widest hover:bg-amber-50"
                                    >
                                        <AlertCircle size={12} className="inline mr-1.5" /> Return for Correction
                                    </button>
                                    <button 
                                        onClick={() => setShowRejectionModal(true)}
                                        disabled={processing}
                                        className="px-4 py-2 border border-rose-600 text-rose-700 text-[9px] font-black uppercase tracking-widest hover:bg-rose-50"
                                    >
                                        <XCircle size={12} className="inline mr-1.5" /> Reject Record
                                    </button>
                                </div>

                                <button 
                                    onClick={handleApprove}
                                    disabled={processing}
                                    className="px-10 py-2.5 bg-[#006B3F] text-white text-[9px] font-black uppercase tracking-[0.3em] hover:bg-[#005231] transition-all disabled:opacity-50"
                                >
                                    {processing ? 'Processing...' : 'Approve & Promote'}
                                </button>
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
                        <div className="p-4">
                            <textarea 
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                className="w-full border border-slate-200 p-2 text-[10px] outline-none h-24"
                                placeholder="State reason for rejection..."
                            ></textarea>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setShowRejectionModal(false)} className="flex-1 py-2 text-[9px] font-bold uppercase text-slate-400">Cancel</button>
                                <button onClick={handleReject} disabled={!rejectionReason || processing} className="flex-1 py-2 bg-rose-700 text-white text-[9px] font-bold uppercase">Confirm</button>
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
                            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Correction Request</h3>
                        </div>
                        <div className="p-4">
                            <textarea 
                                value={revisionNotes}
                                onChange={(e) => setRevisionNotes(e.target.value)}
                                className="w-full border border-slate-200 p-2 text-[10px] outline-none h-24"
                                placeholder="Specify required revisions..."
                            ></textarea>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => setShowRevisionModal(false)} className="flex-1 py-2 text-[9px] font-bold uppercase text-slate-400">Cancel</button>
                                <button onClick={handleNeedsRevision} disabled={!revisionNotes || processing} className="flex-1 py-2 bg-amber-600 text-white text-[9px] font-bold uppercase">Return</button>
                            </div>
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
            `}} />
        </div>
    );
};

const DataField = ({ label, value, highlight = false, icon = null }) => (
    <div className="flex flex-col">
        <label className="text-[7px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            {icon} {label}
        </label>
        <div className={`text-[10px] font-bold uppercase tracking-tight ${highlight ? 'text-emerald-800' : 'text-slate-800'}`}>
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
