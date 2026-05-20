import { CheckCircle, Clock, AlertTriangle, Calendar, User } from 'lucide-react';

/**
 * RecentActions - Recent clinical actions display
 * Shows last actions by the midwife for accountability awareness
 */

const RecentActions = ({ actions, loading }) => {
    // Use props instead of fetching internally
    const safeActions = actions || [];

    const getActionIcon = (action) => {
        switch (action) {
            case 'APPROVED':
                return <CheckCircle className="w-5 h-5 text-emerald-600" />;
            case 'OVERRIDE':
                return <AlertTriangle className="w-5 h-5 text-amber-600" />;
            case 'DEFERRED':
                return <Clock className="w-5 h-5 text-blue-600" />;
            default:
                return <CheckCircle className="w-5 h-5 text-slate-600" />;
        }
    };

    const getActionColor = (action) => {
        switch (action) {
            case 'APPROVED':
                return 'bg-emerald-100 text-emerald-700';
            case 'OVERRIDE':
                return 'bg-amber-100 text-amber-700';
            case 'DEFERRED':
                return 'bg-blue-100 text-blue-700';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    const formatTimestamp = (timestamp) => {
        const now = new Date();
        const actionTime = new Date(timestamp);
        const diff = now - actionTime;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        
        if (minutes < 60) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (hours < 24) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else {
            return actionTime.toLocaleDateString();
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-slate-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Recent Clinical Actions</h3>
                <span className="text-xs text-slate-500">Last 24 hours</span>
            </div>

            {safeActions.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                    <Clock className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p>No recent actions</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {safeActions.map((action) => (
                        <div key={action.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center space-x-3">
                                    <div className="flex-shrink-0">
                                        {getActionIcon(action.action)}
                                    </div>
                                    <div>
                                        <div className="flex items-center space-x-2 mb-1">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getActionColor(action.action)}`}>
                                                {action.action}
                                            </span>
                                            <span className="text-sm font-semibold text-slate-900">
                                                {action.infantName}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-600">
                                            Vaccine: <span className="font-medium">{action.vaccine}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {action.justification && (
                                <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-900">
                                    <span className="font-semibold">Justification:</span> {action.justification.substring(0, 50)}...
                                </div>
                            )}

                            {action.reason && (
                                <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-900">
                                    <span className="font-semibold">Reason:</span> {action.reason}
                                </div>
                            )}

                            <div className="flex items-center space-x-4 mt-3 text-xs text-slate-500">
                                <span className="flex items-center space-x-1">
                                    <User className="w-3 h-3" />
                                    <span>{action.midwife}</span>
                                </span>
                                <span className="flex items-center space-x-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>{formatTimestamp(action.timestamp)}</span>
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RecentActions;
