import React from 'react';
import { MONTHLY_COLUMNS, MONTHLY_GROUPS, formatCount } from './reportConfig';

const cellClass = 'border-b border-r border-slate-200 px-2.5 py-2 text-right text-xs font-semibold text-slate-900';
const headerClass = 'border-b border-r border-emerald-800 px-2.5 py-2 text-center text-[10px] font-black uppercase tracking-wide text-white';

const EmptyRows = ({ colSpan }) => (
    <tr>
        <td colSpan={colSpan} className="border-b border-slate-200 px-4 py-10 text-center text-sm font-bold text-slate-500">
            No report rows available for this period.
        </td>
    </tr>
);

const DenseDohTable = ({ rows, scopeLabel, firstColumnLabel = 'Barangay / Month', showPersonnel = false }) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const displayRows = safeRows.length ? safeRows : [{}];

    return (
        <div className="max-h-[68vh] max-w-full overflow-x-auto overflow-y-auto border-t border-slate-300">
            <table className={`${showPersonnel ? 'min-w-[2820px]' : 'min-w-[2600px]'} w-full border-collapse bg-white`}>
                <thead className="sticky top-0 z-20">
                    <tr className="bg-[#064E3B]">
                        <th rowSpan={2} className="sticky left-0 z-30 w-44 min-w-44 border-b border-r border-emerald-800 bg-[#064E3B] px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-white">
                            {firstColumnLabel}
                        </th>
                        {showPersonnel ? (
                            <th rowSpan={2} className="sticky left-44 z-30 w-56 min-w-56 border-b border-r border-emerald-800 bg-[#064E3B] px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-white">
                                Assigned Midwife/Nurse
                            </th>
                        ) : null}
                        {MONTHLY_GROUPS.map((group) => (
                            <th key={group.label} colSpan={group.columns.length} className={headerClass}>
                                {group.label}
                            </th>
                        ))}
                    </tr>
                    <tr className="bg-emerald-950">
                        {MONTHLY_COLUMNS.map((column) => (
                            <th key={column.key} className="border-b border-r border-emerald-800 px-2 py-2 text-right text-[10px] font-black uppercase tracking-wide text-white">
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {displayRows.map((row, index) => {
                        const isTotal = String(row?.barangay || '').toUpperCase().includes('TOTAL');
                        return (
                            <tr key={`${row?.barangay || scopeLabel || 'barangay'}-${index}`} className={isTotal ? 'bg-emerald-50' : index % 2 ? 'bg-slate-50' : 'bg-white'}>
                                <td className={`sticky left-0 z-10 w-44 min-w-44 border-b border-r border-slate-200 bg-inherit px-3 py-2 text-xs font-black ${isTotal ? 'text-[#064E3B]' : 'text-slate-950'}`}>
                                    {row?.barangay || scopeLabel || 'Assigned Barangay'}
                                </td>
                                {showPersonnel ? (
                                    <td className={`sticky left-44 z-10 w-56 min-w-56 border-b border-r border-slate-200 bg-inherit px-3 py-2 text-xs font-bold ${isTotal ? 'text-[#064E3B]' : 'text-slate-800'}`}>
                                        {row?.assigned_personnel || (isTotal ? 'RHU 2 Aggregate' : 'Unassigned')}
                                    </td>
                                ) : null}
                                {MONTHLY_COLUMNS.map((column) => (
                                    <td key={column.key} className={`${cellClass} ${isTotal ? 'font-black text-[#064E3B]' : ''}`}>
                                        {formatCount(row?.[column.key])}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const MonthlyAccomplishmentTable = ({ report, mode = 'master', title }) => {
    const rows = report?.rows || [];
    const period = report?.period || {};
    const scope = report?.scope || {};
    const scopeLabel = scope?.label || scope?.barangay || 'Assigned Barangay';
    const showPersonnel = mode === 'master';

    return (
        <section className="min-w-0 border border-slate-300 bg-white">
            <div className="flex flex-col gap-1 border-b border-slate-300 px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">DOH Monthly Accomplishment</p>
                <h3 className="text-lg font-black text-slate-950">{title || (mode === 'master' ? 'Master Accomplishment Table' : 'Barangay Monthly Accomplishment')}</h3>
                <p className="text-xs font-bold text-slate-500">
                    {scopeLabel} · {period?.month_label || ''} {period?.year || ''}
                </p>
            </div>
            <DenseDohTable
                rows={rows}
                scopeLabel={scopeLabel}
                firstColumnLabel={mode === 'master' ? 'Barangay' : 'Barangay / Month'}
                showPersonnel={showPersonnel}
            />
        </section>
    );
};

export default MonthlyAccomplishmentTable;
