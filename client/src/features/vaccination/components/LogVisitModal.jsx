import React, { useState, useEffect } from 'react';
import { X, Loader2, ClipboardCheck } from 'lucide-react';
import apiClient from '../../../services/apiClient';

const VISIT_OUTCOME_OPTIONS = [
    { value: 'CONTACTED', label: 'Contacted' },
    { value: 'NOT_FOUND', label: 'Not Found' },
    { value: 'DECLINED', label: 'Declined' },
    { value: 'TRANSFERRED', label: 'Transferred' }
];

const today = new Date().toISOString().slice(0, 10);

const LogVisitModal = ({ isOpen, onClose, infant, onLogSuccess }) => {
    const [visitDate, setVisitDate] = useState(today);
    const [outcome, setOutcome] = useState('CONTACTED');
    const [notes, setNotes] = useState('');
    const [parentContact, setParentContact] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (infant) {
            setParentContact(infant.parent_contact || infant.caregiver_phone || '');
            setVisitDate(today);
            setOutcome('CONTACTED');
            setNotes('');
            setError('');
        }
    }, [infant, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!infant) return;
        
        setSubmitting(true);
        setError('');
        try {
            const res = await apiClient.post(`/follow-ups/${infant.infant_id || infant.id}/logs`, {
                visit_date: visitDate,
                outcome,
                notes: notes.trim(),
                parent_contact: parentContact.trim() || null
            });
            const data = await res.json();
            if (res.ok) {
                if (onLogSuccess) {
                    onLogSuccess();
                }
                onClose();
            } else {
                setError(data.error || 'Failed to log visit.');
            }
        } catch (err) {
            setError('Server connection failed.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen || !infant) return null;

    const addressParts = [
        infant.street_address || infant.exact_address || infant.street || null,
        infant.purok ? `Purok ${infant.purok}` : null,
        (infant.sitio && infant.sitio !== infant.purok) ? `Sitio ${infant.sitio}` : null,
        infant.barangay || null
    ].filter(Boolean).join(', ');

    const formattedAddress = [
        addressParts,
        infant.landmark ? `Landmark: ${infant.landmark}` : null
    ].filter(Boolean).join(', ');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]">
            <form onSubmit={handleSubmit} className="w-full max-w-md bg-white border border-slate-200 shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Log Follow-Up Visit</h3>
                        <p className="mt-1 text-xs text-slate-500 font-bold uppercase tracking-wider">
                            Ref: {infant.reference_id}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                        <X size={16} />
                    </button>
                </div>
                <div className="space-y-4 px-5 py-5 max-h-[70vh] overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                            {error}
                        </div>
                    )}
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Infant Details</p>
                        <p className="mt-1 text-base font-bold text-slate-900">
                            {[infant.first_name, infant.middle_name, infant.last_name].filter(Boolean).join(' ')}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                            Address: {formattedAddress || 'No address details'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                            Due Vaccines: {infant.due_vaccines?.join(', ') || 'None'}
                        </p>
                    </div>
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Visit Date</span>
                        <input
                            type="date"
                            required
                            value={visitDate}
                            onChange={(e) => setVisitDate(e.target.value)}
                            className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800 bg-white"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Parent/Caregiver Contact</span>
                        <input
                            type="text"
                            placeholder="Update phone number..."
                            value={parentContact}
                            onChange={(e) => setParentContact(e.target.value)}
                            className="mt-2 w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800 bg-white"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Visit Outcome</span>
                        <select
                            required
                            value={outcome}
                            onChange={(e) => setOutcome(e.target.value)}
                            className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800"
                        >
                            {VISIT_OUTCOME_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Field Notes</span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Add visit outcomes, next plans, or refusal reasons..."
                            className="mt-2 w-full resize-none border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800 bg-white"
                        />
                    </label>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 bg-slate-50">
                    <button type="button" onClick={onClose} className="border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50">
                        Cancel
                    </button>
                    <button type="submit" disabled={submitting} className="flex items-center gap-1.5 bg-[#084C39] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-[#07362A] disabled:opacity-60">
                        <ClipboardCheck size={14} />
                        {submitting ? 'Saving...' : 'Save Visit Log'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default LogVisitModal;
