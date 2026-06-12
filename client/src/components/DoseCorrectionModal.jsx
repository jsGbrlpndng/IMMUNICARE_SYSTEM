import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { AlertCircle, Calendar, FileWarning, PencilLine, ShieldAlert, X } from 'lucide-react';
import apiClient from '../services/apiClient';

const toDateOnlyString = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const raw = String(value).trim();
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return toDateOnlyString(parsed);
};

const readServerError = async (response) => {
    try {
        const payload = await response.json();
        return payload?.details || payload?.message || payload?.error || `HTTP ${response.status}`;
    } catch (error) {
        return `HTTP ${response.status}`;
    }
};

const DoseCorrectionModal = ({
    isOpen,
    onClose,
    onSuccess,
    infant,
    dose
}) => {
    const [form, setForm] = useState({
        administered_date: toDateOnlyString(dose?.actual_date || dose?.administered_date),
        reason: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const maxDate = useMemo(() => toDateOnlyString(new Date()), []);

    if (!isOpen || !dose) return null;

    const handleClose = () => {
        if (submitting) return;
        setError('');
        setForm({
            administered_date: toDateOnlyString(dose?.actual_date || dose?.administered_date),
            reason: ''
        });
        onClose?.();
    };

    const validate = () => {
        const reason = String(form.reason || '').trim();
        if (!form.administered_date) {
            setError('A corrected administered date is required.');
            return false;
        }
        if (!reason) {
            setError('A correction reason is required.');
            return false;
        }
        setError('');
        return true;
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validate()) return;

        try {
            setSubmitting(true);
            setError('');

            const response = await apiClient.put(`/vaccinations/${dose.vaccination_id}`, {
                administered_date: form.administered_date,
                reason: form.reason.trim()
            });

            if (!response.ok) {
                const message = await readServerError(response);
                throw new Error(message);
            }

            const payload = await response.json();
            await onSuccess?.(payload);
            handleClose();
        } catch (submitError) {
            setError(submitError.message || 'Failed to correct dose. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const modalContent = (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-8 py-5">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Dose Correction</div>
                        <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-slate-900">
                            Correct Vaccination Record
                        </h3>
                        <p className="mt-2 text-xs font-semibold text-slate-500">
                            {infant?.name} • {dose?.vaccine_name} • Dose {dose?.dose_number}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-[4px] p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6">
                    <div className="space-y-5">
                        <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-4">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Audit Protected Action</div>
                                    <p className="mt-1 text-sm font-semibold leading-6 text-amber-900">
                                        All corrections are recorded in the system audit log.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-sm border border-slate-200 bg-white px-5 py-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Current Administered Date</div>
                                    <div className="mt-2 text-sm font-bold text-slate-800">
                                        {dose?.actual_date ? new Date(dose.actual_date).toLocaleDateString('en-US', {
                                            month: 'long',
                                            day: 'numeric',
                                            year: 'numeric'
                                        }) : 'Not Recorded'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Record Context</div>
                                    <div className="mt-2 text-sm font-bold text-slate-800">
                                        {dose?.vaccine_code} • Batch {dose?.batch_number || 'Not Recorded'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <form id="dose-correction-form" onSubmit={handleSubmit} className="space-y-5 rounded-sm border border-slate-200 bg-white p-6">
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                    <Calendar className="h-3.5 w-3.5" />
                                    Corrected Administered Date
                                </label>
                                <input
                                    type="date"
                                    required
                                    max={maxDate}
                                    value={form.administered_date}
                                    onChange={(event) => setForm((current) => ({ ...current, administered_date: event.target.value }))}
                                    className="w-full rounded-[4px] border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-900 outline-none transition-colors focus:border-[#064E3B] focus:ring-2 focus:ring-[#064E3B]/15"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                    <PencilLine className="h-3.5 w-3.5" />
                                    Reason for Correction
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    value={form.reason}
                                    onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                                    placeholder="Document the clinical rationale for this correction."
                                    className="w-full resize-none rounded-[4px] border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-900 outline-none transition-colors focus:border-[#064E3B] focus:ring-2 focus:ring-[#064E3B]/15"
                                />
                            </div>
                        </form>
                    </div>
                </div>

                <div className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-8 py-5">
                    <div className="min-h-[2.75rem] flex-1">
                        {error && (
                            <div className="flex items-start gap-2 rounded-[4px] border border-red-300 bg-red-50 px-3 py-2 text-red-800 shadow-sm">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span className="text-[11px] font-black uppercase tracking-[0.08em]">{error}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex shrink-0 gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="rounded-[4px] border border-slate-200 bg-white px-6 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            form="dose-correction-form"
                            type="submit"
                            disabled={submitting}
                            className={`rounded-[4px] px-6 py-2.5 text-xs font-black uppercase tracking-[0.18em] transition-colors ${
                                submitting
                                    ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                                    : 'bg-[#064E3B] text-white hover:bg-[#053d2f]'
                            }`}
                        >
                            {submitting ? 'Saving Correction...' : 'Save Correction'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};

export default DoseCorrectionModal;
