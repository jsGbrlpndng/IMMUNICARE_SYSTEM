import React from 'react';
import { useState } from 'react';
import { X, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import apiClient from '../services/apiClient';

const DeferralModal = ({ infant, vaccine, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        defer_type: 'temporary_deferral',
        reason: '',
        medical_note: '',
        deferred_until: ''
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const validateForm = () => {
        const newErrors = {};

        if (!formData.defer_type) {
            newErrors.defer_type = 'Deferral type is required';
        }

        if (formData.defer_type === 'contraindication' && !formData.medical_note.trim()) {
            newErrors.medical_note = 'Medical note is required for contraindications';
        }

        if (!formData.reason.trim() && !formData.medical_note.trim()) {
            newErrors.reason = 'Either reason or medical note must be provided';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        try {
            setSubmitting(true);
            setErrors({});

            const response = await apiClient.post('/schedule/defer', {
                infant_id: infant.id,
                vaccine_name: vaccine,
                defer_type: formData.defer_type,
                reason: formData.reason.trim() || formData.medical_note.trim(),
                medical_note: formData.medical_note.trim() || null,
                deferred_by: 'current-user', // TODO: Get from auth context
                deferred_until: formData.deferred_until || null
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details?.message || errorData.error || 'Failed to defer vaccination');
            }

            const data = await response.json();
            
            setSuccess(true);
            setTimeout(() => {
                onSave(data);
            }, 1500);

        } catch (error) {
            console.error('Error deferring vaccination:', error);
            setErrors({ submit: error.message });
        } finally {
            setSubmitting(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    if (success) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Deferral Recorded!</h3>
                    <p className="text-slate-600">The vaccination deferral has been recorded and logged in the audit trail.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-50 to-slate-50 p-6 border-b border-slate-200 rounded-t-2xl sticky top-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Defer Vaccination</h2>
                                <p className="text-sm text-slate-600">
                                    {infant.first_name} {infant.last_name}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onCancel}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Error Alert */}
                    {errors.submit && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-semibold text-red-900">Error</h4>
                                <p className="text-sm text-red-700">{errors.submit}</p>
                            </div>
                        </div>
                    )}

                    {/* Vaccine Info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <h4 className="font-semibold text-blue-900 mb-2">Vaccine Information</h4>
                        <div className="text-sm text-blue-700">
                            <p><span className="font-medium">Vaccine:</span> {vaccine}</p>
                        </div>
                    </div>

                    {/* Deferral Type */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Deferral Type <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.defer_type}
                            onChange={(e) => handleChange('defer_type', e.target.value)}
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none bg-white ${
                                errors.defer_type ? 'border-red-300 bg-red-50' : 'border-slate-200'
                            }`}
                        >
                            <option value="temporary_deferral">Temporary Deferral</option>
                            <option value="contraindication">Contraindication</option>
                            <option value="reschedule">Reschedule</option>
                        </select>
                        {errors.defer_type && (
                            <p className="text-sm text-red-600 mt-1">{errors.defer_type}</p>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Reason {formData.defer_type !== 'contraindication' && <span className="text-red-500">*</span>}
                        </label>
                        <textarea
                            value={formData.reason}
                            onChange={(e) => handleChange('reason', e.target.value)}
                            rows="3"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none ${
                                errors.reason ? 'border-red-300 bg-red-50' : 'border-slate-200'
                            }`}
                            placeholder="e.g., Infant has mild fever, defer until resolved"
                        />
                        {errors.reason && (
                            <p className="text-sm text-red-600 mt-1">{errors.reason}</p>
                        )}
                    </div>

                    {/* Medical Note (required for contraindication) */}
                    {formData.defer_type === 'contraindication' && (
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Medical Note <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={formData.medical_note}
                                onChange={(e) => handleChange('medical_note', e.target.value)}
                                rows="4"
                                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none ${
                                    errors.medical_note ? 'border-red-300 bg-red-50' : 'border-slate-200'
                                }`}
                                placeholder="Provide detailed medical justification for contraindication..."
                            />
                            {errors.medical_note && (
                                <p className="text-sm text-red-600 mt-1">{errors.medical_note}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1">
                                Medical note is required for contraindications and will be logged in the audit trail.
                            </p>
                        </div>
                    )}

                    {/* Deferred Until */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Deferred Until (Optional)
                        </label>
                        <input
                            type="date"
                            value={formData.deferred_until}
                            onChange={(e) => handleChange('deferred_until', e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Specify when the vaccination can be reconsidered (if applicable).
                        </p>
                    </div>

                    {/* Warning */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-start space-x-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-800">
                                <p className="font-semibold mb-1">Important</p>
                                <p>This action will be permanently logged in the audit trail. Ensure all information is accurate and complete.</p>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-3 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 px-6 py-3 text-slate-600 hover:text-slate-800 font-semibold transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                    Recording...
                                </span>
                            ) : (
                                'Record Deferral'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DeferralModal;
