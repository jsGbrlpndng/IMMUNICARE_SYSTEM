import React from 'react';
import {
    Calendar,
    Syringe,
    AlertCircle,
    CheckCircle2,
    Clock
} from 'lucide-react';
import { formatDate, getDoseTimingStatus } from '../utils/formatters';
import StatusBadge from './common/StatusBadge';
import { normalizeClinicalStatus } from '../utils/clinicalStatus';

const prepareScheduleForDisplay = (scheduleData) => {
    // Determine the array to map over. In the new merged API, it's passed directly or as schedule.record
    const recordArray = Array.isArray(scheduleData) ? scheduleData : (scheduleData?.record || []);
    if (!recordArray.length) return [];

    const urgencyOrder = { overdue: 0, due_today: 1, due_soon: 2, pending_validation: 3, scheduled: 4, ineligible: 5, administered: 6 };

    return recordArray.map(v => {
        const vaxStatus = v.status || 'NOT_GIVEN';
        let timingStatus = getDoseTimingStatus(v.recommended_date || v.dueDate, vaxStatus);

        // Normalize: the DB returns UPPER_CASE, the frontend historically used lowercase.
        const scheduleStatus = (v.original_schedule_status || '').toUpperCase();

        let urgency = 'scheduled';
        if (vaxStatus === 'COMPLETED_VALIDATED' || vaxStatus === 'COMPLETED') {
            urgency = 'administered';
        } else if (vaxStatus === 'PENDING_VALIDATION') {
            urgency = 'pending_validation';
        } else {
            if (scheduleStatus === 'DEFAULTER' || scheduleStatus === 'DEFAULTED' || scheduleStatus === 'OVERDUE') urgency = 'overdue';
            else if (scheduleStatus === 'DUE_TODAY' || scheduleStatus === 'DUE')                                  urgency = 'due_today';
            else if (scheduleStatus === 'DUE_SOON')                                                               urgency = 'due_soon';
            else if (scheduleStatus === 'INELIGIBLE')                                                             urgency = 'ineligible';
            else                                                                                                  urgency = 'scheduled';
        }

        return {
            vaccineCode: v.vaccine_code || v.vaccineCode,
            vaccineName: v.vaccine_name || v.vaccineName,
            doseNumber: v.dose_number || v.doseNumber || 1,
            scheduleId: v.schedule_id || v.scheduleId,
            infantId: v.infant_id || v.infantId,
            dueDate: v.recommended_date || v.dueDate,
            administeredDate: v.actual_date || v.administeredDate,
            targetAge: v.target_age || v.targetAge || null,
            urgency: urgency,
            scheduleStatus,
            clinical_status: normalizeClinicalStatus({
                computed_schedule_status: scheduleStatus,
                urgency
            }),
            timingStatus,
            vaxStatus,
            vaccinationId: v.vaccination_id || v.vaccinationId
        };
    }).sort((a, b) => {
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        }
        return new Date(a.dueDate || a.administeredDate) - new Date(b.dueDate || b.administeredDate);
    });
};

const NipScheduleTable = ({ schedule, isClinicalStaff, onRecordClick, registrationStatus, userRole, onApproveClick }) => {
    const allVaccines = prepareScheduleForDisplay(schedule);
    const canApprove = userRole === 'Midwife';

    return (
        <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">NIP Monitoring</p>
                        <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950">
                            <Syringe className="h-5 w-5 text-[#064E3B]" />
                            Vaccination Schedule
                        </h2>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {allVaccines.length} scheduled dose{allVaccines.length === 1 ? '' : 's'}
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <tr>
                            <th className="border-b border-slate-200 px-5 py-3">Vaccine / Dose</th>
                            <th className="border-b border-slate-200 px-5 py-3">Age Window</th>
                            <th className="border-b border-slate-200 px-5 py-3">Recommended Date</th>
                            <th className="border-b border-slate-200 px-5 py-3">Status</th>
                            <th className="border-b border-slate-200 px-5 py-3">Actual Date</th>
                            <th className="border-b border-slate-200 px-5 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {allVaccines.map((vax, idx) => {
                            const isCompleted = vax.urgency === 'administered' && vax.administeredDate;
                            const isIneligible = vax.urgency === 'ineligible' || vax.scheduleStatus === 'INELIGIBLE';

                            return (
                                <tr key={idx} className="transition duration-150 hover:bg-emerald-50/30">
                                    <td className="px-5 py-3">
                                        <p className="text-sm font-black text-slate-950">{vax.vaccineName}</p>
                                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Dose #{vax.doseNumber}</p>
                                    </td>
                                    <td className="px-5 py-3 text-xs font-bold text-slate-600">
                                        {vax.targetAge || '--'}
                                    </td>
                                    <td className="px-5 py-3 text-xs font-bold text-slate-600">
                                        {formatDate(vax.dueDate)}
                                    </td>
                                    <td className="px-5 py-3">
                                        <StatusBadge record={vax} />
                                    </td>
                                    <td className="px-5 py-3 text-xs font-black text-slate-900">
                                        {isCompleted ? formatDate(vax.administeredDate) : '-'}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {(() => {
                                            if (isIneligible) {
                                                return (
                                                    <span className="flex items-center justify-end gap-1 pr-4 text-xs font-semibold italic text-slate-500">
                                                        <AlertCircle className="w-3 h-3" /> Not clinically eligible
                                                    </span>
                                                );
                                            } else if (vax.vaxStatus === 'COMPLETED_VALIDATED') {
                                                return (
                                                    <div className="flex justify-end pr-4 text-emerald-700" title="Vaccination Approved & Recorded">
                                                        <CheckCircle2 className="w-6 h-6" />
                                                    </div>
                                                );
                                            } else if (vax.vaxStatus === 'PENDING_VALIDATION') {
                                                if (canApprove) {
                                                    return (
                                                        <button
                                                            onClick={() => onApproveClick(vax)}
                                                            className="border border-amber-700 bg-amber-600 px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98]"
                                                        >
                                                            APPROVE & LOCK
                                                        </button>
                                                    );
                                                } else {
                                                    return (
                                                        <span className="flex items-center justify-end gap-1 pr-4 text-xs font-semibold italic text-amber-700">
                                                            <Clock className="w-3 h-3" /> Awaiting Validation
                                                        </span>
                                                    );
                                                }
                                            } else {
                                                // NOT_GIVEN
                                                if (vax.timingStatus === 'NOT_DUE_YET') {
                                                    if (canApprove) {
                                                        return (
                                                            <button
                                                                onClick={() => onRecordClick({
                                                                    ...vax,
                                                                    isEarlyDose: true
                                                                })}
                                                                className="border border-slate-700 bg-slate-700 px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
                                                            >
                                                                RECORD DOSE (EARLY)
                                                            </button>
                                                        );
                                                    } else {
                                                        return (
                                                            <span className="flex items-center justify-end gap-1 pr-4 text-xs font-semibold italic text-slate-400">
                                                                <Clock className="w-3 h-3" /> Not yet due
                                                            </span>
                                                        );
                                                    }
                                                } else {
                                                    // DUE_TODAY_OR_OVERDUE
                                                    if (isClinicalStaff && (registrationStatus === 'Approved' || registrationStatus === 'APPROVED')) {
                                                        return (
                                                            <button
                                                                onClick={() => onRecordClick({
                                                                    ...vax,
                                                                    isEarlyDose: false
                                                                })}
                                                                className="border border-[#064E3B] bg-[#064E3B] px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-emerald-900 active:scale-[0.98]"
                                                            >
                                                                RECORD DOSE
                                                            </button>
                                                        );
                                                    } else {
                                                        return <span className="justify-end pr-4 text-xs font-semibold italic text-slate-400">No action</span>;
                                                    }
                                                }
                                            }
                                        })()}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default NipScheduleTable;
