import { UserCheck, Clock, CheckCircle, AlertTriangle, Info, Eye } from 'lucide-react';
import { useState } from 'react';

/**
 * OverrideStatusIndicator - Displays "Late but Clinically Approved" status
 * 
 * PURPOSE:
 * - Show clinical authorization status clearly
 * - Display clinical reasoning and authorization details
 * - Use consistent ImmuniCare branding (#0061FF)
 * - Provide expandable details for audit transparency
 * 
 * DESIGN PRINCIPLES:
 * - Clear visual distinction from normal status
 * - Clinical authority emphasized
 * - Audit trail transparency
 * - Professional medical context
 */

const OverrideStatusIndicator = ({ 
    status,
    authorizationDetails = null,
    compact = false,
    showDetails = true,
    className = ''
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // If no authorization, show normal status
    if (!authorizationDetails || status !== 'LATE_BUT_APPROVED') {
        return null;
    }

    const {
        authorizedBy,
        authorizedAt,
        clinicalJustification,
        overrideType,
        midwifeName,
        auditTrailId
    } = authorizationDetails;

    // Compact badge version
    if (compact) {
        return (
            <span className={`inline-flex items-center space-x-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full ${className}`}>
                <UserCheck className="w-3 h-3" />
                <span>LATE BUT APPROVED</span>
            </span>
        );
    }

    // Full display version
    return (
        <div className={`bg-emerald-50 border-2 border-emerald-300 rounded-lg overflow-hidden ${className}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-100 to-emerald-50 px-4 py-3 border-b border-emerald-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center">
                            <UserCheck className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                            <h4 className="font-bold text-emerald-900 text-sm">
                                LATE BUT CLINICALLY APPROVED
                            </h4>
                            <p className="text-xs text-emerald-700">
                                Clinical authorization granted
                            </p>
                        </div>
                    </div>
                    {showDetails && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="flex items-center space-x-1 px-3 py-1.5 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors text-xs font-medium"
                        >
                            <Eye className="w-3 h-3" />
                            <span>{isExpanded ? 'Hide' : 'View'} Details</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Authorization Summary */}
            <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="text-emerald-700 font-medium text-xs">Authorized By:</span>
                        <p className="text-emerald-900 font-semibold">
                            {midwifeName || authorizedBy || 'Clinical Staff'}
                        </p>
                    </div>
                    <div>
                        <span className="text-emerald-700 font-medium text-xs">Authorization Date:</span>
                        <p className="text-emerald-900 font-semibold">
                            {authorizedAt ? new Date(authorizedAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            }) : 'N/A'}
                        </p>
                    </div>
                    {overrideType && (
                        <div className="col-span-2">
                            <span className="text-emerald-700 font-medium text-xs">Override Type:</span>
                            <p className="text-emerald-900 font-semibold">{overrideType}</p>
                        </div>
                    )}
                </div>

                {/* Expanded Details */}
                {isExpanded && showDetails && (
                    <div className="mt-4 pt-4 border-t border-emerald-200 space-y-3">
                        {/* Clinical Justification */}
                        {clinicalJustification && (
                            <div>
                                <label className="text-emerald-700 font-bold text-xs mb-2 block">
                                    Clinical Justification:
                                </label>
                                <div className="bg-white border border-emerald-200 rounded-lg p-3">
                                    <p className="text-sm text-slate-700 leading-relaxed">
                                        {clinicalJustification}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Audit Trail Reference */}
                        {auditTrailId && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                <div className="flex items-start space-x-2">
                                    <Info className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <p className="text-xs text-slate-600">
                                            <span className="font-semibold">Audit Trail ID:</span>
                                            <span className="ml-2 font-mono text-slate-700">{auditTrailId}</span>
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            This authorization is permanently logged and cannot be modified.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Clinical Responsibility Notice */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex items-start space-x-2">
                                <UserCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-800">
                                    <span className="font-semibold">Clinical Authority:</span> This vaccination was 
                                    authorized by a qualified healthcare provider based on clinical judgment. The 
                                    NIP Schedule Engine's calculated dates remain unchanged. This authorization only 
                                    affects system decision flags.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * OverrideStatusBadge - Minimal badge for inline display
 */
export const OverrideStatusBadge = ({ status, size = 'md' }) => {
    if (status !== 'LATE_BUT_APPROVED') {
        return null;
    }

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-3 py-1 text-xs',
        lg: 'px-4 py-1.5 text-sm'
    };

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-3 h-3',
        lg: 'w-4 h-4'
    };

    return (
        <span className={`inline-flex items-center space-x-1 bg-emerald-100 text-emerald-700 font-bold rounded-full ${sizeClasses[size]}`}>
            <UserCheck className={iconSizes[size]} />
            <span>LATE BUT APPROVED</span>
        </span>
    );
};

/**
 * OverrideStatusIcon - Icon-only indicator
 */
export const OverrideStatusIcon = ({ status, size = 'md', showTooltip = true }) => {
    if (status !== 'LATE_BUT_APPROVED') {
        return null;
    }

    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6'
    };

    return (
        <div 
            className="inline-flex items-center justify-center"
            title={showTooltip ? 'Late but Clinically Approved' : undefined}
        >
            <UserCheck className={`text-emerald-600 ${sizeClasses[size]}`} />
        </div>
    );
};

/**
 * OverrideStatusList - List view for multiple authorizations
 */
export const OverrideStatusList = ({ authorizations = [], className = '' }) => {
    if (!authorizations || authorizations.length === 0) {
        return null;
    }

    return (
        <div className={`space-y-3 ${className}`}>
            <h4 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>Clinical Authorizations ({authorizations.length})</span>
            </h4>
            {authorizations.map((auth, index) => (
                <OverrideStatusIndicator
                    key={auth.id || index}
                    status="LATE_BUT_APPROVED"
                    authorizationDetails={auth}
                    showDetails={true}
                />
            ))}
        </div>
    );
};

export default OverrideStatusIndicator;
