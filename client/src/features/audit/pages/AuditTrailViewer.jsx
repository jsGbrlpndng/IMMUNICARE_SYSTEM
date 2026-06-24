import React from 'react';
import { useState, useEffect } from 'react';
import { 
    FileText, 
    Search, 
    Filter, 
    Calendar, 
    User, 
    Shield, 
    Clock,
    ChevronDown,
    ChevronUp,
    Download,
    RefreshCw,
    AlertCircle,
    CheckCircle,
    XCircle,
    Lock
} from 'lucide-react';

/**
 * AuditTrailViewer - Displays authorization history and audit records
 * 
 * PURPOSE:
 * - Display authorization history chronologically
 * - Show complete audit metadata
 * - Support filtering and search
 * - Provide audit trail transparency
 * 
 * DESIGN PRINCIPLES:
 * - Complete audit transparency
 * - Chronological display with timestamps
 * - Filterable by date, midwife, override type
 * - Immutable record indication
 * - DOH compliance context
 */

const AuditTrailViewer = ({ 
    infantId = null,
    initialRecords = [],
    onRefresh = null,
    onExport = null,
    showFilters = true,
    className = ''
}) => {
    const [records, setRecords] = useState(initialRecords);
    const [filteredRecords, setFilteredRecords] = useState(initialRecords);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedRecords, setExpandedRecords] = useState(new Set());
    
    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('ALL');
    const [filterMidwife, setFilterMidwife] = useState('ALL');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    useEffect(() => {
        setRecords(initialRecords);
        setFilteredRecords(initialRecords);
    }, [initialRecords]);

    // Apply filters
    useEffect(() => {
        let filtered = [...records];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(record => 
                record.vaccine?.toLowerCase().includes(term) ||
                record.infantName?.toLowerCase().includes(term) ||
                record.clinicalJustification?.toLowerCase().includes(term) ||
                record.midwifeName?.toLowerCase().includes(term)
            );
        }

        // Type filter
        if (filterType !== 'ALL') {
            filtered = filtered.filter(record => record.actionType === filterType);
        }

        // Midwife filter
        if (filterMidwife !== 'ALL') {
            filtered = filtered.filter(record => record.midwifeId === filterMidwife);
        }

        // Date range filter
        if (dateRange.start) {
            filtered = filtered.filter(record => 
                new Date(record.timestamp) >= new Date(dateRange.start)
            );
        }
        if (dateRange.end) {
            filtered = filtered.filter(record => 
                new Date(record.timestamp) <= new Date(dateRange.end)
            );
        }

        setFilteredRecords(filtered);
    }, [searchTerm, filterType, filterMidwife, dateRange, records]);

    const toggleExpanded = (recordId) => {
        const newExpanded = new Set(expandedRecords);
        if (newExpanded.has(recordId)) {
            newExpanded.delete(recordId);
        } else {
            newExpanded.add(recordId);
        }
        setExpandedRecords(newExpanded);
    };

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setIsLoading(true);
        try {
            await onRefresh();
        } finally {
            setIsLoading(false);
        }
    };

    const getActionIcon = (actionType) => {
        switch (actionType) {
            case 'AUTHORIZATION_APPROVED':
                return <CheckCircle className="w-5 h-5 text-emerald-600" />;
            case 'AUTHORIZATION_REJECTED':
                return <XCircle className="w-5 h-5 text-red-600" />;
            case 'AUTHORIZATION_REQUEST':
                return <Clock className="w-5 h-5 text-blue-600" />;
            case 'COMPLIANCE_VIOLATION':
                return <Shield className="w-5 h-5 text-amber-600" />;
            default:
                return <FileText className="w-5 h-5 text-slate-600" />;
        }
    };

    const getActionColor = (actionType) => {
        switch (actionType) {
            case 'AUTHORIZATION_APPROVED':
                return 'bg-emerald-50 border-emerald-200';
            case 'AUTHORIZATION_REJECTED':
                return 'bg-red-50 border-red-200';
            case 'AUTHORIZATION_REQUEST':
                return 'bg-blue-50 border-blue-200';
            case 'COMPLIANCE_VIOLATION':
                return 'bg-amber-50 border-amber-200';
            default:
                return 'bg-slate-50 border-slate-200';
        }
    };

    const getActionLabel = (actionType) => {
        switch (actionType) {
            case 'AUTHORIZATION_APPROVED':
                return 'Approved';
            case 'AUTHORIZATION_REJECTED':
                return 'Rejected';
            case 'AUTHORIZATION_REQUEST':
                return 'Requested';
            case 'COMPLIANCE_VIOLATION':
                return 'Violation';
            default:
                return actionType;
        }
    };

    // Get unique midwives for filter
    const uniqueMidwives = [...new Set(records.map(r => r.midwifeId))].filter(Boolean);

    return (
        <div className={`bg-white rounded-xl border border-slate-200 ${className}`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200 rounded-t-xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-[#0061FF] rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">
                                Authorization Audit Trail
                            </h3>
                            <p className="text-sm text-slate-600">
                                {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''} found
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {onRefresh && (
                            <button
                                onClick={handleRefresh}
                                disabled={isLoading}
                                className="flex items-center space-x-2 px-3 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                                <span className="text-sm font-medium">Refresh</span>
                            </button>
                        )}
                        {onExport && (
                            <button
                                onClick={onExport}
                                className="flex items-center space-x-2 px-3 py-2 bg-[#0061FF] text-white rounded-lg hover:shadow-lg transition-all"
                            >
                                <Download className="w-4 h-4" />
                                <span className="text-sm font-medium">Export</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by infant, vaccine, midwife, or justification..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0061FF] focus:border-[#0061FF] outline-none text-sm"
                        />
                    </div>

                    {/* Filter Row */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Action Type
                            </label>
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0061FF] focus:border-[#0061FF] outline-none text-sm"
                            >
                                <option value="ALL">All Types</option>
                                <option value="AUTHORIZATION_APPROVED">Approved</option>
                                <option value="AUTHORIZATION_REJECTED">Rejected</option>
                                <option value="AUTHORIZATION_REQUEST">Requested</option>
                                <option value="COMPLIANCE_VIOLATION">Violations</option>
                            </select>
                        </div>

                        {uniqueMidwives.length > 0 && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">
                                    Midwife
                                </label>
                                <select
                                    value={filterMidwife}
                                    onChange={(e) => setFilterMidwife(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0061FF] focus:border-[#0061FF] outline-none text-sm"
                                >
                                    <option value="ALL">All Midwives</option>
                                    {uniqueMidwives.map(midwifeId => (
                                        <option key={midwifeId} value={midwifeId}>
                                            {records.find(r => r.midwifeId === midwifeId)?.midwifeName || midwifeId}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Date Range
                            </label>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0061FF] focus:border-[#0061FF] outline-none text-sm"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Records List */}
            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
                {filteredRecords.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 font-medium">No audit records found</p>
                        <p className="text-sm text-slate-500 mt-1">
                            {searchTerm || filterType !== 'ALL' || filterMidwife !== 'ALL' 
                                ? 'Try adjusting your filters' 
                                : 'Authorization activities will appear here'}
                        </p>
                    </div>
                ) : (
                    filteredRecords.map((record) => {
                        const isExpanded = expandedRecords.has(record.id);
                        
                        return (
                            <div key={record.id} className={`p-4 hover:bg-slate-50 transition-colors`}>
                                {/* Record Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start space-x-3 flex-1">
                                        <div className="flex-shrink-0 mt-1">
                                            {getActionIcon(record.actionType)}
                                        </div>
                                        
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${getActionColor(record.actionType)}`}>
                                                    {getActionLabel(record.actionType)}
                                                </span>
                                                {record.immutable && (
                                                    <span className="inline-flex items-center space-x-1 px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                                                        <Lock className="w-3 h-3" />
                                                        <span>Immutable</span>
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="text-sm">
                                                <p className="font-semibold text-slate-900">
                                                    {record.infantName} - {record.vaccine}
                                                </p>
                                                <p className="text-slate-600 mt-1">
                                                    <span className="font-medium">By:</span> {record.midwifeName || 'Unknown'}
                                                    <span className="mx-2">â€¢</span>
                                                    <span className="font-medium">When:</span> {new Date(record.timestamp).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => toggleExpanded(record.id)}
                                        className="flex-shrink-0 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="mt-4 ml-8 space-y-3">
                                        {/* Clinical Justification */}
                                        {record.clinicalJustification && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                                    Clinical Justification:
                                                </label>
                                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                    <p className="text-sm text-slate-700 leading-relaxed">
                                                        {record.clinicalJustification}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Compliance Status */}
                                        {record.complianceStatus && (
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                                    DOH Compliance Status:
                                                </label>
                                                <div className={`border rounded-lg p-3 ${
                                                    record.complianceStatus.compliant 
                                                        ? 'bg-emerald-50 border-emerald-200' 
                                                        : 'bg-red-50 border-red-200'
                                                }`}>
                                                    <p className="text-sm font-semibold">
                                                        {record.complianceStatus.compliant ? 'âœ“ Compliant' : 'âœ— Non-Compliant'}
                                                    </p>
                                                    {record.complianceStatus.violatedRules?.length > 0 && (
                                                        <ul className="list-disc list-inside text-xs mt-2 space-y-1">
                                                            {record.complianceStatus.violatedRules.map((rule, idx) => (
                                                                <li key={idx}>{rule}</li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Audit Metadata */}
                                        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3">
                                            <label className="block text-xs font-bold text-slate-700 mb-2">
                                                Audit Metadata:
                                            </label>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-slate-600">Audit ID:</span>
                                                    <p className="font-mono text-slate-900">{record.id}</p>
                                                </div>
                                                <div>
                                                    <span className="text-slate-600">Override Type:</span>
                                                    <p className="font-semibold text-slate-900">{record.overrideType}</p>
                                                </div>
                                                {record.sessionInfo && (
                                                    <>
                                                        <div>
                                                            <span className="text-slate-600">Session ID:</span>
                                                            <p className="font-mono text-slate-900">{record.sessionInfo.sessionId}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-600">IP Address:</span>
                                                            <p className="font-mono text-slate-900">{record.sessionInfo.ipAddress}</p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            {filteredRecords.length > 0 && (
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 rounded-b-xl">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                        <div className="flex items-center space-x-2">
                            <Lock className="w-3 h-3" />
                            <span>All records are immutable and permanently logged</span>
                        </div>
                        <span>Total: {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuditTrailViewer;
