import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, Lock, X, AlertCircle, CheckCircle, UserCheck } from 'lucide-react';

/**
 * ClinicalAuthorizationModal - Main authorization interface for clinical exceptions
 * 
 * PURPOSE:
 * - Provides clinical justification input interface
 * - Shows DOH compliance warnings and clinical context
 * - Requires explicit clinical responsibility confirmation
 * - Cannot be bypassed or closed without action
 * 
 * DESIGN PRINCIPLES:
 * - Unbypassable modal (no outside click or ESC key closing)
 * - Clear display of system decision being challenged
 * - Mandatory clinical justification (10-1000 characters)
 * - Explicit confirmation of clinical responsibility
 * - DOH compliance validation visible
 */

const ClinicalAuthorizationModal = ({ 
    isOpen, 
    onClose, 
    onAuthorize, 
    alert,
    complianceStatus = null 
}) => {
    const [justification, setJustification] = useState('');
    const [acceptResponsibility, setAcceptResponsibility] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const trimmedLength = justification.trim().length;
    const isJustificationValid = trimmedLength >= 10 && trimmedLength <= 1000;
    const isTooShort = trimmedLength > 0 && trimmedLength < 10;
    const isTooLong = trimmedLength > 1000;
    const canSubmit = isJustificationValid && acceptResponsibility && !isSubmitting;

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

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setJustification('');
            setAcceptResponsibility(false);
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!canSubmit) return;

        setIsSubmitting(true);
        try {
            await onAuthorize({
                alertId: alert.id,
                infantId: alert.infantId,
                vaccineId: alert.vaccineId,
                overrideType: alert.type,
                clinicalJustification: justification.trim(),
                acceptedResponsibility: acceptResponsibility
            });
            setJustification('');
            setAcceptResponsibility(false);
        } catch (error) {
            console.error('Authorization submission failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setJustification('');
        setAcceptResponsibility(false);
        onClose();
    };

    if (!isOpen || !alert) return null;

    const hasComplianceViolations = complianceStatus && !complianceStatus.compliant;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
        >
            <div 
                className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 border-b border-blue-200 rounded-t-xl sticky top-0 z-10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <Lock className="w-6 h-6 text-[#0061FF]" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-slate-900 mb-1">
                                    Clinical Authorization Request
                                </h3>
                                <p className="text-sm text-slate-600">
                                    Review system decision and provide clinical justification
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-6">
                    {/* Alert Information */}
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <h4 className="font-bold text-slate-900 mb-3 flex items-center space-x-2">
                            <AlertCircle className="w-5 h-5 text-[#0061FF]" />
                            <span>Schedule Alert Details</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-600 font-medium">Infant:</span>
                                <p className="text-slate-900 font-semibold mt-1">{alert.infantName}</p>
                            </div>
                            <div>
                                <span className="text-slate-600 font-medium">Vaccine:</span>
                                <p className="text-slate-900 font-semibold mt-1">{alert.vaccine}</p>
                            </div>
                            <div>
                                <span className="text-slate-600 font-medium">Alert Type:</span>
                                <p className="text-amber-700 font-semibold mt-1">{alert.type}</p>
                            </div>
                            <div>
                                <span className="text-slate-600 font-medium">Calculated Date:</span>
                                <p className="text-slate-900 font-semibold mt-1 font-mono">
                                    {alert.calculatedDate ? new Date(alert.calculatedDate).toLocaleDateString() : 'N/A'}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <span className="text-slate-600 font-medium">System Decision:</span>
                                <p className="text-slate-900 font-semibold mt-1">{alert.systemDecision}</p>
                            </div>
                            {alert.clinicalContext && (
                                <div className="col-span-2">
                                    <span className="text-slate-600 font-medium">Clinical Context:</span>
                                    <p className="text-slate-700 mt-1">{alert.clinicalContext}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* DOH Compliance Status */}
                    {complianceStatus && (
                        <div className={`rounded-lg p-4 border ${
                            hasComplianceViolations 
                                ? 'bg-red-50 border-red-300' 
                                : 'bg-emerald-50 border-emerald-300'
                        }`}>
                            <div className="flex items-start space-x-3">
                                <Shield className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                                    hasComplianceViolations ? 'text-red-600' : 'text-emerald-600'
                                }`} />
                                <div className="flex-1">
                                    <h4 className={`font-bold mb-2 ${
                                        hasComplianceViolations ? 'text-red-900' : 'text-emerald-900'
                                    }`}>
                                        DOH Compliance Status
                                    </h4>
                                    {hasComplianceViolations ? (
                                        <div className="space-y-2">
                                            <p className="text-sm text-red-800 font-semibold">
                                                ⚠️ This authorization violates DOH guidelines and cannot be approved
                                            </p>
                                            <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                                                {complianceStatus.violatedRules.map((rule, idx) => (
                                                    <li key={idx}>{rule}</li>
                                                ))}
                                            </ul>
                                            {complianceStatus.minimumAllowedDate && (
                                                <p className="text-sm text-red-800 mt-2">
                                                    <span className="font-semibold">Earliest allowed date:</span>{' '}
                                                    {new Date(complianceStatus.minimumAllowedDate).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-emerald-800">
                                            ✓ This authorization complies with DOH guidelines
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Clinical Justification Input */}
                    {!hasComplianceViolations && (
                        <>
                            <div>
                                <label className="block text-sm font-bold text-slate-900 mb-2">
                                    Clinical Justification <span className="text-red-500">*</span>
                                </label>
                                <p className="text-xs text-slate-600 mb-3">
                                    Provide detailed clinical reasoning for authorizing this exception. 
                                    Include relevant medical history, contraindications, or special circumstances.
                                </p>
                                <textarea
                                    value={justification}
                                    onChange={(e) => setJustification(e.target.value)}
                                    placeholder="Example: Infant was hospitalized during the scheduled vaccination window. Medical records confirm recovery and clearance for vaccination. Catch-up schedule approved per DOH guidelines..."
                                    rows={6}
                                    maxLength={1000}
                                    className={`w-full px-4 py-3 border rounded-lg focus:ring-4 focus:ring-blue-500/10 transition-all outline-none resize-none ${
                                        isTooShort 
                                            ? 'border-red-300 focus:border-red-500' 
                                            : isTooLong
                                            ? 'border-red-300 focus:border-red-500'
                                            : isJustificationValid
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
                                        {isJustificationValid && (
                                            <span className="text-emerald-600 font-medium">
                                                ✓ Valid justification
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

                            {/* Clinical Responsibility Confirmation */}
                            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                                <label className="flex items-start space-x-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={acceptResponsibility}
                                        onChange={(e) => setAcceptResponsibility(e.target.checked)}
                                        className="mt-1 w-5 h-5 text-[#0061FF] border-amber-400 rounded focus:ring-2 focus:ring-[#0061FF] cursor-pointer"
                                        disabled={isSubmitting}
                                    />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-amber-900 mb-1">
                                            Clinical Responsibility Acknowledgment <span className="text-red-500">*</span>
                                        </p>
                                        <p className="text-sm text-amber-800">
                                            I acknowledge that I am authorizing this vaccination exception based on my clinical judgment. 
                                            This authorization will be permanently recorded in the audit trail and cannot be modified. 
                                            I accept full clinical responsibility for this decision.
                                        </p>
                                    </div>
                                </label>
                            </div>

                            {/* Important Notice */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-start space-x-3">
                                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-blue-900">
                                        <p className="font-semibold mb-1">Important Notice</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>The NIP Schedule Engine's calculated dates will remain unchanged</li>
                                            <li>This authorization only affects system decision flags</li>
                                            <li>All authorization details are permanently logged for DOH compliance</li>
                                            <li>Authorization cannot be modified or deleted after submission</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 rounded-b-xl flex items-center justify-end space-x-3 sticky bottom-0">
                    <button
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="px-6 py-2.5 text-slate-700 font-semibold hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    {!hasComplianceViolations && (
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="px-6 py-2.5 bg-gradient-to-r from-[#0061FF] to-blue-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center space-x-2"
                        >
                            <UserCheck className="w-4 h-4" />
                            <span>{isSubmitting ? 'Authorizing...' : 'Authorize Exception'}</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClinicalAuthorizationModal;
