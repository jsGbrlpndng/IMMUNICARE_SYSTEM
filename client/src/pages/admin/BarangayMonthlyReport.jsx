import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardList, PhoneCall, Table2, UserPlus } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import ReportFilters from '../../components/reports/ReportFilters';
import MonthlyAccomplishmentTable from '../../components/reports/MonthlyAccomplishmentTable';
import BarangayDssWidgets from '../../components/reports/BarangayDssWidgets';
import { DataQualityBanner, ErrorState, LoadingState } from '../../components/reports/ReportStates';
import { MONTHS } from '../../components/reports/reportConfig';

const currentDate = new Date();

const readJson = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || payload?.message || `Request failed with HTTP ${response.status}`);
    }
    return payload;
};

const COHORT_LABELS = {
    defaulters: 'Defaulter Action Alert',
    fic_red_zone: 'FIC Red Zone',
    pipeline_30_day: '30-Day Pipeline',
    vial_requisition: 'Predictive Vial Requisition'
};

const TABS = [
    { key: 'monthly', label: 'Monthly Accomplishment Table', icon: Table2 },
    { key: 'etcl', label: 'Target Client List (eTCL)', icon: ClipboardList },
    { key: 'dss', label: 'DSS Action Alerts', icon: AlertTriangle }
];

const ETCL_COLUMNS = [
    { key: 'infant_name', label: 'Infant Name', sticky: true },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'mother_name', label: "Mother's Name" },
    { key: 'complete_address', label: 'Complete Address (Purok/Sitio)' },
    { key: 'bcg_date', label: 'BCG', type: 'date' },
    { key: 'hepb_date', label: 'Hep B', type: 'date' },
    { key: 'penta1_date', label: 'PENTA 1', type: 'date' },
    { key: 'penta2_date', label: 'PENTA 2', type: 'date' },
    { key: 'penta3_date', label: 'PENTA 3', type: 'date' },
    { key: 'opv1_date', label: 'OPV 1', type: 'date' },
    { key: 'opv2_date', label: 'OPV 2', type: 'date' },
    { key: 'opv3_date', label: 'OPV 3', type: 'date' },
    { key: 'pcv1_date', label: 'PCV 1', type: 'date' },
    { key: 'pcv2_date', label: 'PCV 2', type: 'date' },
    { key: 'pcv3_date', label: 'PCV 3', type: 'date' },
    { key: 'ipv1_date', label: 'IPV 1', type: 'date' },
    { key: 'ipv2_date', label: 'IPV 2', type: 'date' },
    { key: 'mcv1_date', label: 'MCV 1', type: 'date' },
    { key: 'mcv2_date', label: 'MCV 2', type: 'date' },
    { key: 'remarks', label: 'Remarks' }
];

const formatDate = (value) => {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
};

const TargetClientTable = ({ rows = [], activeCohort }) => (
    <section className="min-w-0 border border-slate-400 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-400 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Target Client Line List</p>
                <h2 className="text-lg font-black text-slate-950">{COHORT_LABELS[activeCohort] || 'Selected Cohort'}</h2>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                {rows.length} client{rows.length === 1 ? '' : 's'}
            </p>
        </div>

        <div className="max-h-[520px] max-w-full overflow-auto">
            <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#064E3B] text-white">
                    <tr>
                        <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-[0.08em]">Infant Name</th>
                        <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-[0.08em]">Age & DOB</th>
                        <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-[0.08em]">Purok / Sitio</th>
                        <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-[0.08em]">Missing / Upcoming Antigen</th>
                        <th className="border border-[#043828] px-3 py-2 font-black uppercase tracking-[0.08em]">Mother & Contact</th>
                        <th className="border border-[#043828] px-3 py-2 text-center font-black uppercase tracking-[0.08em]">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="border border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-500">
                                No clients in this DSS cohort.
                            </td>
                        </tr>
                    ) : rows.map((row) => (
                        <tr key={`${activeCohort}-${row.infant_id || row.id}`} className="align-top odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                            <td className="border border-slate-300 px-3 py-2">
                                <p className="font-black uppercase text-slate-950">{row.infant_name || 'Unnamed infant'}</p>
                                <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">{row.reference_id || row.infant_id || 'No reference ID'}</p>
                            </td>
                            <td className="border border-slate-300 px-3 py-2 tabular-nums">
                                <p className="font-black text-slate-900">{Number(row.age_months || 0)} month(s)</p>
                                <p className="mt-0.5 font-semibold text-slate-500">{formatDate(row.dob)}</p>
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                                <p className="font-bold text-slate-800">{row.purok_sitio || 'Unspecified'}</p>
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                                <p className="font-black text-[#064E3B]">{row.antigen_summary || row.missing_upcoming_antigen || 'No pending antigen'}</p>
                                {row.due_date && (
                                    <p className="mt-0.5 font-semibold text-slate-500">Due: {formatDate(row.due_date)}</p>
                                )}
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                                <p className="font-bold text-slate-900">{row.mother_name || 'Not recorded'}</p>
                                <p className="mt-0.5 font-mono text-[11px] font-bold text-slate-500">{row.contact_number || 'No contact number'}</p>
                            </td>
                            <td className="border border-slate-300 px-3 py-2">
                                <div className="flex items-center justify-center gap-2">
                                    <a
                                        href={row.contact_number ? `tel:${row.contact_number}` : undefined}
                                        aria-disabled={!row.contact_number}
                                        className={`inline-flex h-8 items-center gap-1 border px-2 text-[11px] font-black uppercase tracking-[0.08em] ${row.contact_number ? 'border-[#064E3B] bg-[#064E3B] text-white hover:bg-[#043828]' : 'pointer-events-none border-slate-300 bg-slate-100 text-slate-400'}`}
                                    >
                                        <PhoneCall className="h-3.5 w-3.5" />
                                        Log Call
                                    </a>
                                    <Link
                                        to="/admin/spatial-analysis"
                                        className="inline-flex h-8 items-center gap-1 border border-slate-500 bg-white px-2 text-[11px] font-black uppercase tracking-[0.08em] text-slate-800 hover:border-[#064E3B] hover:text-[#064E3B]"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        Assign BHW
                                    </Link>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

const EtclTargetClientTable = ({ rows = [], scopeLabel, periodLabel }) => (
    <section className="min-w-0 border border-slate-400 bg-white">
        <div className="flex flex-col gap-1 border-b border-slate-400 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">DOH Target Client List</p>
            <h2 className="text-lg font-black text-slate-950">Target Client List (eTCL)</h2>
            <p className="text-xs font-bold text-slate-500">
                {scopeLabel} | {periodLabel} | {rows.length.toLocaleString()} registered client{rows.length === 1 ? '' : 's'}
            </p>
        </div>

        <div className="max-w-full overflow-x-auto overflow-y-auto border-t border-slate-300">
            <table className="min-w-[2320px] w-full border-collapse bg-white text-left text-xs">
                <thead className="sticky top-0 z-20">
                    <tr className="bg-[#064E3B] text-white">
                        {ETCL_COLUMNS.map((column) => (
                            <th
                                key={column.key}
                                className={`${column.sticky ? 'sticky left-0 z-30 w-56 min-w-56 bg-[#064E3B] text-left' : 'min-w-28 text-center'} border border-[#043828] px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.08em]`}
                            >
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={ETCL_COLUMNS.length} className="border border-slate-300 px-4 py-8 text-center text-sm font-bold text-slate-500">
                                No eTCL client records available for this barangay.
                            </td>
                        </tr>
                    ) : rows.map((row, index) => (
                        <tr key={row.infant_id || row.reference_id || index} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                            {ETCL_COLUMNS.map((column) => {
                                const rawValue = row[column.key];
                                const value = column.type === 'date' ? formatDate(rawValue) : (rawValue || '-');
                                return (
                                    <td
                                        key={`${row.infant_id || index}-${column.key}`}
                                        className={`${column.sticky ? 'sticky left-0 z-10 w-56 min-w-56 bg-inherit font-black uppercase text-slate-950' : column.type === 'date' ? 'text-center font-mono tabular-nums' : 'font-semibold text-slate-800'} border border-slate-300 px-2.5 py-2`}
                                    >
                                        {column.sticky ? (
                                            <>
                                                <p>{value}</p>
                                                <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">{row.reference_id || row.infant_id || 'No ref'}</p>
                                            </>
                                        ) : value}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </section>
);

const BarangayMonthlyReport = () => {
    const { user } = useAuth();
    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());
    const [report, setReport] = useState(null);
    const [dss, setDss] = useState(null);
    const [activeTab, setActiveTab] = useState('monthly');
    const [activeCohort, setActiveCohort] = useState('defaulters');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                month: String(month),
                year: String(year)
            });
            const [reportResponse, dssResponse] = await Promise.all([
                apiClient.get(`/reports/nip-monthly-barangay?${params.toString()}`),
                apiClient.get(`/reports/barangay-dss?${params.toString()}`)
            ]);
            const [reportPayload, dssPayload] = await Promise.all([
                readJson(reportResponse),
                readJson(dssResponse)
            ]);
            setReport(reportPayload);
            setDss(dssPayload);
        } catch (requestError) {
            console.error('[BARANGAY_MONTHLY_REPORT]', requestError);
            setReport(null);
            setDss(null);
            setError(requestError.message || 'Unable to load barangay monthly report.');
        } finally {
            setLoading(false);
        }
    }, [month, year]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const assignedBarangay = user?.assigned_barangay || report?.scope?.barangay || 'Assigned Barangay';
    const missingCount = Number(report?.data_quality?.missing_report_classification_count || 0);
    const cohortRows = Array.isArray(dss?.cohorts?.[activeCohort]) ? dss.cohorts[activeCohort] : [];
    const etclRows = Array.isArray(dss?.etcl_rows) ? dss.etcl_rows : [];
    const periodLabel = `${MONTHS[month - 1]} ${year}`;

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 p-5 lg:p-7">
            <div className="mx-auto max-w-[1500px] min-w-0 space-y-5">
                <section className="border border-slate-300 bg-white px-5 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">Barangay Nurse Report</p>
                    <h1 className="mt-1 text-2xl font-black text-slate-950">Monthly DSS Workspace</h1>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        {assignedBarangay} · {MONTHS[month - 1]} {year}
                    </p>
                </section>

                <ReportFilters
                    month={month}
                    year={year}
                    onMonthChange={setMonth}
                    onYearChange={setYear}
                    showBarangay={false}
                    lockBarangay
                    assignedBarangay={assignedBarangay}
                />

                <DataQualityBanner count={missingCount} />

                <div className="flex max-w-full flex-wrap border border-slate-300 bg-white">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex h-11 items-center gap-2 border-r border-slate-300 px-4 text-xs font-black uppercase tracking-wider ${isActive ? 'bg-[#064E3B] text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                            >
                                <Icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <LoadingState label="Loading barangay report" />
                ) : error ? (
                    <ErrorState message={error} onRetry={fetchReport} />
                ) : (
                    <>
                        {activeTab === 'monthly' ? (
                            <MonthlyAccomplishmentTable
                                report={report}
                                mode="barangay"
                                title="Barangay Monthly Accomplishment"
                            />
                        ) : null}

                        {activeTab === 'etcl' ? (
                            <EtclTargetClientTable
                                rows={etclRows}
                                scopeLabel={assignedBarangay}
                                periodLabel={periodLabel}
                            />
                        ) : null}

                        {activeTab === 'dss' ? (
                            <div className="min-w-0 space-y-5">
                                <BarangayDssWidgets
                                    dss={dss}
                                    activeCohort={activeCohort}
                                    onSelect={setActiveCohort}
                                />
                                <TargetClientTable rows={cohortRows} activeCohort={activeCohort} />
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
};

export default BarangayMonthlyReport;
