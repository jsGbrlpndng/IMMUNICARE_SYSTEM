import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ClipboardList, Table2 } from 'lucide-react';
import apiClient from '../../services/apiClient';
import ReportFilters from '../../components/reports/ReportFilters';
import MonthlyAccomplishmentTable from '../../components/reports/MonthlyAccomplishmentTable';
import MonitoringCharts from '../../components/reports/MonitoringCharts';
import UtilizationWastagePanel from '../../components/reports/UtilizationWastagePanel';
import { DataQualityBanner, ErrorState, LoadingState } from '../../components/reports/ReportStates';
import { MONTHS } from '../../components/reports/reportConfig';

const currentDate = new Date();

const tabs = [
    { key: 'master', label: 'Master Accomplishment Table', icon: Table2 },
    { key: 'monitoring', label: 'Immunization Monitoring Charts', icon: BarChart3 },
    { key: 'quality', label: 'Data Quality Audit', icon: ClipboardList }
];

const readJson = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || payload?.message || `Request failed with HTTP ${response.status}`);
    }
    return payload;
};

const buildQuery = ({ month, year, barangay, includeMonth = true }) => {
    const params = new URLSearchParams();
    if (includeMonth) params.set('month', String(month));
    params.set('year', String(year));
    if (barangay && barangay !== 'all') params.set('barangay', barangay);
    return params.toString();
};

const AuditMetric = ({ label, value, tone = 'slate' }) => {
    const toneClasses = tone === 'amber'
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-slate-300 bg-white text-slate-950';

    return (
        <div className={`border px-5 py-4 ${toneClasses}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
        </div>
    );
};

const DataQualityAudit = ({ monthlyReport, monitoringReport }) => {
    const missingCount = Number(monthlyReport?.data_quality?.missing_report_classification_count || 0);
    const targetReady = monitoringReport?.target_status?.has_required_targets !== false;
    const rows = monthlyReport?.rows || [];

    return (
        <div className="space-y-5">
            <DataQualityBanner count={missingCount} />
            <section className="border border-slate-300 bg-white">
                <div className="border-b border-slate-300 px-5 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Data Quality Audit</p>
                    <h3 className="text-lg font-black text-slate-950">Report Readiness Checks</h3>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-3">
                    <AuditMetric label="Barangay Rows" value={(rows.length || 0).toLocaleString()} />
                    <AuditMetric label="Missing Classification" value={missingCount.toLocaleString()} tone={missingCount ? 'amber' : 'slate'} />
                    <AuditMetric label="Target Population" value={targetReady ? 'Configured' : 'Not Set'} tone={targetReady ? 'slate' : 'amber'} />
                </div>
                <div className="border-t border-slate-200 px-5 py-4 text-sm font-semibold text-slate-600">
                    FHSIS reporting excludes doses without explicit `report_classification` from routine, ORI, and catch-up bucket totals. Birth-dose and completion counts remain visible where clinically valid.
                </div>
            </section>
        </div>
    );
};

const SuperAdminAnalytics = () => {
    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());
    const [barangay, setBarangay] = useState('all');
    const [activeTab, setActiveTab] = useState('master');
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [monitoringReport, setMonitoringReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const periodLabel = useMemo(() => `${MONTHS[month - 1]} ${year}`, [month, year]);

    const fetchReports = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const monthlyQuery = buildQuery({ month, year, barangay, includeMonth: true });
            const monitoringQuery = buildQuery({ month, year, barangay, includeMonth: false });
            const [monthlyResponse, monitoringResponse] = await Promise.all([
                apiClient.get(`/reports/nip-monthly-master?${monthlyQuery}`),
                apiClient.get(`/reports/immunization-monitoring?${monitoringQuery}`)
            ]);
            const [monthlyPayload, monitoringPayload] = await Promise.all([
                readJson(monthlyResponse),
                readJson(monitoringResponse)
            ]);

            setMonthlyReport(monthlyPayload);
            setMonitoringReport(monitoringPayload);
        } catch (requestError) {
            console.error('[SUPER_ADMIN_ANALYTICS]', requestError);
            setMonthlyReport(null);
            setMonitoringReport(null);
            setError(requestError.message || 'Unable to load analytics.');
        } finally {
            setLoading(false);
        }
    }, [barangay, month, year]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const missingCount = Number(monthlyReport?.data_quality?.missing_report_classification_count || 0);

    return (
        <div className="space-y-5">
            <section className="border border-slate-300 bg-white px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">Head Nurse Analytics</p>
                <h1 className="mt-1 text-2xl font-black text-slate-950">Municipal NIP Reporting</h1>
                <p className="mt-1 text-sm font-semibold text-slate-500">{periodLabel} · {barangay === 'all' ? 'RHU 2 - All Barangays' : barangay}</p>
            </section>

            <ReportFilters
                month={month}
                year={year}
                barangay={barangay}
                onMonthChange={setMonth}
                onYearChange={setYear}
                onBarangayChange={setBarangay}
                showBarangay
            />

            <div className="flex flex-wrap border border-slate-300 bg-white">
                {tabs.map((tab) => {
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

            <DataQualityBanner count={missingCount} />

            {loading ? (
                <LoadingState label="Loading municipal report" />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchReports} />
            ) : (
                <>
                    {activeTab === 'master' ? (
                        <div className="space-y-5">
                            <MonthlyAccomplishmentTable
                                report={monthlyReport}
                                mode="master"
                                title="Master Monthly Accomplishment Table"
                            />
                        </div>
                    ) : null}
                    {activeTab === 'monitoring' ? (
                        <MonitoringCharts report={monitoringReport} />
                    ) : null}
                    {activeTab === 'quality' ? (
                        <DataQualityAudit monthlyReport={monthlyReport} monitoringReport={monitoringReport} />
                    ) : null}
                </>
            )}

            {missingCount > 0 && activeTab !== 'quality' ? (
                <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-950">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Open Data Quality Audit for classification readiness details.
                </div>
            ) : null}
        </div>
    );
};

export default SuperAdminAnalytics;
