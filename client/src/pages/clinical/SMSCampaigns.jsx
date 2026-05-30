import React from 'react';
import { useState, useEffect } from 'react';
import {
    MessageSquare,
    Send,
    Users,
    Clock,
    CheckCircle2,
    AlertCircle,
    Plus,
    Search,
    Filter,
    Calendar,
    Phone
} from 'lucide-react';

const SMSCampaigns = () => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // TODO: Replace with actual API call when SMS backend is implemented
        // For now, start with empty state since no real campaigns exist
        setLoading(false);
    }, []);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">SMS Campaigns</h1>
                    <p className="text-slate-500 mt-1">Manage vaccination reminders and follow-up messages</p>
                </div>
                <button className="bg-[#0061FF] text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2">
                    <Plus className="w-4 h-4" />
                    <span>New Campaign</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-6 h-6 text-[#0061FF]" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Sent</p>
                        <p className="text-3xl font-extrabold text-[#0061FF]">â€”</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                            <Clock className="w-6 h-6 text-amber-500" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending</p>
                        <p className="text-3xl font-extrabold text-amber-500">â€”</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Delivered</p>
                        <p className="text-3xl font-extrabold text-emerald-600">â€”</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-red-500" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed</p>
                        <p className="text-3xl font-extrabold text-red-500">â€”</p>
                    </div>
                </div>
            </div>

            {/* Campaigns List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-slate-900">Active Campaigns</h3>
                        <div className="flex items-center space-x-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search campaigns..."
                                    className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#0061FF] focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
                                />
                            </div>
                            <button className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                <Filter className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-[#0061FF] rounded-full animate-spin"></div>
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <MessageSquare className="w-7 h-7 text-slate-300" />
                            </div>
                            <p className="text-sm font-bold text-slate-700">No active campaigns</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-xs text-center">
                                Create a new campaign to send vaccination reminders and follow-up messages.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {campaigns.map((campaign) => (
                                <div key={campaign.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center space-x-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${campaign.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                            }`}>
                                            <MessageSquare className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-900">{campaign.name}</h4>
                                            <div className="flex items-center space-x-4 text-sm text-slate-500 mt-1">
                                                <span>Sent: {campaign.sent}</span>
                                                <span>Pending: {campaign.pending}</span>
                                                {campaign.lastSent && (
                                                    <span>Last: {new Date(campaign.lastSent).toLocaleDateString()}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${campaign.status === 'active'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-amber-100 text-amber-700'
                                            }`}>
                                            {campaign.status}
                                        </span>
                                        <button className="text-[#0061FF] hover:text-blue-700 font-medium text-sm">
                                            Manage
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SMSCampaigns;