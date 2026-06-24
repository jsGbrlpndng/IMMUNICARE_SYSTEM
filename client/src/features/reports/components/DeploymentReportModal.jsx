import React, { useState } from 'react';
import { X, AlertTriangle, FileText } from 'lucide-react';
import apiClient from '../../../services/apiClient';


function DeploymentReportModal({ cluster, onClose, onSubmitSuccess }) {
    const [summaryNotes, setSummaryNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [outcomes, setOutcomes] = useState(() =>
        (cluster.points || []).map(infant => ({
            infant_id: infant.id,
            name: `${infant.first_name} ${infant.last_name}`,
            reference_id: infant.reference_id,
            outcome: 'Fully Vaccinated',
            notes: ''
        }))
    );

    const outcomeOptions = [
        { value: 'Fully Vaccinated', label: 'Fully Vaccinated' },
        { value: 'Partially Vaccinated', label: 'Partially Vaccinated' },
        { value: 'Refused', label: 'Refused' },
        { value: 'Moved Out', label: 'Moved Out' },
        { value: 'Rescheduled', label: 'Rescheduled' },
        { value: 'Not Found', label: 'Not Found' }
    ];

    const handleOutcomeChange = (index, value) => {
        setOutcomes(prev => prev.map((item, idx) =>
            idx === index ? { ...item, outcome: value } : item
        ));
    };

    const handleNotesChange = (index, value) => {
        setOutcomes(prev => prev.map((item, idx) =>
            idx === index ? { ...item, notes: value } : item
        ));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            const cleanedOutcomes = outcomes.map(({ infant_id, outcome, notes }) => ({
                infant_id,
                outcome,
                notes
            }));

            const response = await apiClient.post(`/clinical/deployments/${cluster.id}/report`, {
                outcomes: cleanedOutcomes,
                summaryNotes
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to submit deployment report');
            }

            if (onSubmitSuccess) {
                onSubmitSuccess(data.report);
            }
            onClose();
        } catch (err) {
            console.error('[SUBMIT_REPORT_ERROR]', err);
            setError(err.message || 'An unexpected error occurred.');
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 font-sans">Submit Deployment Report</h3>
                            <p className="text-xs text-slate-500 font-medium">
                                {cluster.cluster_label || 'Priority Area'} &bull; {cluster.barangay} &bull; {outcomes.length} Infant(s)
                            </p>
                            <p className="text-xs text-slate-400 font-semibold mt-0.5">
                                Assigned Healthcare Worker:{' '}
                                <span className="text-slate-700 font-bold">
                                    {cluster.assigned_user_name || cluster.assigned_bhw_name
                                        ? `${cluster.assigned_user_name || cluster.assigned_bhw_name}${cluster.assigned_user_role ? ` (${cluster.assigned_user_role})` : ''}`
                                        : 'Not assigned'}
                                </span>
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                        disabled={submitting}
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                    {/* Error Banner */}
                    {error && (
                        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2 text-rose-800 text-sm">
                            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {/* Table Container */}
                    <div className="flex-1 overflow-y-auto my-4 border border-slate-150 rounded-xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="px-4 py-3">Infant Name & Ref</th>
                                    <th className="px-4 py-3 w-48">Outcome</th>
                                    <th className="px-4 py-3">Follow-up Notes / Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                                {outcomes.map((item, index) => (
                                    <tr key={item.infant_id} className="hover:bg-slate-50/50">
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-900">{item.name}</div>
                                            <div className="text-xs text-slate-400 font-mono">{item.reference_id}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <select
                                                value={item.outcome}
                                                onChange={(e) => handleOutcomeChange(index, e.target.value)}
                                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-semibold text-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition"
                                                disabled={submitting}
                                            >
                                                {outcomeOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                value={item.notes}
                                                onChange={(e) => handleNotesChange(index, e.target.value)}
                                                placeholder="e.g. refused due to fever, scheduled for next week..."
                                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition"
                                                disabled={submitting}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary Notes */}
                    <div className="mb-4">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                            Deployment Summary / Operational Notes
                        </label>
                        <textarea
                            value={summaryNotes}
                            onChange={(e) => setSummaryNotes(e.target.value)}
                            placeholder="Add overall observations about the cluster, challenges encountered, BHW feedback, etc."
                            rows={3}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition resize-none"
                            disabled={submitting}
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition"
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50"
                            disabled={submitting}
                        >
                            {submitting ? 'Submitting...' : 'Submit Deployment Report'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default DeploymentReportModal;
