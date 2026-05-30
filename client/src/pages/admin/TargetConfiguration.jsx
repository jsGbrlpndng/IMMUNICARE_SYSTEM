import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, Target } from 'lucide-react';
import apiClient from '../../services/apiClient';

const currentYear = new Date().getFullYear();

const emptySummary = {
    barangays: 0,
    complete: 0,
    incomplete: 0,
    total_population: 0,
    eligible_population: 0,
    monthly_ep: 0
};

const toEditableRows = (rows = []) => (Array.isArray(rows) ? rows : []).filter(Boolean).map((row) => ({
    barangay_id: row?.barangay_id || '',
    barangay_name: row?.barangay_name || 'Unassigned Barangay',
    total_population: safeInteger(row?.total_population) > 0 ? String(safeInteger(row?.total_population)) : '',
    eligible_population: safeInteger(row?.eligible_population) > 0 ? String(safeInteger(row?.eligible_population)) : '',
    monthly_ep: safeInteger(row?.eligible_population) / 12,
    target_status: row?.target_status || 'MISSING_TARGET',
    updated_at: row?.updated_at || null
}));

const safeNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const safeInteger = (value) => {
    const parsed = parseInt(String(value ?? '0'), 10);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value, decimals = 0) => safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const TargetConfiguration = () => {
    const [year, setYear] = useState(currentYear);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [summary, setSummary] = useState(emptySummary);

    const yearOptions = useMemo(
        () => Array.from({ length: 8 }, (_, index) => currentYear + 1 - index),
        []
    );

    useEffect(() => {
        let isMounted = true;

        const loadTargets = async () => {
            setLoading(true);
            setError('');
            setSuccess('');

            try {
                const response = await apiClient.get(`/admin/m1-targets?year=${year}`);
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload?.success === false) {
                    throw new Error(payload?.error || 'Unable to load target configuration.');
                }

                if (isMounted) {
                    setRows(toEditableRows(payload?.targets || []));
                    setSummary({ ...emptySummary, ...(payload?.summary || {}) });
                    setDirty(false);
                }
            } catch (err) {
                console.error('[TARGET_CONFIGURATION_LOAD]', err);
                if (isMounted) {
                    setError(err.message || 'Unable to load target configuration.');
                    setRows([]);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadTargets();
        return () => {
            isMounted = false;
        };
    }, [year]);

    const normalizeInput = (value) => String(value ?? '').replace(/[^\d]/g, '').replace(/^0+/, '');

    const updatePopulation = (barangayId, value) => {
        const normalized = String(value ?? '').replace(/[^\d]/g, '').replace(/^0+/, '');
        setRows((previousRows) => previousRows.map((row) => {
            if (row?.barangay_id !== barangayId) return row;
            const total = safeInteger(normalized);
            const eligible = safeInteger(row?.eligible_population);
            return {
                ...row,
                total_population: normalized,
                monthly_ep: eligible / 12,
                target_status: total > 0 && eligible > 0 ? 'COMPLETE' : 'MISSING_TARGET'
            };
        }));
        setDirty(true);
        setError('');
        setSuccess('');
    };

    const updateEligiblePopulation = (barangayId, value) => {
        const normalized = normalizeInput(value);
        setRows((previousRows) => previousRows.map((row) => {
            if (row?.barangay_id !== barangayId) return row;
            const total = safeInteger(row?.total_population);
            const eligible = safeInteger(normalized);
            return {
                ...row,
                eligible_population: normalized,
                monthly_ep: eligible / 12,
                target_status: total > 0 && eligible > 0 ? 'COMPLETE' : 'MISSING_TARGET'
            };
        }));
        setDirty(true);
        setError('');
        setSuccess('');
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const response = await apiClient.put('/admin/m1-targets/bulk', {
                report_year: year,
                targets: (Array.isArray(rows) ? rows : []).map((row) => ({
                    barangay_id: row?.barangay_id || '',
                    total_population: safeInteger(row?.total_population),
                    eligible_population: safeInteger(row?.eligible_population)
                }))
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Unable to save targets.');
            }

            setRows(toEditableRows(payload?.targets || []));
            setSummary({ ...emptySummary, ...(payload?.summary || {}) });
            setDirty(false);
            setSuccess('Annual target populations saved. Reports will use the updated EP values immediately.');
        } catch (err) {
            console.error('[TARGET_CONFIGURATION_SAVE]', err);
            setError(err.message || 'Unable to save targets.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 items-center justify-center bg-[#064E3B] text-white">
                                <Target className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#064E3B]">
                                    Annual Target Setting
                                </p>
                                <h1 className="mt-1 text-3xl font-black text-slate-950">Target Configuration</h1>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    Enter the annual total population and eligible population for each barangay.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    Report Year
                                </label>
                                <select
                                    value={year}
                                    onChange={(event) => setYear(Number(event.target.value))}
                                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                >
                                    {yearOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || loading || !dirty}
                                className="inline-flex items-center gap-2 bg-[#064E3B] px-5 py-2.5 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-[#053B2D] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                            >
                                <Save className="h-4 w-4" />
                                {saving ? 'Saving' : 'Save Targets'}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {[
                        ['Barangays', summary?.barangays || 0],
                        ['RHU Total Population', summary?.total_population || 0],
                        ['RHU Eligible Population', summary?.eligible_population || 0],
                        ['RHU EP / Month', summary?.monthly_ep || 0]
                    ].map(([label, value]) => (
                        <div key={label} className="border border-slate-200 bg-white p-5 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</p>
                            <p className="mt-2 text-3xl font-black text-slate-950">{formatNumber(value, label.includes('Month') ? 1 : 0)}</p>
                        </div>
                    ))}
                </section>

                {error && (
                    <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                        {success}
                    </div>
                )}

                <section className="border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Annual Population Registry
                        </p>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">Loading target configuration...</div>
                    ) : (rows || []).length === 0 ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">No active barangays available.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-[#064E3B] text-white">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider">Barangay</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider">Total Population</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider">Eligible Population</th>
                                        <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-wider">EP / Month</th>
                                        <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {(rows || []).map((row) => (
                                        <tr key={row?.barangay_id || row?.barangay_name} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-black text-slate-950">{row?.barangay_name || 'Unassigned Barangay'}</td>
                                            <td className="px-4 py-3 text-right">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={row?.total_population || ''}
                                                    onChange={(event) => updatePopulation(row?.barangay_id, event.target.value)}
                                                    className="w-36 border border-slate-300 bg-white px-3 py-2 text-right text-sm font-bold text-slate-950 outline-none focus:border-[#064E3B]"
                                                    aria-label={`${row?.barangay_name || 'Barangay'} total population`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={row?.eligible_population || ''}
                                                    onChange={(event) => updateEligiblePopulation(row?.barangay_id, event.target.value)}
                                                    className="w-36 border border-slate-300 bg-white px-3 py-2 text-right text-sm font-bold text-slate-950 outline-none focus:border-[#064E3B]"
                                                    aria-label={`${row?.barangay_name || 'Barangay'} eligible population`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-slate-900">{formatNumber(row?.monthly_ep || 0, 1)}</td>
                                            <td className="px-4 py-3">
                                                {row?.target_status === 'COMPLETE' ? (
                                                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#064E3B]">
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        Complete
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-800">
                                                        <AlertTriangle className="h-3.5 w-3.5" />
                                                        Missing
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default TargetConfiguration;
