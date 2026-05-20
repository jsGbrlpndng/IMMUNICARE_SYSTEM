import React from 'react';

/**
 * M1SectionCReport Component
 * 
 * Renders Section C of the DOH M1 Report (Child Care and Services).
 * Uses a side-by-side mirrored table layout with full-width domain headers.
 */
const M1SectionCReport = ({ report }) => {
    if (!report) return null;

    const { fic, cpab, vaccines: rawVaccines = [] } = report;

    const vaccines = rawVaccines.reduce((acc, v) => {
        acc[v.vaccine_code] = v;
        return acc;
    }, {});

    const IndicatorRow = ({ label, data, remark = "" }) => {
        const male = data?.male ?? "0";
        const female = data?.female ?? "0";
        const total = data?.total ?? "0";

        return (
            <tr className="border-b border-gray-300 h-8">
                <td className="px-2 py-1 text-[10px] leading-tight border-r border-gray-300 align-middle">
                    {label}
                </td>
                <td className="w-12 text-center text-[10px] border-r border-gray-300 align-middle font-medium text-slate-700">{male}</td>
                <td className="w-12 text-center text-[10px] border-r border-gray-300 align-middle font-medium text-slate-700">{female}</td>
                <td className="w-12 text-center text-[10px] border-r border-gray-300 bg-blue-50/50 font-bold text-blue-600 align-middle">{total}</td>
                <td className="px-2 py-1 text-[9px] align-middle text-slate-500 italic">{remark}</td>
            </tr>
        );
    };

    const SubsectionHeader = ({ title }) => (
        <tr className="bg-slate-100 border-b border-gray-300 font-bold text-slate-700">
            <td colSpan={5} className="px-2 py-1.5 text-[9px] uppercase tracking-wider">
                {title}
            </td>
        </tr>
    );

    const SectionTitle = ({ title }) => (
        <div className="bg-[#002060] text-white font-bold px-3 py-1.5 text-[11px] uppercase border-b border-gray-400 flex justify-between items-center">
            <span>{title}</span>
            <span className="text-[9px] font-normal opacity-80">(0-11 Months Only)</span>
        </div>
    );

    const TableHeader = () => (
        <thead className="bg-[#002060] text-white text-[10px] font-bold">
            <tr>
                <th rowSpan={2} className="w-[45%] px-2 py-1 border-r border-gray-400 text-left align-middle">Indicators</th>
                <th colSpan={3} className="w-[30%] px-2 py-0.5 border-r border-gray-400 border-b border-gray-400 text-center">Counts This Period</th>
                <th rowSpan={2} className="w-[25%] px-2 py-1 text-left align-middle">Scope/Remarks</th>
            </tr>
            <tr>
                <th className="w-[10%] px-1 py-0.5 border-r border-gray-400 text-center font-normal opacity-90">Male</th>
                <th className="w-[10%] px-1 py-0.5 border-r border-gray-400 text-center font-normal opacity-90">Female</th>
                <th className="w-[10%] px-1 py-0.5 border-r border-gray-400 text-center">Total</th>
            </tr>
        </thead>
    );

    return (
        <div className="doh-m1-section-c bg-white text-gray-900 border border-gray-400 shadow-sm print:shadow-none print:border-none rounded-xl overflow-hidden">
            <div className="bg-[#002060] text-white text-center py-2 font-bold text-sm uppercase tracking-widest">
                IMMUNIZATION SUMMARY
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* LEFT COLUMN: Core Base Series */}
                <div className="border-r border-gray-400">
                    <table className="w-full table-fixed border-collapse">
                        <TableHeader />
                        <tbody>
                            <SubsectionHeader title="Core Base Indicators" />
                            <IndicatorRow label="Children protected at birth (CPAB)" data={cpab} remark="Protected at Birth" />
                            <IndicatorRow label="BCG (Birth)" data={vaccines['BCG']} remark=" administered < 1 yr" />
                            <IndicatorRow label="Hepatitis B (BD)" data={vaccines['HEPB-BD']} remark="with in 24 hrs" />

                            <SubsectionHeader title="Pentavalent & Oral Polio (Doses 1-3)" />
                            <IndicatorRow label="Penta 1 (DPT-HiB-HepB 1)" data={vaccines['PENTA-1']} />
                            <IndicatorRow label="Penta 2 (DPT-HiB-HepB 2)" data={vaccines['PENTA-2']} />
                            <IndicatorRow label="Penta 3 (DPT-HiB-HepB 3)" data={vaccines['PENTA-3']} />
                            <IndicatorRow label="OPV 1 (Oral Polio 1)" data={vaccines['OPV-1']} />
                            <IndicatorRow label="OPV 2 (Oral Polio 2)" data={vaccines['OPV-2']} />
                            <IndicatorRow label="OPV 3 (Oral Polio 3)" data={vaccines['OPV-3']} />
                        </tbody>
                    </table>
                </div>

                {/* RIGHT COLUMN: Advanced & Completion */}
                <div>
                    <table className="w-full table-fixed border-collapse">
                        <TableHeader />
                        <tbody>
                            <SubsectionHeader title="Inactivated Polio & Measles" />
                            <IndicatorRow label="IPV 1 (Inactivated Polio 1)" data={vaccines['IPV-1']} />
                            <IndicatorRow label="MCV 1 (Measles/MMR 1)" data={vaccines['MCV1']} remark="at 9 months" />

                            <SubsectionHeader title="Cumulative Completion Status" />
                            <IndicatorRow
                                label="FULLY IMMUNIZED CHILD (FIC)"
                                data={fic}
                                remark="Complete Core Series (<12 mos)"
                            />

                            <tr className="h-8 border-b border-gray-300">
                                <td colSpan={5} className="bg-slate-50 px-3 py-4 text-[10px] text-slate-400 italic leading-relaxed">
                                    * Note: This report focuses exclusively on infants 0-11 months old.
                                    Indicators for children 12-23 months (CIC) and school-based immunizations
                                    are not tracked in this module.
                                </td>
                            </tr>
                            {/* Empty spacers to align heights */}
                            <tr className="h-8 border-b border-gray-300"><td></td><td colSpan={4} className="bg-gray-50/50"></td></tr>
                            <tr className="h-8 border-b border-gray-300"><td></td><td colSpan={4} className="bg-gray-50/50"></td></tr>
                            <tr className="h-8 border-b border-gray-300"><td></td><td colSpan={4} className="bg-gray-50/50"></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <style jsx="true">{`
                @media screen {
                    .doh-m1-section-c { 
                        font-family: 'Inter', sans-serif;
                        max-width: 1240px;
                        margin: 0 auto;
                    }
                }
                @media print {
                    @page { 
                        size: A4 landscape; 
                        margin: 0.2in;
                    }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .doh-m1-section-c {
                        font-family: 'Arial', 'Helvetica', sans-serif !important;
                        width: 100% !important;
                        border: 1px solid black !important;
                    }
                    thead { display: table-header-group; }
                    .doh-m1-section-c td, .doh-m1-section-c th {
                        border: 1px solid black !important;
                    }
                    .bg-[#002060] { background-color: #002060 !important; color: white !important; }
                    .bg-gray-200 { background-color: #e5e7eb !important; }
                    .bg-gray-100 { background-color: #f3f4f6 !important; }
                    tr { page-break-inside: avoid; break-inside: avoid; }
                    .grid { display: grid !important; grid-template-columns: 1fr 1fr !important; }
                    header, footer, nav { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default M1SectionCReport;
