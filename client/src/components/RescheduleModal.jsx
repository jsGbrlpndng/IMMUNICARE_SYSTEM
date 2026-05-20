import { useState } from 'react';
import { X, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import apiClient from '../services/apiClient';

const RescheduleModal = ({ infant, vaccine, originalDueDate, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        new_due_date: '',
        reason: ''
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const validateForm = () => {
        const newErrors = {};

        if (!formData.new_due_date) {
            newErrors.new_due_date = 'New due date is required';
        }

        if (!formData.reason.trim()) {
            newErrors.reason = 'Reason is required and cannot be empty';
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

            const response = await apiClient.post('/schedule/reschedule', {
                infant_id: infant.id,
                vaccine_name: vaccine,
                original_due_date: originalDueDate,
                new_due_date: formData.new_due_date,
                reason: formData.reason.trim(),
                rescheduled_by: 'current-user' // TODO: Get from auth context
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details?.message || errorData.error || 'Failed to reschedule');
            }

            const data = await response.json();
            
            setSuccess(true);
            setTimeout(() => {
                onSave(data);
            }, 1500);

        } catch (error) {
            console.error('Error rescheduling vaccination:', error);
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
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Rescheduled Successfully!</h3>
                    <p className="text-slate-600">The vaccination has been rescheduled and logged in the audit trail.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-50 to-slate-50 p-6 border-b border-slate-200 rounded-t-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Reschedule Vaccination</h2>
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
                        <div className="text-sm text-blue-700 space-y-1">
                            <p><span className="font-medium">Vaccine:</span> {vaccine}</p>
                            <p><span className="font-medium">Original Due Date:</span> {new Date(originalDueDate).toLocaleDateString()}</p>
                        </div>
                    </div>

                    {/* New Due Date */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            New Due Date <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="date"
                            value={formData.new_due_date}
                            onChange={(e) => handleChange('new_due_date', e.target.value)}
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none transition-all ${
                                errors.new_due_date ? 'border-red-300 bg-red-50' : 'border-slate-200'
                            }`}
                        />
                        {errors.new_due_date && (
                            <p className="text-sm text-red-600 mt-1">{errors.new_due_date}</p>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Reason for Rescheduling <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={formData.reason}
                            onChange={(e) => handleChange('reason', e.target.value)}
                            rows="4"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none ${
                                errors.reason ? 'border-red-300 bg-red-50' : 'border-slate-200'
                            }`}
                            placeholder="e.g., Guardian unavailable - will return next week"
                        />
                        {errors.reason && (
                            <p className="text-sm text-red-600 mt-1">{errors.reason}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                            Provide a clear reason for rescheduling. This will be logged in the audit trail.
                        </p>
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
                            className="flex-1 bg-amber-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                    Rescheduling...
                                </span>
                            ) : (
                                'Reschedule'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RescheduleModal;
