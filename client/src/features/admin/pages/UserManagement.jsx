import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    KeyRound,
    Loader2,
    MapPin,
    Plus,
    Search,
    ShieldCheck,
    Trash2,
    UserCheck,
    Users,
    UserX,
    X
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import apiClient from '../../../services/apiClient';
import { RHU2_BARANGAYS } from '../../reports/components/reportConfig';

const BARANGAY_OPTIONS = RHU2_BARANGAYS.map((barangay) => ({ value: barangay, label: barangay }));

const overlayClass = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]';
const modalClass = 'w-full border border-slate-200 bg-white shadow-2xl';
const modalTitleClass = 'text-lg font-black text-slate-900';
const labelClass = 'text-xs font-black uppercase tracking-[0.14em] text-slate-600';
const inputClass = 'mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 bg-[#084C39] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-[#07362A] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50';
const duplicateFullNameMessage = 'A staff account with this full name already exists. Please verify the staff identity. Multiple staff may be assigned to the same barangay, but each staff account must have a unique full name and Staff ID.';

const Toast = ({ message, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 4000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="fixed right-6 top-6 z-[100] animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="flex max-w-sm items-center gap-3 border border-slate-700 bg-slate-950 px-5 py-3 text-white shadow-2xl">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                <span className="text-sm font-bold">{message}</span>
                <button type="button" onClick={onDismiss} className="ml-2 border border-slate-700 p-1 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Dismiss notification">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
};

const ErrorPanel = ({ message }) => {
    if (!message) return null;
    return (
        <div role="alert" className="flex items-start gap-2 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
        </div>
    );
};

const SuccessModal = ({ data, onClose, onRegisterAnother }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(data.staffId);
        } catch {
            const fallback = document.createElement('textarea');
            fallback.value = data.staffId;
            document.body.appendChild(fallback);
            fallback.select();
            document.execCommand('copy');
            document.body.removeChild(fallback);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={overlayClass}>
            <div className={`${modalClass} max-w-md`}>
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Account Provisioned</p>
                        <h3 className={modalTitleClass}>Staff Registered Successfully</h3>
                    </div>
                    <button type="button" onClick={onClose} className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close success modal">
                        <X size={16} />
                    </button>
                </div>
                <div className="space-y-4 px-5 py-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Full Name</p>
                            <p className="mt-1 text-sm font-black text-slate-950">{data.fullName}</p>
                        </div>
                        <div className="border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Role</p>
                            <p className="mt-1 text-sm font-black text-slate-950">{data.role}</p>
                        </div>
                    </div>
                    <div className="border border-slate-300 bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Staff ID</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="font-mono text-xl font-black tracking-widest text-slate-950">{data.staffId}</span>
                            <button type="button" onClick={handleCopy} className={copied ? primaryButtonClass : secondaryButtonClass}>
                                {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-500">Share this ID directly with the staff member.</p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                    <button type="button" onClick={onRegisterAnother} className={secondaryButtonClass}>Register Another</button>
                    <button type="button" onClick={onClose} className={primaryButtonClass}>Done</button>
                </div>
            </div>
        </div>
    );
};

const TemporaryPasswordModal = ({ data, onClose }) => {
    if (!data) return null;

    return (
        <div className={overlayClass}>
            <div className={`${modalClass} max-w-md`}>
                <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Credential Reset</p>
                        <h3 className={modalTitleClass}>Password Reset Successful</h3>
                    </div>
                    <button type="button" onClick={onClose} className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close password modal">
                        <X size={16} />
                    </button>
                </div>
                <div className="space-y-4 px-5 py-5">
                    <p className="text-sm font-semibold leading-6 text-slate-700">
                        This temporary credential is shown once. Provide it directly to the staff member in person.
                    </p>
                    <div className="border border-slate-300 bg-slate-50 px-4 py-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Temporary Password</p>
                        <p className="mt-2 font-mono text-2xl font-black tracking-widest text-slate-950">{data.temporaryPassword}</p>
                    </div>
                    <p className="text-xs font-bold text-rose-700">Once this modal is closed, the temporary password cannot be viewed again.</p>
                </div>
                <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
                    <button type="button" onClick={onClose} className={primaryButtonClass}>Close and Clear Credential</button>
                </div>
            </div>
        </div>
    );
};

const ClinicalDeleteWarningModal = ({ data, onDeactivate, onClose, submitting }) => {
    if (!data) return null;
    const counts = data.clinicalReferenceCounts || {};
    const visibleCounts = Object.entries(counts).filter(([, value]) => Number(value || 0) > 0);

    return (
        <div className={overlayClass}>
            <div className={`${modalClass} max-w-lg`}>
                <div className="bg-[#064E3B] px-5 py-4 text-white">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center border border-white/30 bg-white/10">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Clinical Record Protection</p>
                            <h3 className="mt-1 text-lg font-black">Account Cannot Be Deleted</h3>
                        </div>
                    </div>
                </div>
                <div className="space-y-4 px-5 py-5">
                    <p className="text-sm font-semibold leading-6 text-slate-700">
                        {data.message || 'This staff account has linked clinical records and cannot be deleted. Deactivate the account instead.'}
                    </p>
                    <div className="border border-slate-300 bg-slate-50 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Staff Account</p>
                        <p className="mt-1 text-sm font-black text-slate-950">{data.user?.full_name}</p>
                        <p className="text-xs font-bold text-slate-500">{data.user?.id} - {data.user?.role}</p>
                    </div>
                    {visibleCounts.length > 0 ? (
                        <div className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-2">
                            {visibleCounts.map(([key, value]) => (
                                <div key={key} className="border border-slate-200 bg-white px-3 py-2">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{key.replace(/_/g, ' ')}</p>
                                    <p className="mt-1 text-base font-black text-[#064E3B]">{value}</p>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <p className="text-xs font-semibold text-slate-500">
                        Deactivation blocks future login while preserving staff attribution on infant records, vaccination logs, and follow-up history.
                    </p>
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                    <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
                    <button type="button" onClick={onDeactivate} disabled={submitting || data.user?.is_active === false} className={primaryButtonClass}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {data.user?.is_active === false ? 'Already Deactivated' : submitting ? 'Deactivating' : 'Deactivate Account'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const roleBadgeClass = (role) => {
    if (role === 'Super Admin') return 'border-slate-900 bg-slate-900 text-white';
    if (role === 'Admin') return 'border-emerald-800 bg-white text-emerald-800';
    if (role === 'Midwife' || role === 'Nurse') return 'border-teal-300 bg-teal-50 text-teal-800';
    return 'border-slate-300 bg-slate-50 text-slate-700';
};

const UserManagement = () => {
    const { user } = useAuth();
    const getInitialUserForm = useCallback(() => ({
        full_name: '',
        role: user?.role === 'Super Admin' ? 'Admin' : 'Midwife',
        assigned_barangay: user?.role === 'Admin' ? (user.assigned_barangay || '') : '',
        password: ''
    }), [user]);

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState('');
    const [search, setSearch] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [newUser, setNewUser] = useState(getInitialUserForm);
    const [formError, setFormError] = useState('');
    const [successData, setSuccessData] = useState(null);
    const [temporaryPasswordData, setTemporaryPasswordData] = useState(null);
    const [deleteWarningData, setDeleteWarningData] = useState(null);
    const [deactivatingFromWarning, setDeactivatingFromWarning] = useState(false);
    const [toast, setToast] = useState('');

    const fetchUsers = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            setFetchError('');
            const response = await apiClient.get('/admin/users');
            const data = await response.json().catch(() => ([]));
            if (!response.ok) {
                throw new Error(data?.error || data?.message || 'Unable to load staff accounts.');
            }
            setUsers(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching users:', error);
            setUsers([]);
            setFetchError(error.message || 'Unable to load staff accounts.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        setNewUser(getInitialUserForm());
    }, [getInitialUserForm]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleToggleStatus = async (targetUser) => {
        try {
            const newStatus = !targetUser.is_active;
            const response = await apiClient.put(`/admin/users/${targetUser.id}/status`, { is_active: newStatus });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setToast(data?.error || 'Unable to update staff status');
                return;
            }
            setToast(`Staff account ${newStatus ? 'enabled' : 'disabled'} successfully`);
            fetchUsers();
        } catch (error) {
            console.error('Error toggling status:', error);
            setToast('Unable to update staff status');
        }
    };

    const handleResetPassword = async (userId) => {
        try {
            const response = await apiClient.post(`/admin/users/${userId}/reset-password`);
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                setTemporaryPasswordData({ userId, temporaryPassword: data.temporary_password });
                fetchUsers();
            } else {
                setToast(data?.error || 'Password reset failed');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
            setToast('Password reset failed');
        }
    };

    const handleDeleteUser = async (targetUser) => {
        try {
            const response = await apiClient.delete(`/admin/users/${targetUser.id}`);
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                setToast('Staff account deleted successfully');
                fetchUsers();
                return;
            }

            if (response.status === 409 && data?.code === 'USER_HAS_CLINICAL_RECORDS') {
                setDeleteWarningData({
                    user: targetUser,
                    message: data.error,
                    clinicalReferenceCounts: data.clinical_reference_counts || {}
                });
                return;
            }

            setToast(data?.error || 'Unable to delete staff account');
        } catch (error) {
            console.error('Error deleting user:', error);
            setToast('Unable to delete staff account');
        }
    };

    const handleDeactivateFromDeleteWarning = async () => {
        if (!deleteWarningData?.user || deactivatingFromWarning) return;
        try {
            setDeactivatingFromWarning(true);
            const response = await apiClient.put(`/admin/users/${deleteWarningData.user.id}/status`, { is_active: false });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setToast(data?.error || 'Unable to deactivate staff account');
                return;
            }
            setToast('Staff account deactivated. Clinical records remain intact.');
            setDeleteWarningData(null);
            fetchUsers();
        } catch (error) {
            console.error('Error deactivating user:', error);
            setToast('Unable to deactivate staff account');
        } finally {
            setDeactivatingFromWarning(false);
        }
    };

    const handleCreateUser = async (event) => {
        event.preventDefault();
        if (submitting) return;
        setFormError('');

        if (newUser.role !== 'Super Admin' && !newUser.assigned_barangay) {
            setFormError('Please select an assigned barangay.');
            return;
        }

        if (user?.role === 'Super Admin' && newUser.role !== 'Admin') {
            setFormError('Super Admins can only create Barangay Admin accounts.');
            return;
        }

        if (user?.role === 'Admin' && !['Midwife', 'BHW'].includes(newUser.role)) {
            setFormError('Barangay Admins can only create Midwife and BHW accounts.');
            return;
        }

        const passwordFailures = [];
        if (newUser.password.length < 10) passwordFailures.push('at least 10 characters');
        if (!/[A-Z]/.test(newUser.password)) passwordFailures.push('one uppercase letter');
        if (!/[a-z]/.test(newUser.password)) passwordFailures.push('one lowercase letter');
        if (!/[0-9]/.test(newUser.password)) passwordFailures.push('one number');
        if (!/[^A-Za-z0-9]/.test(newUser.password)) passwordFailures.push('one special character');
        if (passwordFailures.length > 0) {
            setFormError(`Temporary password must include ${passwordFailures.join(', ')}.`);
            return;
        }

        try {
            setSubmitting(true);
            const response = await apiClient.post('/admin/users', newUser);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const serverMessage = data?.message || data?.error || '';
                const isDuplicateFullName = response.status === 409 && /full name|name|already exists/i.test(serverMessage);
                setFormError(isDuplicateFullName ? duplicateFullNameMessage : (serverMessage || 'Failed to create staff account.'));
                return;
            }

            const staffId = data?.user_id ?? data?.id ?? 'N/A';
            setShowAddModal(false);
            setFormError('');
            setSuccessData({
                staffId,
                fullName: newUser.full_name,
                role: newUser.role,
                barangay: newUser.assigned_barangay
            });
            setNewUser(getInitialUserForm());
            setToast(`Staff registered - ID: ${staffId}`);
            fetchUsers();
        } catch (error) {
            console.error('Error creating user:', error);
            setFormError('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredUsers = users.filter((staffUser) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        return staffUser.full_name?.toLowerCase().includes(query) ||
            staffUser.role?.toLowerCase().includes(query) ||
            staffUser.assigned_barangay?.toLowerCase().includes(query) ||
            staffUser.id?.toLowerCase().includes(query);
    });

    return (
        <div className="min-w-0 max-w-full space-y-5">
            {toast ? <Toast message={toast} onDismiss={() => setToast('')} /> : null}

            {successData ? (
                <SuccessModal
                    data={successData}
                    onClose={() => {
                        setSuccessData(null);
                        fetchUsers();
                    }}
                    onRegisterAnother={() => {
                        setSuccessData(null);
                        setShowAddModal(true);
                    }}
                />
            ) : null}

            <TemporaryPasswordModal data={temporaryPasswordData} onClose={() => setTemporaryPasswordData(null)} />

            {deleteWarningData ? (
                <ClinicalDeleteWarningModal
                    data={deleteWarningData}
                    submitting={deactivatingFromWarning}
                    onDeactivate={handleDeactivateFromDeleteWarning}
                    onClose={() => setDeleteWarningData(null)}
                />
            ) : null}

            <section className="border border-slate-300 bg-white px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 items-center justify-center bg-[#064E3B] text-white">
                            <Users className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">Administrative Identity Control</p>
                            <h1 className="mt-1 text-2xl font-black text-slate-950">User Management</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-500">Manage staff accounts, barangay assignments, and credential resets.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setNewUser(getInitialUserForm());
                            setFormError('');
                            setShowAddModal(true);
                        }}
                        className="inline-flex h-10 items-center justify-center gap-2 bg-[#064E3B] px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-[#053B2D]"
                    >
                        <Plus className="h-4 w-4" />
                        Add New Staff
                    </button>
                </div>
            </section>

            <section className="flex flex-col gap-3 border border-slate-300 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Staff Directory</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{filteredUsers.length} account{filteredUsers.length === 1 ? '' : 's'} visible</p>
                </div>
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search name, role, ID..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="h-10 w-full border border-slate-300 bg-white pl-9 pr-3 text-[11px] font-black uppercase tracking-wide text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#064E3B]"
                    />
                </div>
            </section>

            <ErrorPanel message={fetchError} />

            <section className="overflow-hidden border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                        <thead className="bg-[#084C39] text-white">
                            <tr>
                                <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider">Staff Member</th>
                                <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider">Role</th>
                                <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider">Assigned Barangay</th>
                                <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3.5 text-right text-[10px] font-black uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-5 py-12 text-center">
                                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Loading staff list...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-5 py-12 text-center">
                                        <div className="mx-auto max-w-sm border border-slate-200 bg-slate-50 px-5 py-6">
                                            <Users className="mx-auto h-7 w-7 text-slate-300" />
                                            <p className="mt-3 text-sm font-black text-slate-700">No staff members found</p>
                                            {search ? <p className="mt-1 text-xs font-semibold text-slate-500">Adjust the search filter and try again.</p> : null}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((staffUser) => (
                                    <tr key={staffUser.id} className="align-top transition-colors hover:bg-slate-50">
                                        <td className="border-b border-slate-200 px-5 py-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-xs font-black text-slate-600">
                                                    {staffUser.full_name?.[0] ?? '?'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-950">{staffUser.full_name}</p>
                                                    <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">{staffUser.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="border-b border-slate-200 px-5 py-4">
                                            <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${roleBadgeClass(staffUser.role)}`}>
                                                {staffUser.role}
                                            </span>
                                        </td>
                                        <td className="border-b border-slate-200 px-5 py-4">
                                            {staffUser.assigned_barangay ? (
                                                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                                    {staffUser.assigned_barangay}
                                                </div>
                                            ) : (
                                                <span className="text-xs font-semibold text-slate-400">Municipal Scope</span>
                                            )}
                                        </td>
                                        <td className="border-b border-slate-200 px-5 py-4">
                                            <span className={`inline-flex border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${staffUser.is_active ? 'border-emerald-300 bg-emerald-50 text-[#064E3B]' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>
                                                {staffUser.is_active ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="border-b border-slate-200 px-5 py-4 text-right">
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <button type="button" onClick={() => handleResetPassword(staffUser.id)} className={secondaryButtonClass} title="Reset Password">
                                                    <KeyRound className="h-3.5 w-3.5" />
                                                    Reset
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(staffUser)}
                                                    className={`inline-flex items-center justify-center gap-2 border bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${staffUser.is_active ? 'border-rose-300 text-rose-700 hover:bg-rose-50' : 'border-emerald-700 text-emerald-800 hover:bg-emerald-50'}`}
                                                    title={staffUser.is_active ? 'Disable User' : 'Enable User'}
                                                >
                                                    {staffUser.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                                                    {staffUser.is_active ? 'Disable' : 'Enable'}
                                                </button>
                                                <button type="button" onClick={() => handleDeleteUser(staffUser)} className="inline-flex items-center justify-center gap-2 border border-rose-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-rose-700 hover:bg-rose-50" title="Delete User">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {showAddModal ? (
                <div className={overlayClass}>
                    <form onSubmit={handleCreateUser} className={`${modalClass} max-w-md`}>
                        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h3 className={modalTitleClass}>Register New Staff</h3>
                                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">Create a credentialed IMMUNICARE staff account</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddModal(false);
                                    setNewUser(getInitialUserForm());
                                    setFormError('');
                                }}
                                className="border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                                aria-label="Close register staff modal"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                            <ErrorPanel message={formError} />

                            <label className="block">
                                <span className={labelClass}>Full Name</span>
                                <input
                                    type="text"
                                    required
                                    value={newUser.full_name}
                                    onChange={(event) => setNewUser({ ...newUser, full_name: event.target.value })}
                                    placeholder="e.g. Maria Santos"
                                    className={inputClass}
                                />
                            </label>

                            <label className="block">
                                <span className={labelClass}>Role</span>
                                <select
                                    value={newUser.role}
                                    onChange={(event) => {
                                        const newRole = event.target.value;
                                        setNewUser({
                                            ...newUser,
                                            role: newRole,
                                            assigned_barangay: user?.role === 'Admin' ? (user.assigned_barangay || '') : ''
                                        });
                                    }}
                                    className={`${inputClass} font-bold`}
                                >
                                    {user?.role === 'Super Admin' ? <option value="Admin">Admin / Head Nurse</option> : null}
                                    {user?.role === 'Admin' ? (
                                        <>
                                            <option value="Midwife">Midwife</option>
                                            <option value="BHW">BHW (Barangay Health Worker)</option>
                                        </>
                                    ) : null}
                                </select>
                            </label>

                            {newUser.role !== 'Super Admin' ? (
                                <label className="block">
                                    <span className={labelClass}>Assigned Barangay</span>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-[calc(50%+4px)] h-4 w-4 -translate-y-1/2 text-slate-400" />
                                        {user?.role === 'Admin' ? (
                                            <input value={user.assigned_barangay || ''} readOnly className={`${inputClass} bg-slate-100 pl-9 font-bold text-slate-700`} />
                                        ) : (
                                            <select
                                                required
                                                value={newUser.assigned_barangay}
                                                onChange={(event) => setNewUser({ ...newUser, assigned_barangay: event.target.value })}
                                                className={`${inputClass} pl-9 font-bold`}
                                            >
                                                <option value="">Select a barangay...</option>
                                                {BARANGAY_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    {user?.role === 'Admin' ? (
                                        <p className="mt-2 text-xs font-semibold text-slate-500">Admin-created staff are locked to your assigned barangay.</p>
                                    ) : null}
                                </label>
                            ) : null}

                            <label className="block">
                                <span className={labelClass}>Account Password</span>
                                <input
                                    type="password"
                                    required
                                    minLength={10}
                                    value={newUser.password}
                                    onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
                                    placeholder="Temporary password, min. 10 characters"
                                    className={inputClass}
                                />
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddModal(false);
                                    setNewUser(getInitialUserForm());
                                    setFormError('');
                                }}
                                className={secondaryButtonClass}
                            >
                                Cancel
                            </button>
                            <button type="submit" disabled={submitting} className={primaryButtonClass}>
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                {submitting ? 'Creating' : 'Create Account'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}
        </div>
    );
};

export default UserManagement;
