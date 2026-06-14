import React, { useEffect, useState } from 'react';
import { X, Loader2, UserPlus } from 'lucide-react';
import apiClient from '../services/apiClient';

const DelegationModal = ({ isOpen, onClose, infant, onDelegateSuccess }) => {
    const [bhws, setBhws] = useState([]);
    const [selectedBhwId, setSelectedBhwId] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        setError('');
        apiClient.get('/follow-ups/bhws')
            .then(async (res) => {
                const data = await res.json();
                if (res.ok) {
                    setBhws(data.bhws || []);
                    if (data.bhws?.length > 0) {
                        setSelectedBhwId(data.bhws[0].id);
                    } else {
                        setSelectedBhwId('');
                    }
                } else {
                    setError(data.error || 'Failed to fetch BHWs');
                }
            })
            .catch(() => setError('Failed to connect to the server.'))
            .finally(() => setLoading(false));
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedBhwId) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await apiClient.post(`/follow-ups/${infant.infant_id}/delegate`, {
                bhwId: selectedBhwId,
                notes: notes
            });
            const data = await res.json();
            if (res.ok) {
                if (onDelegateSuccess) {
                    onDelegateSuccess(data.bhwName);
                }
                onClose();
            } else {
                setError(data.error || 'Delegation failed.');
            }
        } catch (err) {
            setError('Server connection failed.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen || !infant) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]">
            <form onSubmit={handleSubmit} className="w-full max-w-md bg-white border border-slate-200 shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Delegate Follow-Up</h3>
                        <p className="mt-1 text-xs text-slate-500 font-bold uppercase tracking-wider">
                            Ref: {infant.reference_id}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                        <X size={16} />
                    </button>
                </div>
                <div className="space-y-4 px-5 py-5">
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
                            Due Vaccines: {infant.due_vaccines?.join(', ') || 'None'}
                        </p>
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-6 text-slate-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Retrieving active BHW list...
                        </div>
                    ) : (
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Assign Barangay Health Worker</span>
                            <select
                                required
                                value={selectedBhwId}
                                onChange={(e) => setSelectedBhwId(e.target.value)}
                                className="mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800"
                            >
                                {bhws.length === 0 ? (
                                    <option value="">No active BHWs found</option>
                                ) : (
                                    bhws.map(bhw => (
                                        <option key={bhw.id} value={bhw.id}>{bhw.full_name}</option>
                                    ))
                                )}
                            </select>
                        </label>
                    )}
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Delegation Instructions / Notes</span>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Add priority task context..."
                            className="mt-2 w-full resize-none border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-800"
                        />
                    </label>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 bg-slate-50">
                    <button type="button" onClick={onClose} className="border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50">
                        Cancel
                    </button>
                    <button type="submit" disabled={submitting || !selectedBhwId} className="flex items-center gap-1.5 bg-[#084C39] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-[#07362A] disabled:opacity-60">
                        <UserPlus size={14} />
                        {submitting ? 'Delegating...' : 'Confirm'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default DelegationModal;
