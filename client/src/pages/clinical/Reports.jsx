import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';

const toDateInputValue = (date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
};

const formatDisplayDate = (value) => {
    if (!value) return '-';
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const getThisMonthRange = () => {
    const now = new Date();
    return {
        startDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: toDateInputValue(now)
    };
};

const getLastMonthRange = () => {
    const now = new Date();
    return {
        startDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 0))
    };
};

const getYearToDateRange = () => {
    const now = new Date();
    return {
        startDate: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
        endDate: toDateInputValue(now)
    };
};

const QUICK_RANGES = {
    this_month: { label: 'This Month', getRange: getThisMonthRange },
    last_month: { label: 'Last Month', getRange: getLastMonthRange },
    ytd: { label: 'Year to Date', getRange: getYearToDateRange },
    custom: { label: 'Custom Range', getRange: getThisMonthRange }
};

const NIP_VACCINE_MASTER_LIST = [
    { code: 'BCG', name: 'BCG' },
    { code: 'HEPB', name: 'Hepatitis B Birth Dose' },
    { code: 'PENTA-1', name: 'Pentavalent 1' },
    { code: 'PENTA-2', name: 'Pentavalent 2' },
    { code: 'PENTA-3', name: 'Pentavalent 3' },
    { code: 'OPV-1', name: 'Oral Polio Vaccine 1' },
    { code: 'OPV-2', name: 'Oral Polio Vaccine 2' },
    { code: 'OPV-3', name: 'Oral Polio Vaccine 3' },
    { code: 'IPV-1', name: 'Inactivated Polio Vaccine 1' },
    { code: 'IPV-2', name: 'Inactivated Polio Vaccine 2' },
    { code: 'MCV-1', name: 'Measles-Containing Vaccine 1' },
    { code: 'MCV-2', name: 'Measles-Containing Vaccine 2' }
];

const emptySexTotals = { male: 0, female: 0, total: 0 };
const SAN_PEDRO_GREEN = [6, 95, 70];
const DARK_TEXT = [31, 41, 55];
const MUTED_TEXT = [100, 116, 139];

const Reports = () => {
    const { user } = useAuth();
    const assignedBarangay = user?.assigned_barangay || user?.barangay || 'Municipality';
    const generatedBy = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || 'Authenticated User';

    const initialRange = useMemo(() => getThisMonthRange(), []);
    const [rangeMode, setRangeMode] = useState('this_month');
    const [startDate, setStartDate] = useState(initialRange.startDate);
    const [endDate, setEndDate] = useState(initialRange.endDate);
    const [rows, setRows] = useState([]);
    const [metrics, setMetrics] = useState({
        registered: emptySexTotals,
        cpab: emptySexTotals,
        fic: emptySexTotals
    });
    const [forecastRows, setForecastRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const title = `IMMUNIZATION SUMMARY - ${assignedBarangay.toUpperCase()}`;
    const exportTitle = `IMMUNIZATION SUMMARY & RESTOCK FORECAST - BARANGAY ${assignedBarangay.toUpperCase()}`;

    const tableRows = useMemo(() => {
        const rowMap = new Map((rows || []).map(row => [row.vaccine_code, row]));

        return NIP_VACCINE_MASTER_LIST.map(vaccine => {
            const match = rowMap.get(vaccine.code);
            return {
                vaccine_code: vaccine.code,
                vaccine_name: vaccine.name,
                male: Number(match?.male || 0),
                female: Number(match?.female || 0),
                total: Number(match?.total || 0)
            };
        });
    }, [rows]);

    const displayTotals = useMemo(() => tableRows.reduce((acc, row) => ({
        male: acc.male + row.male,
        female: acc.female + row.female,
        total: acc.total + row.total
    }), { male: 0, female: 0, total: 0 }), [tableRows]);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams({ startDate, endDate });
            const response = await apiClient.get(`/reports/immunization-summary?${params.toString()}`);

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.error || `Report request failed with HTTP ${response.status}`);
            }

            const payload = await response.json();
            setRows(payload.data || []);
            setMetrics({
                registered: payload.metrics?.registered || emptySexTotals,
                cpab: payload.metrics?.cpab || emptySexTotals,
                fic: payload.metrics?.fic || emptySexTotals
            });
            setForecastRows(payload.forecast?.data || []);
        } catch (err) {
            console.error('[Reports] Failed to fetch immunization summary:', err);
            setRows([]);
            setForecastRows([]);
            setMetrics({
                registered: emptySexTotals,
                cpab: emptySexTotals,
                fic: emptySexTotals
            });
            setError(err.message || 'Unable to load report data.');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleQuickRangeChange = (mode) => {
        setRangeMode(mode);
        if (mode !== 'custom') {
            const range = QUICK_RANGES[mode].getRange();
            setStartDate(range.startDate);
            setEndDate(range.endDate);
        }
    };

    const exportToPdf = async () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const generatedOn = new Date();
        const generatedOnText = generatedOn.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 40;
        const contentWidth = pageWidth - marginX * 2;
        const pageHeight = doc.internal.pageSize.getHeight();
        const reportId = `FHSIS-${assignedBarangay}-${startDate}-${endDate}`.replace(/\s+/g, '-').toUpperCase();
        const auditUrl = `${window.location.origin}/clinical/reports`;
        const cardGap = 10;
        const cardWidth = (contentWidth - cardGap * 2) / 3;
        const cardY = 128;
        const cardHeight = 58;
        const cardData = [
            {
                label: 'TOTAL REGISTERED INFANTS',
                value: metrics.registered.total,
                note: `Male ${metrics.registered.male} / Female ${metrics.registered.female}`
            },
            {
                label: 'CPAB',
                value: metrics.cpab.total,
                note: 'Child Protected at Birth'
            },
            {
                label: 'FIC',
                value: metrics.fic.total,
                note: 'Fully Immunized Child'
            }
        ];

        doc.setTextColor(...DARK_TEXT);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('ImmuniCare Clinical System', marginX, 42);

        doc.setTextColor(...SAN_PEDRO_GREEN);
        doc.setFontSize(11);
        doc.text(exportTitle, marginX, 64, { maxWidth: contentWidth });

        doc.setTextColor(...MUTED_TEXT);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Locality: Barangay ${assignedBarangay}, San Pedro, Laguna`, marginX, 86);
        doc.text(`Report Period: ${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`, marginX, 102);
        doc.text(`Generated On: ${generatedOnText}`, marginX, 118);
        doc.text(`Generated By: ${generatedBy} / ${user?.role || 'User'}`, 320, 118);

        cardData.forEach((card, index) => {
            const x = marginX + index * (cardWidth + cardGap);
            doc.setFillColor(index === 0 ? 248 : 236, index === 0 ? 250 : 253, index === 0 ? 252 : 245);
            doc.setDrawColor(index === 0 ? 203 : 167, index === 0 ? 213 : 243, index === 0 ? 225 : 208);
            doc.roundedRect(x, cardY, cardWidth, cardHeight, 4, 4, 'FD');
            doc.setTextColor(index === 0 ? MUTED_TEXT[0] : SAN_PEDRO_GREEN[0], index === 0 ? MUTED_TEXT[1] : SAN_PEDRO_GREEN[1], index === 0 ? MUTED_TEXT[2] : SAN_PEDRO_GREEN[2]);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.text(card.label, x + 12, cardY + 17);
            doc.setTextColor(index === 0 ? DARK_TEXT[0] : SAN_PEDRO_GREEN[0], index === 0 ? DARK_TEXT[1] : SAN_PEDRO_GREEN[1], index === 0 ? DARK_TEXT[2] : SAN_PEDRO_GREEN[2]);
            doc.setFontSize(20);
            doc.text(String(card.value || 0), x + 12, cardY + 40);
            doc.setFontSize(8);
            doc.text(card.note, x + 58, cardY + 39, { maxWidth: cardWidth - 68 });
        });

        doc.setTextColor(...DARK_TEXT);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('FHSIS IMMUNIZATION SUMMARY', marginX, 210);

        autoTable(doc, {
            startY: 220,
            head: [['Vaccine Code', 'Vaccine Type', 'Male', 'Female', 'Total']],
            body: tableRows.map(row => [
                row.vaccine_code || '-',
                row.vaccine_name || row.vaccine_code || '-',
                row.male,
                row.female,
                row.total
            ]),
            foot: [['', 'TOTAL', displayTotals.male, displayTotals.female, displayTotals.total]],
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: 5,
                lineColor: [203, 213, 225],
                lineWidth: 0.5
            },
            headStyles: {
                fillColor: SAN_PEDRO_GREEN,
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            footStyles: {
                fillColor: [236, 253, 245],
                textColor: [15, 23, 42],
                fontStyle: 'bold'
            },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 40, right: 40, bottom: 50 }
        });

        const forecastStartY = (doc.lastAutoTable?.finalY || 220) + 28;
        doc.setTextColor(...SAN_PEDRO_GREEN);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('30-DAY ANTIGEN DEMAND FORECAST', marginX, forecastStartY);

        autoTable(doc, {
            startY: forecastStartY + 10,
            head: [['Vaccine Name', 'Doses Required']],
            body: forecastRows.length
                ? forecastRows.map(row => [
                    row.vaccine_name || row.vaccine_code || '-',
                    Number(row.doses_required || 0)
                ])
                : [['No upcoming antigen demand', 0]],
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: 5,
                lineColor: [203, 213, 225],
                lineWidth: 0.5
            },
            headStyles: {
                fillColor: SAN_PEDRO_GREEN,
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            columnStyles: {
                1: { halign: 'right', cellWidth: 110 }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 40, right: 40, bottom: 50 }
        });

        const totalPages = doc.internal.getNumberOfPages();
        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            doc.setPage(pageNumber);
            doc.setDrawColor(226, 232, 240);
            doc.line(marginX, pageHeight - 36, pageWidth - marginX, pageHeight - 36);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...MUTED_TEXT);
            doc.text(`${auditUrl} | Report ID: ${reportId}`, marginX, pageHeight - 20);
            doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - marginX, pageHeight - 20, { align: 'right' });
        }

        doc.save(`immunicare-immunization-summary-${assignedBarangay}-${startDate}-to-${endDate}.pdf`);

        try {
            await apiClient.post('/reports/exports', {
                report_type: 'IMMUNIZATION_SUMMARY',
                format: 'PDF',
                filter_params: { startDate, endDate, barangay: assignedBarangay, metrics, forecastRows, reportId },
                file_path: null
            });
        } catch (err) {
            console.warn('[Reports] Export audit logging failed:', err);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-md p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-md flex items-center justify-center border border-emerald-100">
                            <FileText className="w-5 h-5 text-emerald-800" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">{title}</h1>
                            <p className="text-xs font-semibold text-slate-500 mt-1">
                                Completed administered doses only. Barangay-scoped DOH/FHSIS count.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={exportToPdf}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                        <Download className="w-4 h-4" />
                        Export to PDF
                    </button>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(QUICK_RANGES).map(([mode, config]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => handleQuickRangeChange(mode)}
                                className={`rounded-md border px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                                    rangeMode === mode
                                        ? 'border-emerald-800 bg-emerald-800 text-white'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-900'
                                }`}
                            >
                                {config.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => {
                                    setRangeMode('custom');
                                    setStartDate(event.target.value);
                                }}
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-800"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => {
                                    setRangeMode('custom');
                                    setEndDate(event.target.value);
                                }}
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-800"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={fetchReport}
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Registered Infants</p>
                        <p className="mt-2 text-2xl font-black text-slate-900">{metrics.registered.total}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">Male {metrics.registered.male} / Female {metrics.registered.female}</p>
                    </div>
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">CPAB</p>
                        <p className="mt-2 text-2xl font-black text-emerald-900">{metrics.cpab.total}</p>
                        <p className="mt-1 text-[11px] font-semibold text-emerald-700">Child Protected at Birth</p>
                    </div>
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">FIC</p>
                        <p className="mt-2 text-2xl font-black text-emerald-900">{metrics.fic.total}</p>
                        <p className="mt-1 text-[11px] font-semibold text-emerald-700">MCV-1 before first birthday</p>
                    </div>
                </div>

                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600">
                        <CalendarDays className="w-4 h-4 text-emerald-800" />
                        {formatDisplayDate(startDate)} to {formatDisplayDate(endDate)}
                    </div>
                    {loading && (
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading
                        </span>
                    )}
                </div>

                {error ? (
                    <div className="px-5 py-8 text-sm font-semibold text-red-700 bg-red-50">{error}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="bg-emerald-800 text-white">
                                <tr>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest">Vaccine Code</th>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest">Vaccine Type</th>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-right">Male</th>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-right">Female</th>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tableRows.map((row) => (
                                    <tr key={`${row.vaccine_code}-${row.vaccine_name}`} className="hover:bg-emerald-50/40">
                                        <td className="px-5 py-3 text-xs font-black text-slate-700">{row.vaccine_code}</td>
                                        <td className="px-5 py-3 text-xs font-semibold text-slate-700">{row.vaccine_name}</td>
                                        <td className="px-5 py-3 text-xs font-black text-slate-800 text-right">{row.male}</td>
                                        <td className="px-5 py-3 text-xs font-black text-slate-800 text-right">{row.female}</td>
                                        <td className="px-5 py-3 text-xs font-black text-emerald-800 text-right">{row.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-emerald-50 border-t border-emerald-100">
                                <tr>
                                    <td className="px-5 py-3 text-xs font-black text-slate-800" colSpan={2}>TOTAL</td>
                                    <td className="px-5 py-3 text-xs font-black text-slate-900 text-right">{displayTotals.male}</td>
                                    <td className="px-5 py-3 text-xs font-black text-slate-900 text-right">{displayTotals.female}</td>
                                    <td className="px-5 py-3 text-xs font-black text-emerald-900 text-right">{displayTotals.total}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">30-Day Restock Forecast</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Upcoming antigen demand based on scheduled doses in the next 30 days.</p>
                    </div>
                    {loading && (
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading
                        </span>
                    )}
                </div>

                {error ? (
                    <div className="px-5 py-8 text-sm font-semibold text-red-700 bg-red-50">{error}</div>
                ) : forecastRows.length === 0 ? (
                    <div className="px-5 py-8 text-sm font-semibold text-slate-500">
                        No upcoming doses required for the next 30 days.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="bg-emerald-800 text-white">
                                <tr>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest">Vaccine Name</th>
                                    <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-right">Doses Required</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {forecastRows.map((row) => (
                                    <tr key={`${row.vaccine_code || row.vaccine_name}-forecast`} className="hover:bg-emerald-50/40">
                                        <td className="px-5 py-3 text-xs font-semibold text-slate-700">
                                            {row.vaccine_name || row.vaccine_code || '-'}
                                        </td>
                                        <td className="px-5 py-3 text-xs font-black text-emerald-800 text-right">
                                            {Number(row.doses_required || 0)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;
