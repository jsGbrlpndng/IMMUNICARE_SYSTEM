/**
 * Admin M1 Reports page
 *
 * Identical content to the Clinical Reports page.
 * Wrapped in AdminLayout instead of StaffLayout.
 * Same M1ReportView component — same API call — same data.
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import M1ReportView from '../../components/M1ReportView';
import { useBarangayFilter } from '../../contexts/BarangayFilterContext';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const currentDate = new Date();

const AdminM1Reports = () => {
    const { user } = useAuth();
    const { selectedBarangay } = useBarangayFilter();

    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());

    const yearOptions = Array.from(
        { length: 6 },
        (_, i) => currentDate.getFullYear() - i
    );

    return (
        <div className="space-y-6">
            {/* ── Page header ───────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center space-x-3 mb-1">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-slate-600" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">
                        Infant Immunization Report (0–11 Months)
                    </h1>
                </div>
                <p className="text-sm text-slate-500 ml-11">
                    Focused exclusively on the M1 infant immunization portion · {user?.role}
                </p>
            </div>

            {/* ── Filter bar ────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-end print:hidden">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Month</label>
                    <select
                        value={month}
                        onChange={e => setMonth(Number(e.target.value))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                        {MONTHS.map((m, i) => (
                            <option key={m} value={i + 1}>{m}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year</label>
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                        {yearOptions.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Report content ────────────────────────────────────────── */}
            <M1ReportView
                key={`${month}-${year}-${selectedBarangay}`}
                month={month}
                year={year}
                barangay={selectedBarangay === 'all' ? undefined : selectedBarangay}
            />
        </div>
    );
};

export default AdminM1Reports;
