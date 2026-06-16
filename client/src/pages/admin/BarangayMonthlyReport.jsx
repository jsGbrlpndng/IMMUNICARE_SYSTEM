import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ChevronLeft, ChevronRight, ClipboardList, Download, Filter, Table2 } from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import ReportFilters from '../../components/reports/ReportFilters';
import MonthlyAccomplishmentTable from '../../components/reports/MonthlyAccomplishmentTable';
import { DataQualityBanner, ErrorState, LoadingState } from '../../components/reports/ReportStates';
import { ALL_MONTH_VALUE, formatReportingPeriodLabel } from '../../components/reports/reportConfig';

const currentDate = new Date();

const readJson = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || payload?.message || `Request failed with HTTP ${response.status}`);
    }
    return payload;
};

const TABS = [
    { key: 'monthly', label: 'Monthly Accomplishment', icon: Table2 },
    { key: 'etcl', label: 'Target Client List (eTCL)', icon: ClipboardList }
];

const ETCL_COLUMNS = [
    { key: '__row_number', label: '#', system: true },
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

const ETCL_EXTERNAL_FLAG_BY_DATE = {
    bcg_date: 'bcg_external',
    hepb_date: 'hepb_external',
    penta1_date: 'penta1_external',
    penta2_date: 'penta2_external',
    penta3_date: 'penta3_external',
    opv1_date: 'opv1_external',
    opv2_date: 'opv2_external',
    opv3_date: 'opv3_external',
    pcv1_date: 'pcv1_external',
    pcv2_date: 'pcv2_external',
    pcv3_date: 'pcv3_external',
    ipv1_date: 'ipv1_external',
    ipv2_date: 'ipv2_external',
    mcv1_date: 'mcv1_external',
    mcv2_date: 'mcv2_external'
};

const ExternalBadge = () => (
    <span className="mt-1 inline-flex border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-800">
        [External]
    </span>
);

const formatDate = (value) => {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
};

const getFilteredEtclRows = (rows, quickFilter) => {
    if (quickFilter === 'defaulters') return rows.filter((row) => row.remarks === 'Defaulter');
    if (quickFilter === 'fic_red_zone') return rows.filter((row) => row.remarks === 'FIC Red Zone');
    if (quickFilter === 'due_soon') return rows.filter((row) => row.remarks === 'Due Soon');
    return rows;
};

const EtclTargetClientTable = ({
    rows = [],
    allRows = [],
    scopeLabel,
    periodLabel,
    quickFilter,
    onQuickFilterChange,
    counters,
    page,
    pageSize,
    totalRows,
    totalPages,
    onPageChange,
    onPageSizeChange,
    onExport
}) => {
    const startRow = totalRows === 0 ? 0 : ((page - 1) * pageSize) + 1;
    const endRow = Math.min(page * pageSize, totalRows);
    const quickFilters = [
        { key: 'all', label: 'All eTCL', count: allRows.length, className: 'border-slate-300 bg-white text-slate-700 hover:border-emerald-800 hover:text-emerald-800' },
        { key: 'defaulters', label: 'Priority Alerts', count: counters.defaulters, className: 'border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-500' },
        { key: 'fic_red_zone', label: 'FIC Red Zone', count: counters.ficRedZone, className: 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500' },
        { key: 'due_soon', label: 'Due Soon', count: counters.dueSoon, className: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-600' }
    ];

    return (
    <section className="min-w-0 border border-slate-400 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-400 px-4 py-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">DOH Target Client List</p>
                <h2 className="text-lg font-black text-slate-950">Target Client List (eTCL)</h2>
                <p className="text-xs font-bold text-slate-500">
                    {scopeLabel} | {periodLabel} | {totalRows.toLocaleString()} visible of {allRows.length.toLocaleString()} registered client{allRows.length === 1 ? '' : 's'}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {quickFilters.map((filter) => (
                    <button
                        key={filter.key}
                        type="button"
                        onClick={() => onQuickFilterChange(filter.key)}
                        className={`inline-flex h-9 items-center gap-2 border px-3 text-[10px] font-black uppercase tracking-wider transition ${filter.className} ${quickFilter === filter.key ? 'ring-2 ring-emerald-800 ring-offset-1' : ''}`}
                    >
                        <Filter className="h-3.5 w-3.5" />
                        {filter.label}
                        <span className="border border-current px-1.5 py-0.5 tabular-nums">{Number(filter.count || 0).toLocaleString()}</span>
                    </button>
                ))}
                <button
                    type="button"
                    onClick={onExport}
                    className="inline-flex h-9 items-center gap-2 border border-emerald-800 bg-emerald-800 px-3 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-900"
                >
                    <Download className="h-3.5 w-3.5" />
                    Export XLSX
                </button>
            </div>
        </div>

        <div className="max-w-full overflow-x-auto overflow-y-auto border-t border-slate-300">
            <table className="min-w-[2380px] w-full border-collapse bg-white text-left text-xs">
                <thead className="sticky top-0 z-20">
                    <tr className="bg-[#064E3B] text-white">
                        {ETCL_COLUMNS.map((column) => (
                            <th
                                key={column.key}
                                className={`${column.key === '__row_number' ? 'w-14 min-w-14 text-center' : column.sticky ? 'sticky left-14 z-30 w-56 min-w-56 bg-[#064E3B] text-left' : 'min-w-28 text-center'} border border-[#043828] px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.08em]`}
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
                                if (column.key === '__row_number') {
                                    return (
                                        <td
                                            key={`${row.infant_id || index}-${column.key}`}
                                            className="border border-slate-300 px-2.5 py-2 text-center text-xs font-black tabular-nums text-slate-500"
                                        >
                                            {((page - 1) * pageSize) + index + 1}
                                        </td>
                                    );
                                }
                                const rawValue = row[column.key];
                                const value = column.type === 'date' ? formatDate(rawValue) : (rawValue || '-');
                                const externalFlag = ETCL_EXTERNAL_FLAG_BY_DATE[column.key];
                                const isExternalDose = !!externalFlag && row[externalFlag] === true;
                                return (
                                    <td
                                        key={`${row.infant_id || index}-${column.key}`}
                                        className={`${column.sticky ? 'sticky left-14 z-10 w-56 min-w-56 bg-inherit font-black uppercase text-slate-950' : column.type === 'date' ? 'text-center font-mono tabular-nums' : 'font-semibold text-slate-800'} border border-slate-300 px-2.5 py-2`}
                                    >
                                        {column.sticky ? (
                                            <>
                                                <p>{value}</p>
                                                <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">{row.reference_id || row.infant_id || 'No ref'}</p>
                                            </>
                                        ) : column.type === 'date' ? (
                                            <div className="flex flex-col items-center">
                                                <span>{value}</span>
                                                {isExternalDose && <ExternalBadge />}
                                            </div>
                                        ) : value}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-500">
                Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {totalRows.toLocaleString()} filtered records
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={pageSize}
                    onChange={(event) => onPageSizeChange(Number(event.target.value))}
                    className="h-9 border border-slate-300 bg-white px-2 text-xs font-black uppercase tracking-wider text-slate-700"
                >
                    {[10, 25, 50, 100].map((size) => (
                        <option key={size} value={size}>{size} rows</option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    className="inline-flex h-9 items-center gap-1 border border-slate-300 bg-white px-3 text-xs font-black uppercase tracking-wider text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </button>
                <span className="px-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Page {page} of {totalPages}
                </span>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                    className="inline-flex h-9 items-center gap-1 border border-slate-300 bg-white px-3 text-xs font-black uppercase tracking-wider text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    </section>
    );
};

const BarangayMonthlyReport = () => {
    const { user } = useAuth();
    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());
    const [report, setReport] = useState(null);
    const [dss, setDss] = useState(null);
    const [activeTab, setActiveTab] = useState('monthly');
    const [etclQuickFilter, setEtclQuickFilter] = useState('all');
    const [etclPage, setEtclPage] = useState(1);
    const [etclPageSize, setEtclPageSize] = useState(25);
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
    const etclRows = Array.isArray(dss?.etcl_rows) ? dss.etcl_rows : [];
    const periodLabel = formatReportingPeriodLabel(month, year);
    const dssCounters = useMemo(() => ({
        defaulters: Number(dss?.metrics?.defaulter_action_alert?.infant_count || 0),
        ficRedZone: Number(dss?.metrics?.fic_red_zone?.infant_count || 0),
        dueSoon: Number(dss?.metrics?.upcoming_pipeline?.infant_count || 0)
    }), [dss]);
    const filteredEtclRows = useMemo(() => getFilteredEtclRows(etclRows, etclQuickFilter), [etclRows, etclQuickFilter]);
    const totalEtclPages = Math.max(1, Math.ceil(filteredEtclRows.length / etclPageSize));
    const paginatedEtclRows = useMemo(() => {
        const start = (etclPage - 1) * etclPageSize;
        return filteredEtclRows.slice(start, start + etclPageSize);
    }, [etclPage, etclPageSize, filteredEtclRows]);

    useEffect(() => {
        setEtclPage(1);
    }, [month, year, etclQuickFilter, etclPageSize]);

    useEffect(() => {
        setEtclPage((current) => Math.min(current, totalEtclPages));
    }, [totalEtclPages]);

    const exportEtclXlsx = useCallback(() => {
        const exportRows = filteredEtclRows.map((row, index) => ({
            '#': index + 1,
            'Infant Name': row.infant_name || '',
            'Reference ID': row.reference_id || row.infant_id || '',
            'Date of Birth': formatDate(row.date_of_birth),
            "Mother's Name": row.mother_name || '',
            'Complete Address (Purok/Sitio)': row.complete_address || '',
            BCG: formatDate(row.bcg_date),
            'Hep B': formatDate(row.hepb_date),
            'PENTA 1': formatDate(row.penta1_date),
            'PENTA 2': formatDate(row.penta2_date),
            'PENTA 3': formatDate(row.penta3_date),
            'OPV 1': formatDate(row.opv1_date),
            'OPV 2': formatDate(row.opv2_date),
            'OPV 3': formatDate(row.opv3_date),
            'PCV 1': formatDate(row.pcv1_date),
            'PCV 2': formatDate(row.pcv2_date),
            'PCV 3': formatDate(row.pcv3_date),
            'IPV 1': formatDate(row.ipv1_date),
            'IPV 2': formatDate(row.ipv2_date),
            'MCV 1': formatDate(row.mcv1_date),
            'MCV 2': formatDate(row.mcv2_date),
            Remarks: row.remarks || ''
        }));
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        worksheet['!cols'] = Object.keys(exportRows[0] || { '#': '' }).map((key) => ({ wch: Math.max(12, key.length + 4) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'eTCL');
        const fileSafeBarangay = assignedBarangay.toString().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'barangay';
        XLSX.writeFile(workbook, `immunicare_etcl_${fileSafeBarangay}_${year}_${month}.xlsx`);
    }, [assignedBarangay, filteredEtclRows, month, year]);

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 p-5 lg:p-7">
            <div className="mx-auto max-w-[1500px] min-w-0 space-y-5">
                <section className="border border-slate-300 bg-white px-5 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">Barangay Nurse Report</p>
                    <h1 className="mt-1 text-2xl font-black text-slate-950">{month === ALL_MONTH_VALUE ? 'Annual DSS Workspace' : 'Monthly DSS Workspace'}</h1>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        {assignedBarangay} - {periodLabel}
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
                                title={month === ALL_MONTH_VALUE ? 'Barangay Annual Accomplishment' : 'Barangay Monthly Accomplishment'}
                            />
                        ) : null}

                        {activeTab === 'etcl' ? (
                            <EtclTargetClientTable
                                rows={paginatedEtclRows}
                                allRows={etclRows}
                                scopeLabel={assignedBarangay}
                                periodLabel={periodLabel}
                                quickFilter={etclQuickFilter}
                                onQuickFilterChange={setEtclQuickFilter}
                                counters={dssCounters}
                                page={etclPage}
                                pageSize={etclPageSize}
                                totalRows={filteredEtclRows.length}
                                totalPages={totalEtclPages}
                                onPageChange={setEtclPage}
                                onPageSizeChange={setEtclPageSize}
                                onExport={exportEtclXlsx}
                            />
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
};

export default BarangayMonthlyReport;
