import React from 'react';
import { useState, useEffect } from 'react';
import {
    Shield,
    History,
    Plus,
    Scale,
    Calendar,
    ChevronRight,
    AlertTriangle,
    CheckCircle2,
    Clock,
    User,
    Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';

const DOHRules = () => {
    const { user } = useAuth();
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNewVersionModal, setShowNewVersionModal] = useState(false);
    const [selectedRule, setSelectedRule] = useState(null);
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Form for new version
    const [formData, setFormData] = useState({
        vaccine_code: '',
        rule_name: '',
        description: '',
        min_age_days: '',
        max_age_days: '',
        min_interval_days: '',
        allowed_early_days: 0,
        justification_required: false,
        effective_date: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (user) {
            fetchRules();
        }
    }, [user]);

    const fetchRules = async () => {
        try {
            setLoading(true);
            const response = await apiClient.get('/rules/admin/view');
            const data = await response.json();
            if (response.ok) setRules(data);
        } catch (error) {
            console.error('Error fetching rules:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (vaccineCode) => {
        try {
            setLoadingHistory(true);
            const response = await apiClient.get(`/rules/history/${vaccineCode}`);
            const data = await response.json();
            if (response.ok) {
                setHistory(data.history);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSelectRule = (rule) => {
        setSelectedRule(rule);
        fetchHistory(rule.vaccine_code);
    };

    const openVersionWizard = (baseRule) => {
        setFormData({
            ...baseRule,
            effective_date: new Date().toISOString().split('T')[0],
            justification_required: !!baseRule.justification_required
        });
        setShowNewVersionModal(true);
    };

    const submitNewVersion = async (e) => {
        e.preventDefault();
        try {
            const response = await apiClient.post('/rules', formData);

            if (response.ok) {
                setShowNewVersionModal(false);
                fetchRules();
                if (selectedRule?.vaccine_code === formData.vaccine_code) {
                    fetchHistory(formData.vaccine_code);
                }
            } else {
                const err = await response.json();
                alert(err.error || 'Failed to issue new protocol');
            }
        } catch (error) {
            alert('Governance connection failure');
        }
    };

    const getStatusStyle = (rule) => {
        const today = new Date().toISOString().split('T')[0];
        if (rule.expiry_date && rule.expiry_date < today) return 'bg-slate-100 text-slate-500 border-slate-200';
        if (rule.effective_date > today) return 'bg-amber-50 text-amber-700 border-amber-200';
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    };

    const getStatusLabel = (rule) => {
        const today = new Date().toISOString().split('T')[0];
        if (rule.expiry_date && rule.expiry_date < today) return 'Historical';
        if (rule.effective_date > today) return 'Upcoming';
        return 'Active';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <header className="bg-slate-900 text-white p-8 rounded-xl shadow-2xl border-b-4 border-emerald-500">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="bg-emerald-500 p-3 rounded-lg">
                            <Shield className="w-8 h-8 text-slate-900" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight uppercase">National Immunization Registry</h1>
                            <p className="text-emerald-400 text-sm font-bold tracking-widest uppercase">Central Policy Authority & Governance Control</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Protocol Registry (Main List) */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-slate-50 border-b-2 border-slate-200 flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center">
                                <Scale className="w-4 h-4 mr-2 text-emerald-600" />
                                Current Governing Protocols
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Read-Only View</span>
                        </div>

                        <div className="divide-y-2 divide-slate-100">
                            {loading ? (
                                <div className="p-16 text-center text-slate-400 italic font-medium">Synchronizing with Regulatory Server...</div>
                            ) : rules.length === 0 ? (
                                <div className="p-16 text-center text-slate-400 italic font-medium">No governance data found.</div>
                            ) : (
                                rules.map((rule) => {
                                    const status = getStatusLabel(rule);
                                    if (status !== 'Active' && status !== 'Upcoming') return null;
                                    return (
                                        <div
                                            key={rule.rule_id}
                                            className={`p-6 hover:bg-slate-50 transition-all cursor-pointer group ${selectedRule?.rule_id === rule.rule_id ? 'bg-emerald-50/30' : ''}`}
                                            onClick={() => handleSelectRule(rule)}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex space-x-4">
                                                    <div className="w-12 h-12 bg-slate-900 rounded flex items-center justify-center text-white font-black text-xl shadow-lg ring-2 ring-emerald-500/20">
                                                        {rule.vaccine_code[0]}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-black text-slate-900 tracking-tight">{rule.rule_name}</h3>
                                                        <div className="flex items-center space-x-2 mt-1">
                                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-black tracking-widest lowercase border border-slate-200">
                                                                {rule.vaccine_code}
                                                            </span>
                                                            <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-widest border ${getStatusStyle(rule)}`}>
                                                                {status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Effective On</p>
                                                    <p className="text-sm font-mono font-bold text-slate-900">{new Date(rule.effective_date).toLocaleDateString()}</p>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openVersionWizard(rule); }}
                                                        className="mt-2 text-[10px] font-black text-emerald-600 uppercase border-b-2 border-emerald-500/0 hover:border-emerald-500 transition-all"
                                                    >
                                                        Issue New Version
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="bg-amber-50 border-2 border-amber-100 p-4 rounded-lg flex items-start space-x-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-800 leading-relaxed font-bold uppercase tracking-tight">
                            NOTICE TO ADMINISTRATORS: Protocol modifications are permanent. Future effective dates are required to allow frontline systems to stage data. Retroactive editing is strictly prohibited by security policy.
                        </p>
                    </div>
                </div>

                {/* Accountability Timeline */}
                <div className="space-y-6">
                    <div className="bg-white border-2 border-slate-200 rounded-xl shadow-sm h-full">
                        <div className="px-6 py-4 bg-slate-50 border-b-2 border-slate-200 flex items-center justify-between">
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Integrity Trace</h2>
                            <History className="w-4 h-4 text-slate-400" />
                        </div>

                        <div className="p-6">
                            {selectedRule ? (
                                <div className="space-y-8">
                                    <div className="pb-4 border-b-2 border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vaccine Context</p>
                                        <h4 className="font-black text-slate-900 tracking-tight">{selectedRule.vaccine_code} Policy Chain</h4>
                                    </div>

                                    {loadingHistory ? (
                                        <div className="p-8 text-center text-slate-300 italic">Tracing history...</div>
                                    ) : (
                                        <div className="space-y-6">
                                            {history.map((h, i) => (
                                                <div key={h.rule_id} className="relative pl-8 border-l-4 border-slate-100 pb-2 last:pb-0">
                                                    <div className={`absolute left-[-10px] top-0 w-4 h-4 rounded-full border-4 bg-white ${i === 0 ? 'border-emerald-500' : 'border-slate-300'}`} />
                                                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 group hover:border-emerald-300 transition-all">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${getStatusStyle(h)}`}>
                                                                {getStatusLabel(h)}
                                                            </span>
                                                            <span className="text-[9px] font-mono text-slate-400">{h.rule_id.substring(0, 8)}</span>
                                                        </div>
                                                        <p className="text-xs font-black text-slate-900 italic tracking-tight mb-2">"{h.rule_name}"</p>

                                                        <div className="grid grid-cols-2 gap-4 mt-3">
                                                            <div>
                                                                <p className="text-[9px] font-black text-slate-400 uppercase">Effective</p>
                                                                <p className="text-[10px] font-bold font-mono text-slate-900">{new Date(h.effective_date).toLocaleDateString()}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-black text-slate-400 uppercase">Expired</p>
                                                                <p className="text-[10px] font-bold font-mono text-slate-900">
                                                                    {h.expiry_date ? new Date(h.expiry_date).toLocaleDateString() : 'Active'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 pt-3 border-t border-slate-200 flex items-center space-x-2 text-slate-500">
                                                            <User className="w-3 h-3" />
                                                            <span className="text-[9px] font-bold uppercase tracking-widest">{h.created_by}</span>
                                                            <span className="text-[9px] text-slate-300">â€¢</span>
                                                            <Clock className="w-3 h-3" />
                                                            <span className="text-[9px] font-bold uppercase tracking-widest">{new Date(h.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-20 px-6">
                                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-200">
                                        <Info className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">Chain of Custody</p>
                                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">Select a governing protocol on the left to reconstruct its regulatory history.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Version Wizard Modal */}
            {showNewVersionModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border-4 border-slate-900 overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
                        <div className="bg-slate-900 p-6 flex items-center justify-between text-white">
                            <div className="flex items-center space-x-3">
                                <Plus className="w-6 h-6 text-emerald-400" />
                                <h3 className="text-xl font-black uppercase tracking-tight">Issue New Policy Version</h3>
                            </div>
                            <button onClick={() => setShowNewVersionModal(false)} className="text-slate-400 hover:text-white transition-colors">âœ•</button>
                        </div>

                        <form onSubmit={submitNewVersion} className="p-8">
                            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg mb-6 flex items-start space-x-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                                <div className="text-[11px] text-emerald-900 leading-relaxed uppercase font-bold tracking-tight">
                                    SYSTEM GUARANTEE: This action will stage a new version of the <strong>{formData.vaccine_code}</strong> protocol. The current version will automatically receive an expiry date set for 24 hours prior to the new start date.
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocol Name</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-lg font-bold text-slate-900 focus:border-emerald-500 outline-none transition-all"
                                        value={formData.rule_name}
                                        onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-emerald-600">NEW Effective Date</label>
                                    <input
                                        type="date"
                                        className="w-full bg-emerald-50/50 border-2 border-emerald-500 p-3 rounded-lg font-black text-emerald-900 outline-none"
                                        value={formData.effective_date}
                                        onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                                        required
                                        min={new Date().toISOString().split('T')[0]}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Age (Days)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-lg font-bold text-slate-900 outline-none"
                                        value={formData.min_age_days}
                                        onChange={(e) => setFormData({ ...formData, min_age_days: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Age (Days - Nullable)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-lg font-bold text-slate-900 outline-none"
                                        value={formData.max_age_days || ''}
                                        onChange={(e) => setFormData({ ...formData, max_age_days: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Interval (Days)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-lg font-bold text-slate-900 outline-none"
                                        value={formData.min_interval_days || ''}
                                        onChange={(e) => setFormData({ ...formData, min_interval_days: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grace Period (Days Early)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-lg font-bold text-slate-900 outline-none"
                                        value={formData.allowed_early_days}
                                        onChange={(e) => setFormData({ ...formData, allowed_early_days: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-between pt-6 border-t-2 border-slate-100">
                                <label className="flex items-center space-x-3 cursor-pointer group">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formData.justification_required}
                                            onChange={(e) => setFormData({ ...formData, justification_required: e.target.checked })}
                                        />
                                        <div className={`w-12 h-6 rounded-full transition-colors ${formData.justification_required ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                                        <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.justification_required ? 'translate-x-6' : ''}`}></div>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Enforce Justification</span>
                                </label>

                                <div className="flex space-x-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewVersionModal(false)}
                                        className="px-6 py-3 rounded-lg text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-slate-900 text-white px-8 py-3 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center"
                                    >
                                        Validate & Issue Protocol
                                        <Plus className="w-4 h-4 ml-2" />
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DOHRules;

