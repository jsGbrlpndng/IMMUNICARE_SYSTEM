import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { formatFullNameFromObject } from '../utils/formatFullName';

/**
 * RejectionModal - Modal for rejecting infant registrations
 * 
 * Allows midwives to reject registrations with a required reason
 * Integrates with PUT /api/infants/:id/reject endpoint
 * 
 * Requirements: 8.1, 8.2, 8.4
 */
function RejectionModal({ infant, onClose, onReject }) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const rejectionReasons = [
    { value: 'incomplete_data', label: 'Incomplete data' },
    { value: 'invalid_dob', label: 'Invalid date of birth' },
    { value: 'missing_address', label: 'Missing address information' },
    { value: 'cpab_clarification', label: 'CPAB status needs clarification' },
    { value: 'tt_dates_incorrect', label: 'TT vaccination dates incorrect' },
    { value: 'other', label: 'Other (specify in notes)' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!rejectionReason) {
      setError('Please select a rejection reason');
      return;
    }

    if (rejectionReason === 'other' && notes.trim().length < 10) {
      setError('Please provide detailed notes (minimum 10 characters) when selecting "Other"');
      return;
    }

    // Build rejection message
    const selectedReason = rejectionReasons.find(r => r.value === rejectionReason);
    let fullReason = selectedReason.label;
    if (notes.trim()) {
      fullReason += ` - ${notes.trim()}`;
    }

    if (fullReason.length < 10) {
      setError('Rejection reason must be at least 10 characters');
      return;
    }

    setSubmitting(true);

    try {
      await onReject(infant.id, fullReason);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to reject registration');
      setSubmitting(false);
    }
  };

  const characterCount = notes.length;
  const isOtherSelected = rejectionReason === 'other';
  const isValid = rejectionReason && (!isOtherSelected || notes.trim().length >= 10);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Reject Registration</h3>
              <p className="text-sm text-slate-600">
                {infant?.name || formatFullNameFromObject(infant)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            disabled={submitting}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rejection Reason Dropdown */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
              disabled={submitting}
              required
            >
              <option value="">Select a reason...</option>
              {rejectionReasons.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes Textarea */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Additional Notes {isOtherSelected && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide additional details about the rejection..."
              rows={4}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none resize-none"
              disabled={submitting}
            />
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-slate-500">
                {isOtherSelected && 'Minimum 10 characters required'}
              </p>
              <p className={`text-xs ${characterCount < 10 && isOtherSelected ? 'text-red-500' : 'text-slate-500'}`}>
                {characterCount} characters
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Warning Message */}
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-sm text-rose-800">
              <strong>Terminal Action:</strong> This registration will be permanently rejected and moved to archives. 
              Use <strong>Return for Revision</strong> instead if you want the encoder to fix and resubmit it.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg font-semibold transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RejectionModal;
