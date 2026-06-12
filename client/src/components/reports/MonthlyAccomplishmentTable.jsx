import React from 'react';
import { DOH_TARGET_COLUMNS, MONTHLY_GROUPS, formatCount, formatReportingPeriodLabel } from './reportConfig';

const FIRST_COLUMN_WIDTH = '12rem';
const HEADER_TOP = 0;
const SUBHEADER_TOP = 40;

const TARGET_GROUP = {
    label: 'Population / EP Targets',
    columns: DOH_TARGET_COLUMNS
};

const DISPLAY_GROUPS = [TARGET_GROUP, ...MONTHLY_GROUPS];

const getCellValue = (row, column) => row?.[column.key];

const DenseDohTable = ({ rows, scopeLabel, firstColumnLabel = 'Barangay' }) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const displayRows = safeRows.length ? safeRows : [{}];

    return (
        <div className="min-w-0 max-w-full overflow-hidden border-t border-slate-300">
            <div className="block max-h-[68vh] w-full max-w-full overflow-x-auto overflow-y-auto">
                <table className="min-w-[3100px] w-full border-collapse bg-white">
                    <thead>
                        <tr className="bg-[#064E3B]">
                            <th
                                rowSpan={2}
                                className="sticky left-0 border-b border-r border-emerald-800 bg-[#064E3B] px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-white shadow-[2px_0_0_0_#065f46]"
                                style={{ top: `${HEADER_TOP}px`, zIndex: 50, width: FIRST_COLUMN_WIDTH, minWidth: FIRST_COLUMN_WIDTH }}
                            >
                                {firstColumnLabel}
                            </th>
                            {DISPLAY_GROUPS.map((group) => (
                                <th
                                    key={group.label}
                                    colSpan={group.columns.length}
                                    className="sticky border-b border-r border-emerald-800 bg-[#064E3B] px-2.5 py-2 text-center text-[10px] font-black uppercase tracking-wide text-white"
                                    style={{ top: `${HEADER_TOP}px`, zIndex: 30 }}
                                >
                                    {group.label}
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-emerald-950">
                            {DISPLAY_GROUPS.flatMap((group) =>
                                group.columns.map((column) => (
                                    <th
                                        key={`${group.label}-${column.key}`}
                                        className="sticky border-b border-r border-emerald-800 bg-emerald-950 px-2 py-2 text-right text-[10px] font-black uppercase tracking-wide text-white"
                                        style={{ top: `${SUBHEADER_TOP}px`, zIndex: 30 }}
                                    >
                                        {column.label}
                                    </th>
                                ))
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((row, index) => {
                            const isTotal = String(row?.barangay || '').toUpperCase().includes('TOTAL');
                            const rowBg = isTotal ? 'bg-emerald-50' : index % 2 ? 'bg-slate-50' : 'bg-white';
                            const textTone = isTotal ? 'text-[#064E3B]' : 'text-slate-950';

                            return (
                                <tr key={`${row?.barangay || scopeLabel || 'barangay'}-${index}`} className={rowBg}>
                                    <td
                                        className={`sticky left-0 border-b border-r border-slate-200 px-3 py-2 text-xs font-black shadow-[2px_0_0_0_#e2e8f0] ${rowBg} ${textTone}`}
                                        style={{ width: FIRST_COLUMN_WIDTH, minWidth: FIRST_COLUMN_WIDTH, zIndex: 10 }}
                                    >
                                        {row?.barangay || scopeLabel || 'Assigned Barangay'}
                                    </td>
                                    {DISPLAY_GROUPS.flatMap((group) =>
                                        group.columns.map((column) => (
                                            <td
                                                key={`${group.label}-${column.key}`}
                                                className={`border-b border-r border-slate-200 px-2.5 py-2 text-right text-xs font-semibold ${textTone}`}
                                            >
                                                {formatCount(getCellValue(row, column))}
                                            </td>
                                        ))
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const MonthlyAccomplishmentTable = ({ report, mode = 'master', title }) => {
    const rows = report?.rows || [];
    const period = report?.period || {};
    const scope = report?.scope || {};
    const scopeLabel = scope?.label || scope?.barangay || 'Assigned Barangay';
    const isAnnual = period?.mode === 'ANNUAL' || period?.month === null;
    const periodLabel = formatReportingPeriodLabel(period?.month, period?.year);
    const eyebrow = isAnnual ? 'DOH Annual Accomplishment' : 'DOH Monthly Accomplishment';
    const resolvedTitle = title || (
        mode === 'master'
            ? (isAnnual ? 'Master Annual Accomplishment Table' : 'Master Accomplishment Table')
            : (isAnnual ? 'Barangay Annual Accomplishment' : 'Barangay Monthly Accomplishment')
    );

    return (
        <section className="min-w-0 border border-slate-300 bg-white">
            <div className="flex flex-col gap-1 border-b border-slate-300 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">{eyebrow}</p>
                <h3 className="text-lg font-black text-slate-950">{resolvedTitle}</h3>
                <p className="text-xs font-bold text-slate-500">
                    {scopeLabel} - {periodLabel}
                </p>
            </div>
            <DenseDohTable
                rows={rows}
                scopeLabel={scopeLabel}
                firstColumnLabel={mode === 'master' ? 'Barangay' : 'Barangay'}
            />
        </section>
    );
};

export default MonthlyAccomplishmentTable;
