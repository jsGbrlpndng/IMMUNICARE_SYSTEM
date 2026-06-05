import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Save, Target } from 'lucide-react';
import apiClient from '../../services/apiClient';

const currentYear = new Date().getFullYear();

const emptySummary = {
    barangays: 0,
    complete: 0,
    incomplete: 0,
    total_population: 0,
    eligible_population: 0,
    eligible_population_0_11_months: 0,
    eligible_population_0_12_months: 0,
    monthly_target: 0
};

const safeNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const safeInteger = (value) => {
    const parsed = parseInt(String(value ?? '0'), 10);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeIntegerInput = (value) => String(value ?? '').replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');

const normalizeDecimalInput = (value) => {
    const cleaned = String(value ?? '').replace(/[^\d.]/g, '');
    const [whole, ...rest] = cleaned.split('.');
    return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

const calculateMonthlyTarget = (ep011) => Number((safeInteger(ep011) / 12).toFixed(2));

const formatNumber = (value, decimals = 0) => safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const toEditableRows = (rows = []) => (Array.isArray(rows) ? rows : []).filter(Boolean).map((row) => {
    const ep011 = safeInteger(row?.eligible_population_0_11_months ?? row?.eligible_population);
    const calculatedMonthly = safeNumber(row?.calculated_monthly_target || calculateMonthlyTarget(ep011));
    const storedMonthly = safeNumber(row?.monthly_target || row?.monthly_ep || calculatedMonthly);
    const isManual = row?.monthly_target_is_manual === true && Number(storedMonthly.toFixed(2)) !== Number(calculatedMonthly.toFixed(2));

    return {
        barangay_id: row?.barangay_id || '',
        barangay_name: row?.barangay_name || 'Unassigned Barangay',
        total_population: safeInteger(row?.total_population) > 0 ? String(safeInteger(row?.total_population)) : '',
        eligible_population_0_11_months: ep011 > 0 ? String(ep011) : '',
        eligible_population_0_12_months: safeInteger(row?.eligible_population_0_12_months) > 0 ? String(safeInteger(row?.eligible_population_0_12_months)) : '',
        monthly_target: storedMonthly > 0 ? String(Number(storedMonthly.toFixed(2))) : '',
        calculated_monthly_target: calculatedMonthly,
        monthly_target_is_manual: isManual,
        target_status: row?.target_status || 'MISSING_TARGET',
        updated_at: row?.updated_at || null
    };
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

    const updateRow = (barangayId, updater) => {
        setRows((previousRows) => previousRows.map((row) => {
            if (row?.barangay_id !== barangayId) return row;
            const updated = updater(row);
            const complete = safeInteger(updated.total_population) > 0
                && safeInteger(updated.eligible_population_0_11_months) > 0
                && safeInteger(updated.eligible_population_0_12_months) > 0
                && safeNumber(updated.monthly_target) > 0;
            return {
                ...updated,
                target_status: complete ? 'COMPLETE' : 'MISSING_TARGET'
            };
        }));
        setDirty(true);
        setError('');
        setSuccess('');
    };

    const updatePopulation = (barangayId, value) => {
        const normalized = normalizeIntegerInput(value);
        updateRow(barangayId, (row) => ({ ...row, total_population: normalized }));
    };

    const updateEp011 = (barangayId, value) => {
        const normalized = normalizeIntegerInput(value);
        updateRow(barangayId, (row) => {
            const calculated = calculateMonthlyTarget(normalized);
            return {
                ...row,
                eligible_population_0_11_months: normalized,
                calculated_monthly_target: calculated,
                monthly_target: row.monthly_target_is_manual ? row.monthly_target : String(calculated)
            };
        });
    };

    const updateEp012 = (barangayId, value) => {
        const normalized = normalizeIntegerInput(value);
        updateRow(barangayId, (row) => ({ ...row, eligible_population_0_12_months: normalized }));
    };

    const updateMonthlyTarget = (barangayId, value) => {
        const normalized = normalizeDecimalInput(value);
        updateRow(barangayId, (row) => {
            const calculated = calculateMonthlyTarget(row.eligible_population_0_11_months);
            const entered = safeNumber(normalized);
            return {
                ...row,
                monthly_target: normalized,
                calculated_monthly_target: calculated,
                monthly_target_is_manual: normalized !== '' && Number(entered.toFixed(2)) !== Number(calculated.toFixed(2))
            };
        });
    };

    const resetMonthlyTarget = (barangayId) => {
        updateRow(barangayId, (row) => {
            const calculated = calculateMonthlyTarget(row.eligible_population_0_11_months);
            return {
                ...row,
                monthly_target: String(calculated),
                calculated_monthly_target: calculated,
                monthly_target_is_manual: false
            };
        });
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
                    eligible_population_0_11_months: safeInteger(row?.eligible_population_0_11_months),
                    eligible_population_0_12_months: safeInteger(row?.eligible_population_0_12_months),
                    monthly_target: Number(safeNumber(row?.monthly_target).toFixed(2)),
                    monthly_target_is_manual: row?.monthly_target_is_manual === true
                }))
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Unable to save targets.');
            }

            setRows(toEditableRows(payload?.targets || []));
            setSummary({ ...emptySummary, ...(payload?.summary || {}) });
            setDirty(false);
            setSuccess('Annual barangay target matrix saved. Monitoring reports will use the stored denominators immediately.');
        } catch (err) {
            console.error('[TARGET_CONFIGURATION_SAVE]', err);
            setError(err.message || 'Unable to save targets.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-5">
                <section className="border border-slate-300 bg-white p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 items-center justify-center bg-[#064E3B] text-white">
                                <Target className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">
                                    Super Admin Configuration
                                </p>
                                <h1 className="mt-1 text-2xl font-black text-slate-950">Barangay Target Matrix</h1>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    Configure annual denominators for RHU 2 FHSIS monitoring.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Report Year</span>
                                <select
                                    value={year}
                                    onChange={(event) => setYear(Number(event.target.value))}
                                    className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                >
                                    {yearOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || loading || !dirty}
                                className="inline-flex h-10 items-center gap-2 bg-[#064E3B] px-5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-[#053B2D] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                            >
                                <Save className="h-4 w-4" />
                                {saving ? 'Saving' : 'Save Matrix'}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {[
                        ['Barangays', summary?.barangays || rows.length || 0, 0],
                        ['Total Population', summary?.total_population || 0, 0],
                        ['EP 0-11 Months', summary?.eligible_population_0_11_months || summary?.eligible_population || 0, 0],
                        ['Monthly Target', summary?.monthly_target || summary?.monthly_ep || 0, 2]
                    ].map(([label, value, decimals]) => (
                        <div key={label} className="border border-slate-300 bg-white px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{formatNumber(value, decimals)}</p>
                        </div>
                    ))}
                </section>

                {error ? (
                    <div className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
                        {error}
                    </div>
                ) : null}
                {success ? (
                    <div className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                        {success}
                    </div>
                ) : null}

                <section className="border border-slate-300 bg-white">
                    <div className="border-b border-slate-300 px-5 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">
                            Annual Population Registry
                        </p>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">Loading target configuration...</div>
                    ) : (rows || []).length === 0 ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">No active barangays available.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-[1120px] w-full border-collapse text-sm">
                                <thead className="bg-[#064E3B] text-white">
                                    <tr>
                                        <th className="border-r border-emerald-800 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Barangay</th>
                                        <th className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">Total Population</th>
                                        <th className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">EP 0-11 Months</th>
                                        <th className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">EP 0-12 Months</th>
                                        <th className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">Monthly Target</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Action / Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(rows || []).map((row, index) => {
                                        const overridden = row?.monthly_target_is_manual === true;
                                        return (
                                            <tr key={row?.barangay_id || row?.barangay_name} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                                                <td className="border-b border-r border-slate-300 px-3 py-2 text-xs font-black uppercase text-slate-950">
                                                    {row?.barangay_name || 'Unassigned Barangay'}
                                                </td>
                                                <td className="border-b border-r border-slate-300 px-3 py-1.5 text-right">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={row?.total_population || ''}
                                                        onChange={(event) => updatePopulation(row?.barangay_id, event.target.value)}
                                                        className="h-8 w-32 border border-slate-300 bg-white px-2 text-right text-xs font-bold tabular-nums text-slate-950 outline-none focus:border-[#064E3B]"
                                                        aria-label={`${row?.barangay_name || 'Barangay'} total population`}
                                                    />
                                                </td>
                                                <td className="border-b border-r border-slate-300 px-3 py-1.5 text-right">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={row?.eligible_population_0_11_months || ''}
                                                        onChange={(event) => updateEp011(row?.barangay_id, event.target.value)}
                                                        className="h-8 w-32 border border-slate-300 bg-white px-2 text-right text-xs font-bold tabular-nums text-slate-950 outline-none focus:border-[#064E3B]"
                                                        aria-label={`${row?.barangay_name || 'Barangay'} eligible population 0 to 11 months`}
                                                    />
                                                </td>
                                                <td className="border-b border-r border-slate-300 px-3 py-1.5 text-right">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={row?.eligible_population_0_12_months || ''}
                                                        onChange={(event) => updateEp012(row?.barangay_id, event.target.value)}
                                                        className="h-8 w-32 border border-slate-300 bg-white px-2 text-right text-xs font-bold tabular-nums text-slate-950 outline-none focus:border-[#064E3B]"
                                                        aria-label={`${row?.barangay_name || 'Barangay'} eligible population 0 to 12 months`}
                                                    />
                                                </td>
                                                <td className="border-b border-r border-slate-300 px-3 py-1.5 text-right">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={row?.monthly_target || ''}
                                                        onChange={(event) => updateMonthlyTarget(row?.barangay_id, event.target.value)}
                                                        className={`h-8 w-32 border px-2 text-right text-xs font-bold tabular-nums text-slate-950 outline-none focus:border-[#064E3B] ${overridden ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'}`}
                                                        aria-label={`${row?.barangay_name || 'Barangay'} monthly target`}
                                                    />
                                                </td>
                                                <td className="border-b border-slate-300 px-3 py-1.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {row?.target_status === 'COMPLETE' ? (
                                                            <span className="inline-flex h-7 items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-black uppercase tracking-wider text-[#064E3B]">
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                Complete
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex h-7 items-center gap-1.5 border border-amber-300 bg-amber-50 px-2 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                                Missing
                                                            </span>
                                                        )}
                                                        {overridden ? (
                                                            <>
                                                                <span className="inline-flex h-7 items-center border border-amber-300 bg-white px-2 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                                                    Overridden
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => resetMonthlyTarget(row?.barangay_id)}
                                                                    className="inline-flex h-7 items-center gap-1 border border-slate-300 bg-white px-2 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:border-[#064E3B] hover:text-[#064E3B]"
                                                                    aria-label={`Reset ${row?.barangay_name || 'barangay'} monthly target`}
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                                    Reset
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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
