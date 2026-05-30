import React from 'react';
import { useState, useEffect } from 'react';
import {
    Settings,
    Save,
    RefreshCcw,
    ShieldCheck,
    Bell,
    Globe,
    Database,
    CheckCircle2,
    AlertTriangle,
    Lock,
    Shield,
    X,
    Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';

const SystemSettings = () => {
    const { user } = useAuth();
    const [settings, setSettings] = useState({});
    const [originalSettings, setOriginalSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [pendingChanges, setPendingChanges] = useState([]);

    useEffect(() => {
        if (user) {
            fetchSettings();
        }
    }, [user]);

    const fetchSettings = async () => {
        if (!user) return;
        try {
            setLoading(true);
            const response = await apiClient.get('/admin/settings');
            const data = await response.json();
            
            if (response.ok && data.success) {
                // Convert flat array to key-value object
                const settingsObj = {};
                data.raw?.forEach(s => {
                    settingsObj[s.setting_key] = {
                        value: s.setting_value,
                        type: s.value_type,
                        category: s.category,
                        description: s.description,
                        min: s.min_value,
                        max: s.max_value
                    };
                });
                setSettings(settingsObj);
                setOriginalSettings(JSON.parse(JSON.stringify(settingsObj)));
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            showMessage('error', 'Failed to load system settings');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (key, newValue) => {
        setSettings(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                value: newValue
            }
        }));
    };

    const getChangedSettings = () => {
        const changes = [];
        Object.keys(settings).forEach(key => {
            if (settings[key].value !== originalSettings[key]?.value) {
                changes.push({
                    key,
                    before: originalSettings[key]?.value,
                    after: settings[key].value,
                    description: settings[key].description
                });
            }
        });
        return changes;
    };

    const handleSaveClick = () => {
        const changes = getChangedSettings();
        if (changes.length === 0) {
            showMessage('info', 'No changes to save');
            return;
        }

        // Check for critical changes
        const hasCriticalChanges = changes.some(c => 
            c.key === 'maintenance_mode' || 
            c.key === 'audit_retention_days' ||
            c.key === 'password_min_length'
        );

        if (hasCriticalChanges) {
            setPendingChanges(changes);
            setShowConfirmDialog(true);
        } else {
            performSave(changes);
        }
    };

    const performSave = async (changes) => {
        try {
            setSaving(true);
            setShowConfirmDialog(false);

            // Prepare update payload
            const updates = {};
            changes.forEach(change => {
                updates[change.key] = settings[change.key].value;
            });

            const response = await apiClient.put('/admin/settings', {
                settings: updates
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showMessage('success', `Successfully updated ${data.updated} setting(s)`);
                // Refresh to get latest values
                await fetchSettings();
            } else {
                showMessage('error', data.error || 'Failed to update settings');
                if (data.details) {
                    console.error('Validation errors:', data.details);
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            showMessage('error', 'Error updating settings');
        } finally {
            setSaving(false);
        }
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    };

    const renderInput = (key, setting) => {
        const value = setting.value;
        const type = setting.type;

        if (type === 'boolean') {
            return (
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => handleChange(key, value === 'true' ? 'false' : 'true')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                            value === 'true' ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            value === 'true' ? 'left-7' : 'left-1'
                        }`} />
                    </button>
                    <span className="text-xs font-semibold text-slate-600">
                        {value === 'true' ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            );
        }

        if (type === 'number') {
            return (
                <input
                    type="number"
                    value={value}
                    onChange={(e) => handleChange(key, e.target.value)}
                    min={setting.min}
                    max={setting.max}
                    className="w-32 px-4 py-2 bg-slate-50 border border-slate-200 rounded focus:border-slate-400 outline-none text-sm font-semibold"
                />
            );
        }

        return (
            <input
                type="text"
                value={value}
                onChange={(e) => handleChange(key, e.target.value)}
                className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded focus:border-slate-400 outline-none text-sm font-semibold"
            />
        );
    };

    const SettingRow = ({ settingKey, setting }) => {
        const isChanged = settings[settingKey]?.value !== originalSettings[settingKey]?.value;
        const isCritical = ['maintenance_mode', 'audit_retention_days', 'password_min_length'].includes(settingKey);

        return (
            <div className={`p-4 rounded-lg border transition-all ${
                isChanged ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
            }`}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                            <h4 className="text-sm font-bold text-slate-900">
                                {settingKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </h4>
                            {isCritical && (
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                            {isChanged && (
                                <span className="text-[10px] font-bold text-amber-600 uppercase">Modified</span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mb-3">{setting.description}</p>
                        {setting.min !== null && setting.max !== null && (
                            <p className="text-[10px] text-slate-400 font-mono">
                                Range: {setting.min} - {setting.max}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center">
                        {renderInput(settingKey, setting)}
                    </div>
                </div>
            </div>
        );
    };

    const SettingGroup = ({ title, icon: Icon, categoryKey, color }) => {
        const categorySettings = Object.entries(settings).filter(
            ([_, s]) => s.category === categoryKey
        );

        if (categorySettings.length === 0) return null;

        return (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className={`px-6 py-4 border-b border-slate-100 flex items-center space-x-3 ${color}`}>
                    <Icon className="w-5 h-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">{title}</h3>
                </div>
                <div className="p-6 space-y-3">
                    {categorySettings.map(([key, setting]) => (
                        <SettingRow key={key} settingKey={key} setting={setting} />
                    ))}
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCcw className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    const changes = getChangedSettings();
    const hasChanges = changes.length > 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white p-6 rounded-lg border border-slate-200">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
                    <p className="text-sm text-slate-500 mt-1 uppercase tracking-tighter font-medium">
                        Governed Configuration Authority
                    </p>
                </div>
                <div className="flex items-center space-x-3">
                    {hasChanges && (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                            {changes.length} Unsaved Change{changes.length > 1 ? 's' : ''}
                        </span>
                    )}
                    <button
                        onClick={handleSaveClick}
                        disabled={saving || !hasChanges}
                        className="flex items-center space-x-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span className="font-bold text-sm">Commit Changes</span>
                    </button>
                </div>
            </div>

            {/* Warning Banner */}
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold uppercase tracking-tight mb-1">Configuration Authority Notice</p>
                    <p>All changes are logged in system audit trails. Critical settings require confirmation. Invalid values will be rejected by backend validation. Changes take effect immediately.</p>
                </div>
            </div>

            {/* Settings Groups */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SettingGroup 
                    title="Security Controls" 
                    icon={Lock} 
                    categoryKey="security"
                    color="bg-red-50 text-red-700"
                />
                <SettingGroup 
                    title="Governance & Compliance" 
                    icon={Shield} 
                    categoryKey="governance"
                    color="bg-blue-50 text-blue-700"
                />
                <SettingGroup 
                    title="Notifications" 
                    icon={Bell} 
                    categoryKey="notifications"
                    color="bg-emerald-50 text-emerald-700"
                />
                <SettingGroup 
                    title="General System" 
                    icon={Globe} 
                    categoryKey="general"
                    color="bg-slate-50 text-slate-700"
                />
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border-2 border-slate-900">
                        <div className="bg-amber-500 p-4 flex items-center space-x-3 text-white">
                            <AlertTriangle className="w-6 h-6" />
                            <h3 className="text-lg font-black uppercase tracking-tight">Confirm Critical Changes</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-700 font-semibold">
                                You are about to modify {pendingChanges.length} system setting(s). This action will be permanently logged.
                            </p>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 max-h-64 overflow-auto">
                                {pendingChanges.map((change, idx) => (
                                    <div key={idx} className="text-xs font-mono">
                                        <div className="font-bold text-slate-900">{change.key}</div>
                                        <div className="text-slate-500">
                                            <span className="text-red-600">{change.before}</span>
                                            {' â†’ '}
                                            <span className="text-emerald-600">{change.after}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-slate-600 bg-blue-50 p-3 rounded border border-blue-100">
                                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>Changes will be audited and attributed to: <strong>{user?.id}</strong></span>
                            </div>
                        </div>
                        <div className="p-6 pt-0 flex space-x-3">
                            <button
                                onClick={() => setShowConfirmDialog(false)}
                                className="flex-1 px-4 py-3 text-slate-600 font-bold text-sm hover:bg-slate-50 rounded transition-colors uppercase tracking-widest border border-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => performSave(pendingChanges)}
                                className="flex-1 px-4 py-3 bg-slate-900 text-white font-bold text-sm rounded hover:bg-black transition-colors uppercase tracking-widest"
                            >
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Toast */}
            {message.text && (
                <div className={`fixed bottom-6 right-6 px-6 py-3 rounded shadow-2xl flex items-center space-x-3 animate-in slide-in-from-bottom-4 border-l-4 ${
                    message.type === 'success' ? 'bg-emerald-900 text-white border-emerald-400' :
                    message.type === 'error' ? 'bg-red-900 text-white border-red-400' :
                    'bg-blue-900 text-white border-blue-400'
                }`}>
                    {message.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
                    {message.type === 'error' && <X className="w-4 h-4" />}
                    {message.type === 'info' && <Info className="w-4 h-4" />}
                    <span className="text-xs font-bold uppercase tracking-tight">{message.text}</span>
                </div>
            )}
        </div>
    );
};

export default SystemSettings;
