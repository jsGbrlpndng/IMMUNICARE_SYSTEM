import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { formatFullNameFromObject } from '../utils/formatFullName';

/**
 * ApprovalSuccessModal - Success feedback modal after infant registration approval
 * 
 * Displays confirmation message and provides navigation options to either:
 * - Continue validating more registrations
 * - Navigate to NIP Schedule to view the approved infant
 * 
 * Requirements: 5.3, 5.6
 */
function ApprovalSuccessModal({ infant, onClose }) {
  const navigate = useNavigate();

  if (!infant) return null;

  const handleNavigateToSchedule = () => {
    onClose();
    navigate('/clinical/nip-schedule');
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl animate-fadeIn">
        {/* Success Icon */}
        <div className="flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        
        {/* Success Message */}
        <h3 className="text-2xl font-bold text-slate-900 text-center mb-2">
          Registration Approved!
        </h3>
        
        {/* Infant Details */}
        <p className="text-slate-600 text-center mb-6">
          <strong className="text-slate-900">
            {infant.name || formatFullNameFromObject(infant)}
          </strong>
          {infant.reference_id && (
            <span className="block text-sm text-slate-500 mt-1">
              ID: {infant.reference_id}
            </span>
          )}
          <span className="block mt-2">
            has been approved and is now available in the NIP Schedule for vaccination planning.
          </span>
        </p>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg font-semibold transition-colors"
          >
            Continue Validating
          </button>
          <button
            onClick={handleNavigateToSchedule}
            className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Go to NIP Schedule →
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalSuccessModal;
