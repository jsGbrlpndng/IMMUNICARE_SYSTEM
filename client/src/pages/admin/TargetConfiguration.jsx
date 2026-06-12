import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Save, Target } from 'lucide-react';
import apiClient from '../../services/apiClient';

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const emptySummary = {
    barangays: 0,
    complete: 0,
    incomplete: 0,
    total_population: 0,
    eligible_population_0_11_months: 0,
    eligible_population_0_12_months: 0,
    eligible_population_13_23_months: 0,
    actual_population: 0
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

const formatNumber = (value) => safeNumber(value).toLocaleString();

const toEditableRows = (rows = []) => (Array.isArray(rows) ? rows : []).filter(Boolean).map((row) => {
    const population = safeInteger(row?.total_population ?? row?.population);
    const ep011 = safeInteger(row?.eligible_population_0_11_months ?? row?.eligible_population);
    const ep012 = safeInteger(row?.eligible_population_0_12_months);
    const ep1323 = safeInteger(row?.eligible_population_13_23_months);

    return {
        barangay_id: row?.barangay_id || '',
        barangay_name: row?.barangay_name || 'Unassigned Barangay',
        total_population: population > 0 ? String(population) : '',
        eligible_population_0_11_months: ep011 > 0 ? String(ep011) : '',
        eligible_population_0_12_months: ep012 > 0 ? String(ep012) : '',
        eligible_population_13_23_months: ep1323 > 0 ? String(ep1323) : '',
        actual_population: safeInteger(row?.actual_population) > 0 ? String(safeInteger(row.actual_population)) : '',
        penta_cumulative_target_population: safeInteger(row?.penta_cumulative_target_population || ep011) > 0 ? String(safeInteger(row?.penta_cumulative_target_population || ep011)) : '',
        mcv_cumulative_target_population: safeInteger(row?.mcv_cumulative_target_population || ep012) > 0 ? String(safeInteger(row?.mcv_cumulative_target_population || ep012)) : '',
        utilization_cumulative_target_population: safeInteger(row?.utilization_cumulative_target_population || ep012) > 0 ? String(safeInteger(row?.utilization_cumulative_target_population || ep012)) : '',
        target_status: row?.target_status || 'MISSING_TARGET',
        cohort_target_status: row?.cohort_target_status || 'MISSING_TARGET',
        updated_at: row?.updated_at || null
    };
});

const TargetConfiguration = () => {
    const [year, setYear] = useState(currentYear);
    const [month, setMonth] = useState(currentMonth);
    const [rows, setRows] = useState([]);
    const [municipalTarget, setMunicipalTarget] = useState('');
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
                const response = await apiClient.get(`/admin/m1-targets?year=${year}&month=${month}`);
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload?.success === false) {
                    throw new Error(payload?.error || 'Unable to load target configuration.');
                }

                if (isMounted) {
                    setRows(toEditableRows(payload?.targets || []));
                    setMunicipalTarget(
                        safeInteger(payload?.municipal_target?.total_population) > 0
                            ? String(safeInteger(payload.municipal_target.total_population))
                            : ''
                    );
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
    }, [year, month]);

    const updateRow = (barangayId, field, value) => {
        const normalized = normalizeIntegerInput(value);
        setRows((previousRows) => previousRows.map((row) => {
            if (row?.barangay_id !== barangayId) return row;

            const updated = { ...row, [field]: normalized };
            const population = safeInteger(updated.total_population);
            const ep011 = safeInteger(updated.eligible_population_0_11_months);
            const ep012 = safeInteger(updated.eligible_population_0_12_months);
            const ep1323 = safeInteger(updated.eligible_population_13_23_months);
            const actualPopulation = safeInteger(updated.actual_population);
            const pentaTarget = safeInteger(updated.penta_cumulative_target_population);
            const mcvTarget = safeInteger(updated.mcv_cumulative_target_population);
            const utilizationTarget = safeInteger(updated.utilization_cumulative_target_population);

            return {
                ...updated,
                target_status: population > 0 && ep011 > 0 && ep012 > 0 && actualPopulation > 0 ? 'COMPLETE' : 'MISSING_TARGET',
                cohort_target_status: population > 0 && ep011 > 0 && ep012 > 0 && ep1323 > 0 && pentaTarget > 0 && mcvTarget > 0 && utilizationTarget > 0
                    ? 'COMPLETE'
                    : 'MISSING_TARGET'
            };
        }));
        setDirty(true);
        setError('');
        setSuccess('');
    };

    const handleMunicipalChange = (value) => {
        setMunicipalTarget(normalizeIntegerInput(value));
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
                report_month: month,
                month,
                municipal_target: {
                    total_population: safeInteger(municipalTarget)
                },
                targets: (Array.isArray(rows) ? rows : []).map((row) => ({
                    barangay_id: row?.barangay_id || '',
                    total_population: safeInteger(row?.total_population),
                    eligible_population_0_11_months: safeInteger(row?.eligible_population_0_11_months),
                    eligible_population_0_12_months: safeInteger(row?.eligible_population_0_12_months),
                    eligible_population_13_23_months: safeInteger(row?.eligible_population_13_23_months),
                    actual_population: safeInteger(row?.actual_population),
                    penta_cumulative_target_population: safeInteger(row?.penta_cumulative_target_population),
                    mcv_cumulative_target_population: safeInteger(row?.mcv_cumulative_target_population),
                    utilization_cumulative_target_population: safeInteger(row?.utilization_cumulative_target_population)
                }))
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Unable to save target configuration.');
            }

            setRows(toEditableRows(payload?.targets || []));
            setMunicipalTarget(
                safeInteger(payload?.municipal_target?.total_population) > 0
                    ? String(safeInteger(payload.municipal_target.total_population))
                    : ''
            );
            setSummary({ ...emptySummary, ...(payload?.summary || {}) });
            setDirty(false);
            setSuccess('DOH target configuration saved.');
        } catch (err) {
            console.error('[TARGET_CONFIGURATION_SAVE]', err);
            setError(err.message || 'Unable to save target configuration.');
        } finally {
            setSaving(false);
        }
    };

    const annualFields = [
        ['total_population', 'Population'],
        ['eligible_population_0_11_months', 'EP 0-11'],
        ['eligible_population_0_12_months', 'EP 0-12'],
        ['eligible_population_13_23_months', 'EP 13-23']
    ];

    const chartFields = [
        ['penta_cumulative_target_population', 'Penta Cumulative Target'],
        ['mcv_cumulative_target_population', 'MCV Cumulative Target'],
        ['utilization_cumulative_target_population', 'Utilization Cumulative Target']
    ];

    return (
        <div className="w-full min-w-0 bg-slate-50 p-6 lg:p-8">
            <div className="mx-auto w-full max-w-7xl min-w-0 space-y-5">
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
                                <h1 className="mt-1 text-2xl font-black text-slate-950">DOH Target Configuration</h1>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    Configure San Pedro totals, barangay EP targets, monthly actual population, and monitoring chart targets.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Report Month</span>
                                <select
                                    value={month}
                                    onChange={(event) => setMonth(Number(event.target.value))}
                                    className="h-10 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                >
                                    {MONTHS.map((label, index) => (
                                        <option key={label} value={index + 1}>{label}</option>
                                    ))}
                                </select>
                            </label>
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
                                {saving ? 'Saving' : 'Save Targets'}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
                    <div className="border border-slate-300 bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">San Pedro Global Target</p>
                        <label className="mt-3 block">
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">San Pedro Total Population</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={municipalTarget}
                                onChange={(event) => handleMunicipalChange(event.target.value)}
                                className="h-10 w-full border border-slate-300 bg-white px-3 text-right text-sm font-black tabular-nums text-slate-950 outline-none focus:border-[#064E3B]"
                            />
                        </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                        {[
                            ['Barangays', summary?.barangays || rows.length || 0],
                            ['Population', summary?.total_population || 0],
                            ['EP 0-11', summary?.eligible_population_0_11_months || 0],
                            ['EP 0-12', summary?.eligible_population_0_12_months || 0],
                            ['Actual Population', summary?.actual_population || 0]
                        ].map(([label, value]) => (
                            <div key={label} className="border border-slate-300 bg-white px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
                                <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{formatNumber(value)}</p>
                            </div>
                        ))}
                    </div>
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

                <section className="min-w-0 border border-slate-300 bg-white">
                    <div className="border-b border-slate-300 px-5 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">
                            Barangay Targets and Monthly Actual Population
                        </p>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">Loading target configuration...</div>
                    ) : (rows || []).length === 0 ? (
                        <div className="p-10 text-center text-sm font-semibold text-slate-500">No active barangays available.</div>
                    ) : (
                        <div className="w-full max-w-full overflow-x-auto">
                            <table className="min-w-[1720px] w-full border-collapse text-sm">
                                <thead className="bg-[#064E3B] text-white">
                                    <tr>
                                        <th className="border-r border-emerald-800 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Barangay</th>
                                        {annualFields.map(([, label]) => (
                                            <th key={label} className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">
                                                {label}
                                            </th>
                                        ))}
                                        <th className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">
                                            Actual Population ({MONTHS[month - 1]})
                                        </th>
                                        {chartFields.map(([, label]) => (
                                            <th key={label} className="border-r border-emerald-800 px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider">
                                                {label}
                                            </th>
                                        ))}
                                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(rows || []).map((row, index) => (
                                        <tr key={row?.barangay_id || row?.barangay_name} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                                            <td className="border-b border-r border-slate-300 px-3 py-2 text-xs font-black uppercase text-slate-950">
                                                {row?.barangay_name || 'Unassigned Barangay'}
                                            </td>
                                            {[...annualFields, ['actual_population', 'Actual Population'], ...chartFields].map(([field, label]) => (
                                                <td key={field} className="border-b border-r border-slate-300 px-3 py-1.5 text-right">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={row?.[field] || ''}
                                                        onChange={(event) => updateRow(row?.barangay_id, field, event.target.value)}
                                                        className="h-8 w-36 border border-slate-300 bg-white px-2 text-right text-xs font-bold tabular-nums text-slate-950 outline-none focus:border-[#064E3B]"
                                                        aria-label={`${row?.barangay_name || 'Barangay'} ${label}`}
                                                    />
                                                </td>
                                            ))}
                                            <td className="border-b border-slate-300 px-3 py-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {row?.cohort_target_status === 'COMPLETE' ? (
                                                        <span className="inline-flex h-7 items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-black uppercase tracking-wider text-[#064E3B]">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            Complete
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex h-7 items-center gap-1.5 border border-amber-300 bg-amber-50 px-2 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                                            <AlertTriangle className="h-3.5 w-3.5" />
                                                            Missing Value
                                                        </span>
                                                    )}
                                                </div>
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
