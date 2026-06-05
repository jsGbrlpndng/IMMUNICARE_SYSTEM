import React, { useEffect, useState } from 'react';
import {
    FileEdit,
    Clock3,
    CheckCircle2,
    AlertTriangle,
    Plus,
    ChevronRight,
    MapPin,
    Stethoscope
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../services/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { formatFullNameFromObject } from '../../utils/formatFullName';

const BHWDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        drafts: 0,
        pending: 0,
        approved: 0,
        validated: 0,
        rejected: 0,
        needsCorrection: 0
    });
    const [recentInfants, setRecentInfants] = useState([]);
    const [fieldTasks, setFieldTasks] = useState([]);
    const [activeDeployments, setActiveDeployments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
        const intervalId = window.setInterval(() => {
            fetchDashboardData({ silent: true });
        }, 10000);

        return () => window.clearInterval(intervalId);
    }, [user]);

    const fetchDashboardData = async ({ silent = false } = {}) => {
        if (!user) return;

        if (!silent) {
            setLoading(true);
        }

        try {
            const statsRes = await apiClient.get('/registrations/stats');
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData.stats || {
                    drafts: 0,
                    pending: 0,
                    approved: 0,
                    validated: 0,
                    rejected: 0,
                    needs_correction: 0
                });
            }

            const submissionsRes = await apiClient.get('/registrations/my');
            if (submissionsRes.ok) {
                const subData = await submissionsRes.json();
                const items = subData.registrations || [];
                setRecentInfants(items.slice(0, 5));
            }

            const followUpsRes = await apiClient.get('/follow-ups');
            if (followUpsRes.ok) {
                const followUpsData = await followUpsRes.json();
                const tasks = (followUpsData.follow_ups || [])
                    .filter((item) => item?.status === 'DEFAULTER' || item?.status === 'DUE_SOON')
                    .slice(0, 6);
                setFieldTasks(tasks);
            } else {
                setFieldTasks([]);
            }

            const deploymentsRes = await apiClient.get('/bhw/deployments/active');
            if (deploymentsRes.ok) {
                const deploymentData = await deploymentsRes.json();
                setActiveDeployments(Array.isArray(deploymentData?.deployments) ? deploymentData.deployments : []);
            } else {
                setActiveDeployments([]);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            setFieldTasks([]);
            setActiveDeployments([]);
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    };

    const statCards = [
        {
            label: 'Drafts',
            value: stats.drafts || 0,
            description: 'Incomplete registration records',
            icon: FileEdit,
            iconClass: 'text-slate-600',
            iconBg: 'bg-slate-100'
        },
        {
            label: 'Pending Validation',
            value: stats.pending || 0,
            description: 'Awaiting midwife review',
            icon: Clock3,
            iconClass: 'text-amber-700',
            iconBg: 'bg-amber-50'
        },
        {
            label: 'Approved',
            value: stats.validated || stats.approved || 0,
            description: 'Accepted and promoted records',
            icon: CheckCircle2,
            iconClass: 'text-[#0B6E4F]',
            iconBg: 'bg-[#E9F6F0]'
        },
        {
            label: 'Needs Correction',
            value: stats.needs_correction || 0,
            description: 'Returned for revision',
            icon: AlertTriangle,
            iconClass: 'text-rose-700',
            iconBg: 'bg-rose-50'
        }
    ];

    const returnedCorrections = recentInfants.filter((infant) => infant.status === 'NEEDS_CORRECTION');

    const openRecord = (infant) => {
        const status = infant.status === 'PENDING_VALIDATION'
            ? 'Pending'
            : infant.status === 'NEEDS_CORRECTION'
                ? 'Needs Correction'
                : infant.status === 'APPROVED'
                    ? 'Approved'
                    : infant.status;

        if (status === 'Pending' || status === 'Needs Correction' || status === 'DRAFT' || status === 'Draft') {
            navigate(`/bhw/registrations/${infant.id}`);
            return;
        }

        if (status === 'Approved') {
            const referenceNumber = infant.reference_id || infant.promoted_infant_id;
            navigate(`/bhw/infants/${referenceNumber}`);
        }
    };

    const getStatusPill = (status) => {
        if (status === 'APPROVED') {
            return 'bg-[#E9F6F0] text-[#0B6E4F]';
        }

        if (status === 'PENDING_VALIDATION') {
            return 'bg-amber-50 text-amber-700';
        }

        if (status === 'DRAFT') {
            return 'bg-slate-100 text-slate-700';
        }

        return 'bg-rose-50 text-rose-700';
    };

    const getTaskStatusPill = (status) => {
        if (status === 'DEFAULTER') {
            return 'bg-rose-50 text-rose-700 border border-rose-200';
        }

        if (status === 'DUE_SOON') {
            return 'bg-amber-50 text-amber-700 border border-amber-200';
        }

        return 'bg-slate-100 text-slate-700 border border-slate-200';
    };

    if (loading) {
        return (
            <div className="rounded border border-slate-200 bg-white px-6 py-10 text-center text-sm font-medium text-slate-500 shadow-sm">
                Loading dashboard...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#0B6E4F]">
                        Barangay Health Worker Workspace
                    </p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                        Dashboard
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">
                        Manage infant registrations for {user?.assigned_barangay || 'your assigned barangay'} through a clean, single-path workflow.
                    </p>
                </div>

                <Link
                    to="/bhw/register"
                    className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#084C39] px-5 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-colors hover:bg-[#07362A]"
                >
                    <Plus className="h-5 w-5" />
                    Register New Infant
                </Link>
            </section>

            {activeDeployments.length > 0 && (
                <section className="rounded border border-rose-300 bg-white shadow-sm">
                    <div className="flex flex-col gap-4 border-l-4 border-rose-600 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-rose-50 text-rose-700">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-700">
                                    URGENT: Cluster Mobilization Required
                                </p>
                                <h2 className="mt-1 text-lg font-black text-slate-900">
                                    The Head Nurse has deployed you to conduct field mobilization for a defaulter cluster in {activeDeployments[0]?.cluster_label || activeDeployments[0]?.barangay || 'your barangay'}.
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    {activeDeployments[0]?.infant_count || 0} infants require prioritized follow-up. Cluster priority cases are pinned at the top of your follow-up list.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/bhw/follow-ups')}
                            className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#084C39] px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#07362A]"
                        >
                            View Priority Follow-Ups
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </section>
            )}

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {statCards.map((stat) => {
                    const Icon = stat.icon;

                    return (
                        <div
                            key={stat.label}
                            className="rounded border border-slate-200 bg-white px-5 py-4 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className={`flex h-12 w-12 items-center justify-center rounded ${stat.iconBg}`}>
                                    <Icon className={`h-6 w-6 ${stat.iconClass}`} strokeWidth={2.1} />
                                </div>
                                <span className="text-3xl font-black tracking-tight text-slate-900">
                                    {stat.value}
                                </span>
                            </div>
                            <div className="mt-4">
                                <h2 className="text-base font-bold text-slate-900">{stat.label}</h2>
                                <p className="mt-1 text-sm text-slate-500">{stat.description}</p>
                            </div>
                        </div>
                    );
                })}
            </section>

            <section className="rounded border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">
                            Validation Feedback
                        </p>
                        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                            Returned for Correction
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Records that need an update before they can return to the Midwife validation queue.
                        </p>
                    </div>
                    <Link
                        to="/bhw/submissions"
                        className="inline-flex items-center gap-1 text-sm font-black text-rose-700 transition-colors hover:text-rose-800"
                    >
                        Review Submissions
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="divide-y divide-slate-200">
                    {returnedCorrections.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                            <p className="text-sm font-medium text-slate-500">
                                No records are currently waiting for correction.
                            </p>
                        </div>
                    ) : (
                        returnedCorrections.map((infant) => (
                            <div
                                key={infant.id}
                                className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <p className="text-lg font-bold tracking-tight text-slate-900">
                                            {formatFullNameFromObject(infant)}
                                        </p>
                                        <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-rose-700">
                                            Needs Correction
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-500">
                                        {infant.correction_notes || 'Midwife feedback is available for this registration.'}
                                    </p>
                                </div>
                                <Link
                                    to={`/bhw/registrations/${infant.id}`}
                                    className="inline-flex items-center gap-1 rounded border border-rose-700 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700 transition-colors hover:bg-rose-50"
                                >
                                    Continue Correction
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <section className="rounded border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Field Operations
                        </p>
                        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                            Today's Field Tasks
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Active follow-up visits in {user?.assigned_barangay || 'your assigned barangay'}.
                        </p>
                    </div>
                    <Link
                        to="/bhw/follow-ups"
                        className="inline-flex items-center gap-1 text-sm font-black text-emerald-600 transition-colors hover:text-emerald-700"
                    >
                        Open Follow-Ups
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="divide-y divide-slate-200">
                    {fieldTasks.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-sm font-medium text-slate-500">
                                No active field visits queued right now.
                            </p>
                        </div>
                    ) : (
                        fieldTasks.map((task) => (
                            <div
                                key={task.infant_id || task.id}
                                className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <p className="text-lg font-bold tracking-tight text-slate-900">
                                            {formatFullNameFromObject(task) || 'Unnamed infant'}
                                        </p>
                                        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${getTaskStatusPill(task.status)}`}>
                                            {task.status}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                                        <span>
                                            Due vaccines: {(task.due_vaccines || []).slice(0, 2).join(', ') || task.missing_vaccine_name || '-'}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-slate-400" />
                                            {task.reference_id || '-'} · {task.parent_contact || task.caregiver_phone || 'No contact number'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3 lg:justify-end">
                                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                        {task.earliest_recommended_date
                                            ? `Due ${new Date(task.earliest_recommended_date).toLocaleDateString()}`
                                            : 'Visit required'}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/bhw/follow-ups')}
                                        className="inline-flex items-center gap-2 rounded border border-[#084C39] bg-[#084C39] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#07362A]"
                                    >
                                        <Stethoscope className="h-4 w-4" />
                                        Log Visit
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <section className="rounded border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Registration Activity
                        </p>
                        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                            Recent Registrations
                        </h2>
                    </div>
                    <Link
                        to="/bhw/submissions"
                        className="inline-flex items-center gap-1 text-sm font-black text-emerald-600 transition-colors hover:text-emerald-700"
                    >
                        View All
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>

                <div className="divide-y divide-slate-200">
                    {recentInfants.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <p className="text-sm font-medium text-slate-500">
                                No recent registrations found.
                            </p>
                        </div>
                    ) : (
                        recentInfants.map((infant) => {
                            const statusLabel = infant.status === 'PENDING_VALIDATION'
                                ? 'Pending Review'
                                : infant.status === 'NEEDS_CORRECTION'
                                    ? 'Needs Correction'
                                    : infant.status === 'APPROVED'
                                        ? 'Approved'
                                        : infant.status;

                            return (
                                <div
                                    key={infant.id}
                                    className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                                >
                                    <button
                                        type="button"
                                        onClick={() => openRecord(infant)}
                                        className="flex flex-1 items-center gap-4 text-left"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                                            {infant.first_name?.[0]}{infant.last_name?.[0]}
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold tracking-tight text-slate-900">
                                                {formatFullNameFromObject(infant)}
                                            </p>
                                            <p className="mt-1 text-sm text-slate-500">
                                                Born {infant.dob ? new Date(infant.dob).toLocaleDateString() : 'N/A'}
                                            </p>
                                        </div>
                                    </button>

                                    <div className="flex items-center justify-between gap-3 md:justify-end">
                                        <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${getStatusPill(infant.status)}`}>
                                            {statusLabel}
                                        </span>

                                        {infant.status === 'DRAFT' || infant.status === 'NEEDS_CORRECTION' ? (
                                            <Link
                                                to={`/bhw/registrations/${infant.id}`}
                                                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-50"
                                            >
                                                Continue
                                            </Link>
                                        ) : (
                                            <Link
                                                to={infant.status === 'APPROVED'
                                                    ? `/bhw/infants/${infant.reference_id || infant.promoted_infant_id}`
                                                    : `/bhw/registrations/${infant.id}`}
                                                className="inline-flex items-center gap-1 rounded border border-[#084C39] bg-[#084C39] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#07362A]"
                                            >
                                                Open
                                                <ChevronRight className="h-4 w-4" />
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>
        </div>
    );
};

export default BHWDashboard;
