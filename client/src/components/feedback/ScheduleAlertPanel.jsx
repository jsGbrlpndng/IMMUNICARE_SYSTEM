import React from 'react';
import { AlertTriangle, Clock, Shield, AlertCircle, Lock } from 'lucide-react';

/**
 * ScheduleAlertPanel - Displays system-flagged vaccination issues requiring authorization
 * 
 * PURPOSE:
 * - Shows vaccination alerts that need clinical authorization
 * - Presents authorization options instead of date editing controls
 * - Integrates with existing NIP Schedule interface
 * 
 * DESIGN PRINCIPLES:
 * - No date editing controls (read-only schedule display)
 * - Clear authorization workflow
 * - DOH compliance warnings visible
 * - ImmuniCare branding (#0061FF blue)
 */

const ScheduleAlertPanel = ({ alerts = [], onAuthorizationRequest, className = '' }) => {
    if (!alerts || alerts.length === 0) {
        return null;
    }

    const getAlertIcon = (alertType) => {
        switch (alertType) {
            case 'OVERDUE':
                return <AlertTriangle className="w-5 h-5 text-red-600" />;
            case 'OUT_OF_WINDOW':
                return <Clock className="w-5 h-5 text-amber-600" />;
            case 'BLOCKED_DOSE':
                return <Shield className="w-5 h-5 text-orange-600" />;
            default:
                return <AlertCircle className="w-5 h-5 text-slate-600" />;
        }
    };

    const getAlertColor = (alertType) => {
        switch (alertType) {
            case 'OVERDUE':
                return 'bg-red-50 border-red-200';
            case 'OUT_OF_WINDOW':
                return 'bg-amber-50 border-amber-200';
            case 'BLOCKED_DOSE':
                return 'bg-orange-50 border-orange-200';
            default:
                return 'bg-slate-50 border-slate-200';
        }
    };

    const getAlertTitle = (alertType) => {
        switch (alertType) {
            case 'OVERDUE':
                return 'Overdue Vaccination';
            case 'OUT_OF_WINDOW':
                return 'Out of Recommended Window';
            case 'BLOCKED_DOSE':
                return 'Dose Administration Blocked';
            default:
                return 'Schedule Alert';
        }
    };

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Panel Header */}
            <div className="flex items-center space-x-2 mb-4">
                <AlertCircle className="w-5 h-5 text-[#0061FF]" />
                <h3 className="text-lg font-bold text-slate-900">
                    Schedule Alerts Requiring Authorization
                </h3>
                <span className="px-2 py-1 bg-[#0061FF] text-white text-xs font-bold rounded-full">
                    {alerts.length}
                </span>
            </div>

            {/* Alert Cards */}
            {alerts.map((alert, index) => (
                <div
                    key={alert.id || index}
                    className={`border rounded-xl p-4 ${getAlertColor(alert.type)}`}
                >
                    <div className="flex items-start justify-between">
                        {/* Alert Content */}
                        <div className="flex items-start space-x-3 flex-1">
                            <div className="flex-shrink-0 mt-0.5">
                                {getAlertIcon(alert.type)}
                            </div>
                            
                            <div className="flex-1 space-y-2">
                                {/* Alert Header */}
                                <div>
                                    <h4 className="font-bold text-slate-900 mb-1">
                                        {getAlertTitle(alert.type)}
                                    </h4>
                                    <p className="text-sm text-slate-700 font-medium">
                                        {alert.infantName} - {alert.vaccine}
                                    </p>
                                </div>

                                {/* Alert Details */}
                                <div className="text-sm text-slate-600 space-y-1">
                                    <p>
                                        <span className="font-semibold">System Decision:</span>{' '}
                                        {alert.systemDecision}
                                    </p>
                                    <p>
                                        <span className="font-semibold">Calculated Date:</span>{' '}
                                        <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-300">
                                            {alert.calculatedDate ? new Date(alert.calculatedDate).toLocaleDateString() : 'N/A'}
                                        </span>
                                        <span className="ml-2 text-xs text-slate-500">(Read-only)</span>
                                    </p>
                                    {alert.daysOverdue && (
                                        <p className="text-red-600 font-semibold">
                                            {alert.daysOverdue} days overdue
                                        </p>
                                    )}
                                    {alert.clinicalContext && (
                                        <p className="text-slate-700 mt-2">
                                            <span className="font-semibold">Clinical Context:</span>{' '}
                                            {alert.clinicalContext}
                                        </p>
                                    )}
                                </div>

                                {/* DOH Compliance Status */}
                                {alert.complianceWarnings && alert.complianceWarnings.length > 0 && (
                                    <div className="bg-white border border-amber-300 rounded-lg p-3 mt-2">
                                        <div className="flex items-start space-x-2">
                                            <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                            <div className="text-xs text-amber-900">
                                                <p className="font-bold mb-1">DOH Compliance Warnings:</p>
                                                <ul className="list-disc list-inside space-y-0.5">
                                                    {alert.complianceWarnings.map((warning, idx) => (
                                                        <li key={idx}>{warning}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Authorization Action */}
                        <div className="flex-shrink-0 ml-4">
                            {alert.canAuthorize ? (
                                <button
                                    onClick={() => onAuthorizationRequest(alert)}
                                    className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-[#0061FF] to-blue-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
                                    title="Request Clinical Authorization"
                                >
                                    <Lock className="w-4 h-4" />
                                    <span>Authorize</span>
                                </button>
                            ) : (
                                <div className="px-4 py-2.5 bg-slate-200 text-slate-600 font-semibold rounded-lg cursor-not-allowed">
                                    <span className="text-sm">Cannot Authorize</span>
                                    {alert.blockReason && (
                                        <p className="text-xs mt-1">{alert.blockReason}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Information Footer */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-900">
                        <p className="font-semibold mb-1">Authorization Process</p>
                        <p>
                            Clinical authorization allows you to approve vaccination administration outside normal system windows.
                            All calculated dates remain unchanged. Authorization requires clinical justification and is permanently logged.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleAlertPanel;
