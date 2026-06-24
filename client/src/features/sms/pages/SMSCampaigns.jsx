import React from 'react';
import { useState, useEffect } from 'react';
import {
    MessageSquare,
    Clock,
    CheckCircle2,
    AlertCircle,
    Plus,
    Search,
    Filter
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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-6 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Clinical Messaging</p>
                    <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">SMS Campaigns</h1>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Vaccination reminder messaging console. Backend delivery is pending integration.</p>
                </div>
                <button
                    type="button"
                    disabled
                    title="SMS backend integration is pending."
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" />
                    <span>Pending Backend Integration</span>
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50">
                            <MessageSquare className="h-5 w-5 text-emerald-800" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Sent</p>
                        <p className="text-3xl font-black text-emerald-800">0</p>
                    </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-amber-100 bg-amber-50">
                            <Clock className="h-5 w-5 text-amber-600" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending</p>
                        <p className="text-3xl font-black text-amber-600">0</p>
                    </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50">
                            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Delivered</p>
                        <p className="text-3xl font-black text-emerald-700">0</p>
                    </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-rose-100 bg-rose-50">
                            <AlertCircle className="h-5 w-5 text-rose-600" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Failed</p>
                        <p className="text-3xl font-black text-rose-600">0</p>
                    </div>
                </div>
            </div>

            {/* Campaigns List */}
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Active Campaigns</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Campaign management will activate once SMS delivery services are connected.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search campaigns..."
                                    disabled
                                    className="rounded-md border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm font-semibold text-slate-400 outline-none disabled:cursor-not-allowed"
                                />
                            </div>
                            <button
                                type="button"
                                disabled
                                className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-300 disabled:cursor-not-allowed"
                            >
                                <Filter className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-32">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-800"></div>
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-6 py-16 text-center">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-md border border-slate-200 bg-white">
                                <MessageSquare className="h-7 w-7 text-emerald-800" />
                            </div>
                            <p className="text-sm font-black uppercase tracking-wider text-slate-800">No Active Campaigns</p>
                            <p className="mt-2 max-w-md text-xs font-semibold leading-5 text-slate-500">
                                SMS campaign creation is intentionally disabled until backend delivery, provider status, and audit logging are fully connected.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {campaigns.map((campaign) => (
                                <div key={campaign.id} className="flex items-center justify-between rounded-md border border-slate-100 p-4 transition-colors hover:bg-slate-50">
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
                                        <button className="text-sm font-bold text-emerald-800 hover:text-emerald-900">
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
