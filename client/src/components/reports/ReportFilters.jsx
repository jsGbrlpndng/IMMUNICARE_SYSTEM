import React from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { MONTHS, SAN_PEDRO_BARANGAYS } from './reportConfig';

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 7 }, (_, index) => currentYear - index);

const SelectField = ({ label, value, onChange, children, disabled = false }) => (
    <label className="flex flex-col gap-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
        <select
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="h-10 min-w-36 border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#064E3B] disabled:bg-slate-100 disabled:text-slate-500"
        >
            {children}
        </select>
    </label>
);

const ReportFilters = ({
    month,
    year,
    barangay = 'all',
    onMonthChange,
    onYearChange,
    onBarangayChange,
    showBarangay = true,
    lockBarangay = false,
    assignedBarangay = ''
}) => (
    <section className="border border-slate-300 bg-white">
        <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">Report Controls</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">NIP Reporting Period</h2>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <SelectField
                    label="Month"
                    value={month}
                    onChange={(event) => onMonthChange?.(Number(event.target.value))}
                >
                    {MONTHS.map((label, index) => (
                        <option key={label} value={index + 1}>{label}</option>
                    ))}
                </SelectField>
                <SelectField
                    label="Year"
                    value={year}
                    onChange={(event) => onYearChange?.(Number(event.target.value))}
                >
                    {yearOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </SelectField>
                {showBarangay ? (
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Barangay</span>
                        <div className="flex h-10 items-center border border-slate-300 bg-white px-3">
                            <MapPin className="mr-2 h-4 w-4 text-[#064E3B]" />
                            <select
                                value={barangay || 'all'}
                                onChange={(event) => onBarangayChange?.(event.target.value)}
                                disabled={lockBarangay}
                                className="min-w-56 bg-transparent text-sm font-bold text-slate-950 outline-none disabled:text-slate-500"
                            >
                                <option value="all">RHU 2 - All Barangays</option>
                                {SAN_PEDRO_BARANGAYS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>
                    </label>
                ) : assignedBarangay ? (
                    <div className="flex h-10 items-center gap-2 border border-slate-300 bg-slate-100 px-3 text-sm font-black text-slate-700">
                        <MapPin className="h-4 w-4 text-slate-500" />
                        {assignedBarangay}
                    </div>
                ) : null}
                <div className="flex h-10 items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase tracking-wider text-[#064E3B]">
                    <CalendarDays className="h-4 w-4" />
                    {MONTHS[Number(month || 1) - 1]} {year}
                </div>
            </div>
        </div>
    </section>
);

export default ReportFilters;
