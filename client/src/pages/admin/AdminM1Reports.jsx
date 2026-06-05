import React, { useMemo, useState } from 'react';
import { CalendarDays, FileText, Lock, MapPin } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBarangayFilter } from '../../contexts/BarangayFilterContext';
import M1ReportView from '../../components/M1ReportView';
import { RHU2_BARANGAYS } from '../../components/reports/reportConfig';

const BARANGAYS = RHU2_BARANGAYS;

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

const currentDate = new Date();

const AdminM1Reports = () => {
    const { user } = useAuth();
    const { selectedBarangay, setSelectedBarangay } = useBarangayFilter();
    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());

    const yearOptions = useMemo(
        () => Array.from({ length: 6 }, (_, index) => currentDate.getFullYear() - index),
        []
    );

    const isSuperAdmin = user?.role === 'Super Admin';
    const currentSelectedBarangay = selectedBarangay || 'all';
    const scopedBarangay = isSuperAdmin
        ? (currentSelectedBarangay === 'all' ? undefined : currentSelectedBarangay)
        : undefined;
    const reportMode = scopedBarangay ? 'micro' : (isSuperAdmin ? 'macro' : 'micro');
    const scopeLabel = isSuperAdmin
        ? (currentSelectedBarangay === 'all' ? 'RHU 2 Aggregate' : `Barangay ${currentSelectedBarangay}`)
        : `Barangay ${user?.assigned_barangay || 'Assigned Scope'}`;
    const selectedMonthLabel = MONTHS?.[month - 1] || 'Selected Month';

    return (
        <div className="min-h-screen bg-slate-50 p-6 lg:p-8 print:bg-white print:p-0">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="border border-slate-200 bg-white p-6 shadow-sm print:hidden">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 items-center justify-center bg-emerald-900 text-white">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-800">
                                    Official DOH Reporting
                                </p>
                                <h1 className="mt-1 text-3xl font-black text-slate-950">DOH NIP Reporting Suite</h1>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    {scopeLabel} - live NIP accomplishment reporting
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    Report
                                </label>
                                <div className="border border-slate-300 bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700">
                                    {reportMode === 'macro' ? 'Macro Grid' : 'Micro Monthly Sheet'}
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    Month
                                </label>
                                <select
                                    value={month}
                                    onChange={(event) => setMonth(Number(event.target.value))}
                                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-800"
                                >
                                    {(MONTHS || []).map((label, index) => (
                                        <option key={label} value={index + 1}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    Year
                                </label>
                                <select
                                    value={year}
                                    onChange={(event) => setYear(Number(event.target.value))}
                                    className="border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-emerald-800"
                                >
                                    {yearOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            {isSuperAdmin ? (
                                <div>
                                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Scope
                                    </label>
                                    <div className="flex items-center gap-2 border border-slate-300 bg-white px-3 py-2">
                                        <MapPin className="h-4 w-4 text-emerald-800" />
                                        <select
                                            value={currentSelectedBarangay}
                                            onChange={(event) => setSelectedBarangay?.(event?.target?.value || 'all')}
                                            className="min-w-48 bg-white text-sm font-bold text-slate-900 outline-none"
                                        >
                                            <option value="all">RHU 2 - All Barangays</option>
                                            {(BARANGAYS || []).map((barangayName) => (
                                                <option key={barangayName} value={barangayName}>{barangayName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Scope
                                    </label>
                                    <div className="flex items-center gap-2 border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">
                                        <Lock className="h-4 w-4 text-slate-500" />
                                        {user?.assigned_barangay || 'Assigned Barangay'}
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-800">
                                <CalendarDays className="h-4 w-4" />
                                {selectedMonthLabel} {year || currentDate.getFullYear()}
                            </div>
                        </div>
                    </div>
                </section>

                <M1ReportView
                    key={`${month}-${year}-${scopedBarangay || 'municipal-or-admin-scope'}`}
                    month={month}
                    year={year}
                    barangay={scopedBarangay}
                    reportMode={reportMode}
                />
            </div>
        </div>
    );
};

export default AdminM1Reports;
