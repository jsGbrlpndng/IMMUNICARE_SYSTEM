import React from 'react';
import {
    Baby,
    CalendarDays,
    Download,
    HeartPulse,
    Home,
    MapPin,
    Phone,
    Printer,
    Ruler,
    Scale,
    ShieldCheck,
    UserRound,
    UsersRound
} from 'lucide-react';
import VaccineStatusBadge from './VaccineStatusBadge';
import { formatFullNameFromObject } from '../../../utils/formatFullName';

const CARD_GREEN = '#0F5132';
const PRIMARY_GREEN = '#198754';
const LIGHT_GREEN = '#D1E7DD';

const formatDate = (value) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const valueOrDash = (value) => value || '-';

const InfoField = ({ icon: Icon, label, value, wide = false }) => (
    <div className={`flex gap-3 border-b border-emerald-900/15 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0F5132]" />
        <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#0F5132]">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold leading-snug text-slate-950">{valueOrDash(value)}</dd>
        </div>
    </div>
);

const StatusPill = ({ label, value, tone }) => {
    const tones = {
        completed: 'border-[#D1E7DD] bg-[#D1E7DD] text-[#0F5132]',
        due: 'border-[#FFF3CD] bg-[#FFF3CD] text-amber-900',
        overdue: 'border-[#F8D7DA] bg-[#F8D7DA] text-red-900',
        pending: 'border-blue-100 bg-blue-50 text-blue-900'
    };

    return (
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
            {label}: <strong className="ml-1 font-black">{value || 0}</strong>
        </span>
    );
};

const CardSection = ({ title, children }) => (
    <section className="overflow-hidden rounded-lg border border-[#198754] bg-white">
        <div className="border-b border-[#198754] bg-[#D1E7DD] px-4 py-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-[#0F5132]">{title}</h3>
        </div>
        {children}
    </section>
);

const VaccineRecordTable = ({ vaccineGroups }) => (
    <CardSection title="Vaccination Record">
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                    <tr className="bg-[#198754] text-white">
                        <th className="w-[27%] px-4 py-3 text-left text-xs font-black uppercase">Vaccine</th>
                        <th className="w-[9%] px-3 py-3 text-center text-xs font-black uppercase">Dose</th>
                        <th className="w-[18%] px-3 py-3 text-center text-xs font-black uppercase">Due Date</th>
                        <th className="w-[18%] px-3 py-3 text-center text-xs font-black uppercase">Date Given</th>
                        <th className="w-[16%] px-3 py-3 text-center text-xs font-black uppercase">Status</th>
                        <th className="w-[12%] px-3 py-3 text-center text-xs font-black uppercase">Remarks</th>
                    </tr>
                </thead>
                <tbody>
                    {vaccineGroups.map((group) => (
                        group.doses.map((dose, index) => (
                            <tr key={dose.schedule_id || `${group.name}-${dose.dose_number}-${index}`} className="border-b border-slate-200 align-middle">
                                {index === 0 && (
                                    <td rowSpan={group.doses.length} className="border-r border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-950">
                                        {group.name}
                                    </td>
                                )}
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-semibold text-slate-800">{dose.dose_number || 1}</td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-medium text-slate-700">{formatDate(dose.recommended_date)}</td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center font-medium text-slate-700">{formatDate(dose.date_given)}</td>
                                <td className="border-r border-slate-200 px-3 py-3 text-center">
                                    <VaccineStatusBadge status={dose.status} />
                                </td>
                                <td className="px-3 py-3 text-center text-xs font-medium text-slate-600">{dose.remarks || 'Not recorded'}</td>
                            </tr>
                        ))
                    ))}
                </tbody>
            </table>
        </div>
    </CardSection>
);

const DigitalImmunizationCard = ({ card, onSignOut }) => {
    if (!card) return null;

    const { infant, summary = {}, vaccine_groups: vaccineGroups = [] } = card;
    const childName = formatFullNameFromObject(infant);
    const address = [infant.address, infant.purok, infant.barangay].filter(Boolean).join(', ');

    return (
        <div className="min-h-screen bg-[#f3f7f4] px-3 py-5 text-slate-950 sm:px-5" style={{ fontFamily: 'Poppins, Inter, system-ui, sans-serif' }}>
            <style>{`
                @page {
                    size: A4 portrait;
                    margin: 8mm;
                }

                @media print {
                    html,
                    body,
                    #root {
                        background: #ffffff !important;
                    }

                    body {
                        margin: 0 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }

                    .caregiver-page-shell {
                        min-height: auto !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                    }

                    .caregiver-no-print {
                        display: none !important;
                    }

                    .caregiver-card {
                        width: 100% !important;
                        max-width: none !important;
                        border: 1px solid ${CARD_GREEN} !important;
                        box-shadow: none !important;
                    }

                    .caregiver-print-avoid {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                }
            `}</style>

            <div className="caregiver-page-shell">
                <div className="caregiver-no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-2 rounded-md border border-[#198754] bg-white px-4 py-2 text-sm font-black text-[#0F5132] shadow-sm hover:bg-[#D1E7DD]"
                    >
                        <Printer className="h-4 w-4" />
                        Print
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-2 rounded-md border border-[#198754] bg-white px-4 py-2 text-sm font-black text-[#0F5132] shadow-sm hover:bg-[#D1E7DD]"
                    >
                        <Download className="h-4 w-4" />
                        Save as PDF
                    </button>
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="rounded-md bg-[#0F5132] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[#198754]"
                    >
                        Sign out
                    </button>
                </div>

                <article className="caregiver-card mx-auto max-w-5xl overflow-hidden rounded-xl border-2 border-[#0F5132] bg-white shadow-xl">
                    <header className="caregiver-print-avoid">
                        <div className="bg-[#0F5132] px-5 py-3 text-center text-xs font-black uppercase tracking-wide text-white sm:px-7">
                            Republic of the Philippines | RHU Child Immunization Record
                        </div>

                        <div className="grid gap-4 border-b border-[#198754] bg-white px-5 py-6 sm:grid-cols-[120px_1fr_190px] sm:items-center sm:px-7">
                            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#D1E7DD] bg-[#D1E7DD] text-[#0F5132]">
                                <ShieldCheck className="h-11 w-11" />
                            </div>
                            <div className="text-center sm:text-left">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#198754]">IMMUNICARE</p>
                                <h1 className="mt-2 text-3xl font-black uppercase leading-tight text-[#0F5132] sm:text-4xl">
                                    Child Immunization Card
                                </h1>
                            </div>
                            <div className="rounded-lg bg-[#0F5132] p-4 text-white shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-wide text-[#D1E7DD]">Reference / Code No.</p>
                                <p className="mt-2 break-words text-xl font-black">{infant.reference_id || infant.code_number || '-'}</p>
                            </div>
                        </div>
                    </header>

                    <div className="space-y-3 p-4 sm:p-5">
                        <CardSection title="Child Information">
                            <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
                                <InfoField icon={Baby} label="Child's Name" value={childName} />
                                <InfoField icon={UsersRound} label="Mother's Name" value={infant.mothers_name} />
                                <InfoField icon={CalendarDays} label="Date of Birth" value={formatDate(infant.dob)} />
                                <InfoField icon={UsersRound} label="Father's Name" value={infant.fathers_name} />
                                <InfoField icon={MapPin} label="Place of Birth" value={infant.place_of_birth} />
                                <InfoField icon={UserRound} label="Sex" value={infant.sex} />
                                <InfoField icon={Home} label="Address" value={address} />
                                <InfoField icon={MapPin} label="Barangay" value={infant.barangay} />
                                <InfoField icon={Scale} label="Birth Weight" value={infant.birth_weight ? `${infant.birth_weight} kg` : null} />
                                <InfoField icon={Ruler} label="Birth Length" value={infant.birth_length ? `${infant.birth_length} cm` : null} />
                            </dl>
                        </CardSection>

                        {card.caregiver && (
                            <CardSection title="Caregiver / Guardian Information">
                                <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
                                    <InfoField icon={UserRound} label="Caregiver Name" value={card.caregiver.name} />
                                    <InfoField icon={UsersRound} label="Relationship to Child" value={card.caregiver.relationship} />
                                    <InfoField icon={Phone} label="Contact Number" value={card.caregiver.phone} />
                                </dl>
                            </CardSection>
                        )}

                        <section className="caregiver-print-avoid flex flex-wrap items-center gap-2 rounded-lg border border-[#198754] bg-white px-4 py-3">
                            <div className="mr-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#0F5132]">
                                <HeartPulse className="h-4 w-4" />
                                Status Summary
                            </div>
                            <StatusPill label="Completed" value={summary.completed_count} tone="completed" />
                            <StatusPill label="Due Soon" value={summary.due_soon_count} tone="due" />
                            <StatusPill label="Overdue" value={summary.overdue_count} tone="overdue" />
                            <StatusPill label="Pending" value={summary.pending_validation_count} tone="pending" />
                        </section>

                        {vaccineGroups.length === 0 ? (
                            <CardSection title="Vaccination Record">
                                <div className="p-6 text-center text-sm font-semibold text-slate-600">
                                    No vaccination schedule records are available for this child yet.
                                </div>
                            </CardSection>
                        ) : (
                            <VaccineRecordTable vaccineGroups={vaccineGroups} />
                        )}

                        <footer className="caregiver-print-avoid overflow-hidden rounded-lg border border-[#198754]">
                            <div className="grid gap-0 sm:grid-cols-[1.5fr_1fr]">
                                <div className="bg-[#f8fbf9] p-4">
                                    <p className="text-xs font-black uppercase tracking-wide text-[#0F5132]">Reminders for Parents</p>
                                    <ul className="mt-2 space-y-1 text-xs font-semibold leading-5 text-slate-700">
                                        <li>Bring this card every vaccination visit.</li>
                                        <li>Follow your child's vaccination schedule.</li>
                                        <li>Ask your health worker for concerns.</li>
                                    </ul>
                                </div>
                                <div className="flex items-center gap-3 border-t border-[#198754] bg-white p-4 sm:border-l sm:border-t-0">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D1E7DD] text-[#0F5132]">
                                        <Home className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wide text-[#0F5132]">Health Facility</p>
                                        <p className="mt-1 text-sm font-black text-slate-950">RHU LANGGAM</p>
                                        <p className="text-xs font-semibold text-slate-600">San Pedro, Laguna</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-[#198754] px-4 py-2 text-center text-xs font-black uppercase tracking-wide text-white">
                                This card is a permanent record. Please keep it safe.
                            </div>
                        </footer>
                    </div>
                </article>
            </div>
        </div>
    );
};

export default DigitalImmunizationCard;
