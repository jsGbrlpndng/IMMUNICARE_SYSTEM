import React from 'react';
import { AlertTriangle, CalendarClock, ClipboardList, PackageCheck } from 'lucide-react';
import { formatCount } from './reportConfig';

const statusTone = (value, warningAt) => {
    const parsed = Number(value || 0);
    if (parsed >= warningAt) return 'border-red-300 bg-red-50 text-red-800';
    if (parsed > 0) return 'border-amber-300 bg-amber-50 text-amber-900';
    return 'border-slate-300 bg-white text-[#064E3B]';
};

const formatDate = (value) => {
    if (!value) return 'None';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
};

const DssMetric = ({ icon: Icon, label, value, detail, tone, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`border text-left transition ${tone} ${active ? 'ring-2 ring-[#064E3B] ring-offset-2' : 'hover:border-[#064E3B]'}`}
    >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${active ? 'border-[#064E3B] bg-[#064E3B] text-white' : 'border-current/20'}`}>
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${active ? 'text-white' : 'text-slate-600'}`}>{label}</p>
            <Icon className="h-4 w-4" />
        </div>
        <div className="px-4 py-4">
            <p className="text-3xl font-black tabular-nums">{value}</p>
            <p className="mt-1 min-h-8 text-xs font-bold leading-4 text-slate-600">{detail}</p>
        </div>
    </button>
);

const BarangayDssWidgets = ({ dss, activeCohort = 'defaulters', onSelect = () => {} }) => {
    const metrics = dss?.metrics || {};
    const defaulters = metrics.defaulter_action_alert || metrics.defaulter_action_list || {};
    const ficRedZone = metrics.fic_red_zone || {};
    const pipeline = metrics.upcoming_pipeline || {};
    const vialRequisition = metrics.predictive_vial_requisition || {};

    return (
        <div className="grid gap-4 xl:grid-cols-4">
            <DssMetric
                icon={ClipboardList}
                label="Defaulter Action Alert"
                value={formatCount(defaulters.infant_count)}
                detail={`${formatCount(defaulters.overdue_dose_count)} overdue dose(s). Oldest due: ${formatDate(defaulters.oldest_due_date)}.`}
                tone={statusTone(defaulters.infant_count, 5)}
                active={activeCohort === 'defaulters'}
                onClick={() => onSelect('defaulters')}
            />
            <DssMetric
                icon={AlertTriangle}
                label="FIC Red Zone"
                value={formatCount(ficRedZone.infant_count)}
                detail={`${formatCount(ficRedZone.dose_gap_count)} missing dose(s) among infants at 11 months.`}
                tone={statusTone(ficRedZone.infant_count, 3)}
                active={activeCohort === 'fic_red_zone'}
                onClick={() => onSelect('fic_red_zone')}
            />
            <DssMetric
                icon={CalendarClock}
                label="30-Day Pipeline"
                value={formatCount(pipeline.infant_count)}
                detail={`${formatCount(pipeline.critical_dose_count)} critical dose(s) due in ${pipeline.horizon_days || 30} days; ${formatCount(pipeline.mcv1_due_count)} MCV1.`}
                tone={statusTone(pipeline.critical_dose_count, 20)}
                active={activeCohort === 'pipeline_30_day'}
                onClick={() => onSelect('pipeline_30_day')}
            />
            <DssMetric
                icon={PackageCheck}
                label="Predictive Vial Requisition"
                value={formatCount(vialRequisition.total_vials)}
                detail={vialRequisition.primary_message || 'No routine vial requisition forecast.'}
                tone={statusTone(vialRequisition.total_vials, 10)}
                active={activeCohort === 'vial_requisition'}
                onClick={() => onSelect('vial_requisition')}
            />
        </div>
    );
};

export default BarangayDssWidgets;
