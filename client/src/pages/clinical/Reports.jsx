/**
 * Clinical Reports page
 *
 * Uses M1ReportView exclusively — no client-side aggregation.
 * Allows Nurse / Midwife to filter by month, year, and barangay.
 * BHW is already blocked by StaffLayout redirect; M1ReportView adds a
 * second 403-guard layer that redirects to /bhw/dashboard.
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import M1ReportView from '../../components/M1ReportView';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const currentDate = new Date();

const Reports = () => {
    const { user } = useAuth();

    const [month, setMonth] = useState(currentDate.getMonth() + 1);
    const [year, setYear] = useState(currentDate.getFullYear());
    const [barangay, setBarangay] = useState('');

    // Years from current back to 5 years ago
    const yearOptions = Array.from(
        { length: 6 },
        (_, i) => currentDate.getFullYear() - i
    );

    return (
        <div className="space-y-6">
            {/* ── Page header ───────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center space-x-3 mb-1">
                    <div className="w-8 h-8 bg-[#0061FF]/10 rounded-lg flex items-center justify-center">
                        <FileText className="w-4 h-4 text-[#0061FF]" />
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
                {/* Month */}
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Month</label>
                    <select
                        value={month}
                        onChange={e => setMonth(Number(e.target.value))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0061FF]/30"
                    >
                        {MONTHS.map((m, i) => (
                            <option key={m} value={i + 1}>{m}</option>
                        ))}
                    </select>
                </div>

                {/* Year */}
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year</label>
                    <select
                        value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0061FF]/30"
                    >
                        {yearOptions.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                {/* Barangay (optional) */}
                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Barangay <span className="font-normal">(optional)</span>
                    </label>
                    <input
                        type="text"
                        placeholder="All barangays"
                        value={barangay}
                        onChange={e => setBarangay(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0061FF]/30"
                    />
                </div>
            </div>

            {/* ── Report content — pure consumer of GET /api/reports/m1 ── */}
            <M1ReportView
                key={`${month}-${year}-${barangay}`}
                month={month}
                year={year}
                barangay={barangay || undefined}
            />
        </div>
    );
};

export default Reports;
