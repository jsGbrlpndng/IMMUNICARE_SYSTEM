import React from 'react';
import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * JustificationModal - Unbypassable modal for clinical override justification
 * 
 * CRITICAL ENFORCEMENT:
 * - Cannot be closed by clicking outside
 * - Cannot be closed with Escape key
 * - Submit button disabled until valid justification (10-1000 chars)
 * - Character count validation enforced
 */

const JustificationModal = ({ isOpen, onClose, onSubmit, infantName, vaccine, overrideType }) => {
    const [justification, setJustification] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const trimmedLength = justification.trim().length;
    const isValid = trimmedLength >= 10 && trimmedLength <= 1000;
    const isTooShort = trimmedLength > 0 && trimmedLength < 10;
    const isTooLong = trimmedLength > 1000;

    // Prevent escape key from closing modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown, true);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!isValid || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(justification.trim());
            setJustification('');
        } catch (error) {
            console.error('Justification submission failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setJustification('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            // Prevent closing on outside click
            onClick={(e) => e.stopPropagation()}
        >
            <div 
                className="bg-white rounded-xl shadow-2xl max-w-2xl w-full"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-5 border-b border-amber-200 rounded-t-xl">
                    <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-slate-900 mb-1">
                                Clinical Justification Required
                            </h3>
                            <p className="text-sm text-slate-600">
                                Override requires documented clinical reasoning
                            </p>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-6">
                    {/* Patient Info */}
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-600 font-medium">Infant:</span>
                                <p className="text-slate-900 font-semibold mt-1">{infantName}</p>
                            </div>
                            <div>
                                <span className="text-slate-600 font-medium">Vaccine:</span>
                                <p className="text-slate-900 font-semibold mt-1">{vaccine}</p>
                            </div>
                            {overrideType && (
                                <div className="col-span-2">
                                    <span className="text-slate-600 font-medium">Override Type:</span>
                                    <p className="text-amber-700 font-semibold mt-1">{overrideType}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Justification Input */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Clinical Justification <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            placeholder="Provide detailed clinical reasoning for this override. Include relevant medical history, contraindications, or special circumstances..."
                            rows={6}
                            maxLength={1000}
                            className={`w-full px-4 py-3 border rounded-lg focus:ring-4 focus:ring-blue-500/10 transition-all outline-none resize-none ${
                                isTooShort 
                                    ? 'border-red-300 focus:border-red-500' 
                                    : isTooLong
                                    ? 'border-red-300 focus:border-red-500'
                                    : isValid
                                    ? 'border-emerald-300 focus:border-emerald-500'
                                    : 'border-slate-300 focus:border-blue-500'
                            }`}
                            disabled={isSubmitting}
                        />
                        
                        {/* Character Count */}
                        <div className="flex items-center justify-between mt-2 text-sm">
                            <div>
                                {isTooShort && (
                                    <span className="text-red-600 font-medium">
                                        Minimum 10 characters required ({10 - trimmedLength} more needed)
                                    </span>
                                )}
                                {isTooLong && (
                                    <span className="text-red-600 font-medium">
                                        Maximum 1000 characters exceeded
                                    </span>
                                )}
                                {isValid && (
                                    <span className="text-emerald-600 font-medium">
                                        âœ“ Valid justification
                                    </span>
                                )}
                            </div>
                            <span className={`font-mono ${
                                isTooLong ? 'text-red-600 font-bold' : 'text-slate-500'
                            }`}>
                                {trimmedLength} / 1000
                            </span>
                        </div>
                    </div>

                    {/* Warning Notice */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-amber-900">
                                <p className="font-semibold mb-1">Important Notice</p>
                                <p>
                                    This justification will be permanently recorded in the audit log and cannot be modified. 
                                    Ensure your clinical reasoning is complete and accurate.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-xl flex items-center justify-end space-x-3">
                    <button
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="px-6 py-2.5 text-slate-700 font-semibold hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid || isSubmitting}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Override'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default JustificationModal;
