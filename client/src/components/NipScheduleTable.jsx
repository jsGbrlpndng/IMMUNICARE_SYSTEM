import React from 'react';
import {
    Calendar,
    Syringe,
    AlertCircle,
    CheckCircle2,
    Clock
} from 'lucide-react';
import { formatDate, getDoseTimingStatus } from '../utils/formatters';
const StatusBadge = ({ status }) => {
    const styles = {
        overdue: 'bg-red-100 text-red-700 border-red-200',
        due: 'bg-blue-100 text-blue-700 border-blue-200',
        upcoming: 'bg-gray-100 text-gray-600 border-gray-200',
        completed: 'bg-green-100 text-green-700 border-green-200',
        pending_validation: 'bg-amber-100 text-amber-700 border-amber-200',
        default: 'bg-gray-100 text-gray-600'
    };

    const labels = {
        overdue: 'Overdue',
        due: 'Due Now',
        upcoming: 'Upcoming',
        completed: 'Completed',
        pending_validation: 'Pending'
    };

    const icon = {
        overdue: <AlertCircle className="w-3 h-3" />,
        due: <Clock className="w-3 h-3" />,
        upcoming: <Calendar className="w-3 h-3" />,
        completed: <CheckCircle2 className="w-3 h-3" />,
        pending_validation: <Clock className="w-3 h-3" />
    };

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.default}`}>
            {icon[status]}
            {labels[status] || status}
        </span>
    );
};


const prepareScheduleForDisplay = (scheduleData) => {
    // Determine the array to map over. In the new merged API, it's passed directly or as schedule.record
    const recordArray = Array.isArray(scheduleData) ? scheduleData : (scheduleData?.record || []);
    if (!recordArray.length) return [];

    const urgencyOrder = { 'overdue': 0, 'due': 1, 'pending_validation': 2, 'upcoming': 3, 'completed': 4 };

    return recordArray.map(v => {
        const vaxStatus = v.status || 'NOT_GIVEN';
        let timingStatus = getDoseTimingStatus(v.recommended_date || v.dueDate, vaxStatus);

        // Normalize: the DB returns UPPER_CASE, the frontend historically used lowercase.
        const scheduleStatus = (v.original_schedule_status || '').toUpperCase();

        let urgency = 'upcoming';
        if (vaxStatus === 'COMPLETED_VALIDATED' || vaxStatus === 'COMPLETED') {
            urgency = 'completed';
        } else if (vaxStatus === 'PENDING_VALIDATION') {
            urgency = 'pending_validation';
        } else {
            if (scheduleStatus === 'DEFAULTER' || scheduleStatus === 'DROPOUT')     urgency = 'overdue';
            else if (scheduleStatus === 'DUE_TODAY' || scheduleStatus === 'DUE')    urgency = 'due';
            else if (scheduleStatus === 'DUE_SOON')                                 urgency = 'due';
            else                                                                     urgency = 'upcoming';
        }

        return {
            vaccineCode: v.vaccine_code || v.vaccineCode,
            vaccineName: v.vaccine_name || v.vaccineName,
            doseNumber: v.dose_number || v.doseNumber || 1,
            scheduleId: v.schedule_id || v.scheduleId,
            infantId: v.infant_id || v.infantId,
            dueDate: v.recommended_date || v.dueDate,
            administeredDate: v.actual_date || v.administeredDate,
            urgency: urgency,
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
    const canApprove = userRole === 'Midwife' || userRole === 'Nurse';

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Syringe className="w-5 h-5 text-blue-600" />
                    Vaccination Schedule
                </h2>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                        <tr>
                            <th className="px-6 py-4">Vaccine / Dose</th>
                            <th className="px-6 py-4">Recommended Date</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Actual Date</th>
                            <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {allVaccines.map((vax, idx) => {
                            const isCompleted = vax.urgency === 'completed' && vax.administeredDate;

                            return (
                                <tr key={idx} className="hover:bg-gray-50/50 transition duration-150">
                                    <td className="px-6 py-4">
                                        <p className="font-bold text-gray-900">{vax.vaccineName}</p>
                                        <p className="text-xs text-gray-500">Dose #{vax.doseNumber}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        {formatDate(vax.dueDate)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <StatusBadge status={vax.urgency} />
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                                        {isCompleted ? formatDate(vax.administeredDate) : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {(() => {
                                            if (vax.vaxStatus === 'COMPLETED_VALIDATED') {
                                                return (
                                                    <div className="flex justify-end pr-4 text-green-600" title="Vaccination Approved & Recorded">
                                                        <CheckCircle2 className="w-6 h-6" />
                                                    </div>
                                                );
                                            } else if (vax.vaxStatus === 'PENDING_VALIDATION') {
                                                if (canApprove) {
                                                    return (
                                                        <button
                                                            onClick={() => onApproveClick(vax)}
                                                            className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 shadow-sm transition transform hover:scale-105 active:scale-95"
                                                        >
                                                            APPROVE & LOCK
                                                        </button>
                                                    );
                                                } else {
                                                    return (
                                                        <span className="text-xs text-amber-600 italic font-medium flex justify-end items-center gap-1 pr-4">
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
                                                                className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 shadow-sm transition transform hover:scale-105 active:scale-95"
                                                            >
                                                                RECORD DOSE (EARLY)
                                                            </button>
                                                        );
                                                    } else {
                                                        return (
                                                            <span className="text-xs text-gray-400 italic font-medium flex justify-end items-center gap-1 pr-4">
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
                                                                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm transition transform hover:scale-105 active:scale-95"
                                                            >
                                                                RECORD DOSE
                                                            </button>
                                                        );
                                                    } else {
                                                        return <span className="text-xs text-gray-400 italic justify-end pr-4">No action</span>;
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
