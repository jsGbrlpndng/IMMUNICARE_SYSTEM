import React from 'react';
import { Shield, AlertTriangle, XCircle, Info, Calendar } from 'lucide-react';

/**
 * ComplianceWarningDisplay - Shows DOH compliance violations and warnings
 * 
 * PURPOSE:
 * - Display specific DOH compliance violations clearly
 * - Show minimum interval violations
 * - Prevent authorization for non-compliant requests
 * - Provide guidance on compliance requirements
 * 
 * DESIGN PRINCIPLES:
 * - Clear visual hierarchy for severity levels
 * - Specific violation messages
 * - Actionable guidance
 * - DOH branding and authority
 */

const ComplianceWarningDisplay = ({ 
    complianceStatus, 
    className = '',
    showDetails = true 
}) => {
    if (!complianceStatus) {
        return null;
    }

    const { compliant, violatedRules = [], minimumAllowedDate, recommendedAction } = complianceStatus;

    // If compliant, show success state
    if (compliant) {
        return (
            <div className={`bg-emerald-50 border border-emerald-300 rounded-lg p-4 ${className}`}>
                <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h4 className="font-bold text-emerald-900 mb-1">
                            DOH Compliance: Approved
                        </h4>
                        <p className="text-sm text-emerald-800">
                            This authorization complies with Department of Health vaccination guidelines.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Non-compliant state - show violations
    return (
        <div className={`bg-red-50 border-2 border-red-400 rounded-lg p-4 ${className}`}>
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <XCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-red-900 text-lg mb-1">
                            DOH Compliance Violation
                        </h4>
                        <p className="text-sm text-red-800 font-semibold">
                            This authorization cannot be approved due to Department of Health guideline violations.
                        </p>
                    </div>
                </div>

                {/* Violated Rules */}
                {showDetails && violatedRules.length > 0 && (
                    <div className="bg-white border border-red-300 rounded-lg p-4">
                        <div className="flex items-start space-x-2 mb-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <h5 className="font-bold text-red-900">Specific Violations:</h5>
                        </div>
                        <ul className="space-y-2">
                            {violatedRules.map((rule, index) => (
                                <li key={index} className="flex items-start space-x-2 text-sm">
                                    <span className="text-red-600 font-bold flex-shrink-0">â€¢</span>
                                    <span className="text-red-900">{rule}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Minimum Allowed Date */}
                {showDetails && minimumAllowedDate && (
                    <div className="bg-white border border-red-300 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                            <Calendar className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h5 className="font-bold text-red-900 mb-1">Earliest Allowed Date:</h5>
                                <p className="text-lg font-mono font-bold text-red-700">
                                    {new Date(minimumAllowedDate).toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                                <p className="text-sm text-red-800 mt-2">
                                    This date is calculated based on DOH minimum interval requirements and cannot be overridden.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Recommended Action */}
                {showDetails && recommendedAction && (
                    <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h5 className="font-bold text-blue-900 mb-1">Recommended Action:</h5>
                                <p className="text-sm text-blue-800">{recommendedAction}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* DOH Authority Notice */}
                <div className="bg-slate-100 border border-slate-300 rounded-lg p-3">
                    <div className="flex items-start space-x-2">
                        <Shield className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-700">
                            <span className="font-bold">DOH Authority:</span> These restrictions are mandated by the 
                            Department of Health National Immunization Program guidelines and cannot be bypassed. 
                            Minimum intervals are absolute constraints designed to ensure vaccine safety and efficacy.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * ComplianceWarningBadge - Compact badge version for inline display
 */
export const ComplianceWarningBadge = ({ compliant, violationCount = 0 }) => {
    if (compliant) {
        return (
            <span className="inline-flex items-center space-x-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                <Shield className="w-3 h-3" />
                <span>DOH Compliant</span>
            </span>
        );
    }

    return (
        <span className="inline-flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
            <XCircle className="w-3 h-3" />
            <span>DOH Violation ({violationCount})</span>
        </span>
    );
};

/**
 * ComplianceWarningList - List view for multiple warnings
 */
export const ComplianceWarningList = ({ warnings = [], className = '' }) => {
    if (!warnings || warnings.length === 0) {
        return null;
    }

    return (
        <div className={`space-y-2 ${className}`}>
            {warnings.map((warning, index) => (
                <div 
                    key={index}
                    className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-300 rounded-lg"
                >
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-900">{warning}</p>
                </div>
            ))}
        </div>
    );
};

export default ComplianceWarningDisplay;
