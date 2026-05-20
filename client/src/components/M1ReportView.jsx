/**
 * M1ReportView
 *
 * Pure consumer of GET /api/reports/m1.
 * No client-side aggregation — every number shown comes directly from the API response.
 *
 * Props:
 *   month      {number}  1-12 (undefined = current month)
 *   year       {number}  YYYY (undefined = current year)
 *   barangay   {string}  optional barangay filter
 *   onForbidden {func}   called when API returns 403 (BHW guard)
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Printer, AlertTriangle, RefreshCw } from 'lucide-react';
import apiClient from '../services/apiClient';
import M1SectionCReport from './M1SectionCReport';

const M1ReportView = ({ month, year, barangay, onForbidden }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [forbidden, setForbidden] = useState(false);

    const buildQuery = useCallback(() => {
        const params = new URLSearchParams();
        if (month) params.set('month', month);
        if (year) params.set('year', year);
        if (barangay) params.set('barangay', barangay);
        const qs = params.toString();
        return qs ? `/reports/m1?${qs}` : '/reports/m1';
    }, [month, year, barangay]);

    useEffect(() => {
        let cancelled = false;

        const fetchReport = async () => {
            setLoading(true);
            setError(null);
            setForbidden(false);

            try {
                const res = await apiClient.get(buildQuery());
                if (cancelled) return;

                if (res.status === 403) {
                    setForbidden(true);
                    if (onForbidden) onForbidden();
                    // Redirect BHW to their dashboard after a brief pause
                    setTimeout(() => navigate('/bhw/dashboard', { replace: true }), 2500);
                    return;
                }

                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `HTTP ${res.status}`);
                }

                const data = await res.json();
                setReport(data);
            } catch (err) {
                if (cancelled) return;
                // 403 thrown as error by apiClient
                if (err.message.toLowerCase().includes('forbidden')) {
                    setForbidden(true);
                    if (onForbidden) onForbidden();
                    setTimeout(() => navigate('/bhw/dashboard', { replace: true }), 2500);
                    return;
                }
                setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchReport();
        return () => { cancelled = true; };
    }, [buildQuery, navigate, onForbidden]);

    // ── Loading ──────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-10 h-10 border-4 border-blue-100 border-t-[#0061FF] rounded-full animate-spin" />
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Loading M1 Report…
                </p>
            </div>
        );
    }

    // ── Forbidden (BHW hit URL directly) ────────────────────────────────────
    if (forbidden) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <div>
                    <p className="font-bold text-slate-800 text-lg">Not Authorized</p>
                    <p className="text-slate-500 text-sm mt-1">
                        M1 Report access is restricted to Midwife, Nurse, and Admin only.
                    </p>
                    <p className="text-slate-400 text-xs mt-2">Redirecting you back to your dashboard…</p>
                </div>
            </div>
        );
    }

    // ── Error ────────────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <div>
                    <p className="font-bold text-slate-800">Could not load M1 Report</p>
                    <p className="text-slate-500 text-sm mt-1">{error}</p>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 text-sm text-[#0061FF] hover:underline"
                >
                    <RefreshCw className="w-4 h-4" /> Retry
                </button>
            </div>
        );
    }

    if (!report) return null;

    const { fic, cpab, vaccines, report_month, generated_at, ipv1_tracked } = report;

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* ── Action bar (hidden on print) ─────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 leading-tight">
                        Infant Immunization Summary (0–11 Months)
                        <br />
                        <span className="text-[#0061FF] text-lg font-semibold tracking-normal">— M1 Infant Portion</span>
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Focused exclusively on newborns and infants in their first year of life.
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                        Period: <span className="font-semibold text-slate-700">{report_month}</span>
                        {barangay && (
                            <> · Barangay: <span className="font-semibold text-slate-700">{barangay}</span></>
                        )}
                        {' '}· Generated {new Date(generated_at).toLocaleString()}
                    </p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#0061FF] text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 print:hidden shrink-0 h-fit"
                >
                    <Printer className="w-4 h-4" />
                    Print / Export PDF
                </button>
            </div>

            {/* ── FIC / CPAB Summary Cards (Reduced for print space) ────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-2">
                {/* FIC */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm print:p-3 print:rounded-none print:border-gray-400">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-[8px]">
                        Fully Immunized Child (FIC)
                    </p>
                    <p className="text-[10px] text-slate-400 mb-4 print:hidden">
                        Infants &lt;12 months who received all required doses
                        {!ipv1_tracked && <span className="ml-1 text-amber-500">(IPV-1 not tracked)</span>}
                    </p>
                    <div className="flex items-end gap-6 print:gap-4">
                        <div className="text-center">
                            <p className="text-3xl font-black text-slate-900 print:text-lg">{fic.male}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mt-1 print:text-[7px]">Male</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-black text-slate-900 print:text-lg">{fic.female}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mt-1 print:text-[7px]">Female</p>
                        </div>
                        <div className="text-center ml-auto">
                            <p className="text-4xl font-black text-[#0061FF] print:text-xl">{fic.total}</p>
                            <p className="text-[10px] text-[#0061FF] uppercase font-bold mt-1 print:text-[7px]">Total</p>
                        </div>
                    </div>
                </div>

                {/* CPAB */}
                <div className="bg-white border border-emerald-100 rounded-xl p-6 shadow-sm print:p-3 print:rounded-none print:border-gray-400">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 print:text-[8px]">
                        Child Protected at Birth (CPAB)
                    </p>
                    <p className="text-[10px] text-slate-400 mb-4 print:hidden">
                        Infants whose mothers were protected from tetanus
                    </p>
                    <div className="flex items-end gap-6 print:gap-4">
                        <div className="text-center">
                            <p className="text-3xl font-black text-slate-900 print:text-lg">{cpab.male}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mt-1 print:text-[7px]">Male</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-black text-slate-900 print:text-lg">{cpab.female}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mt-1 print:text-[7px]">Female</p>
                        </div>
                        <div className="text-center ml-auto">
                            <p className="text-4xl font-black text-emerald-500 print:text-xl">{cpab.total}</p>
                            <p className="text-[10px] text-emerald-600 uppercase font-bold mt-1 print:text-[7px]">Total</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Section C: Child Care and Services ───────────────────────── */}
            <M1SectionCReport report={report} />

            {/* ── Print-only footer (hidden on screen) ─────────────────── */}
            <div className="hidden print:block text-center py-2 border-t border-gray-300 mt-4">
                <p className="text-[8px] italic">Generated by ImmuniCare Health Information System · {new Date(generated_at).toISOString()}</p>
            </div>


        </div>
    );
};

export default M1ReportView;
