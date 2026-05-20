import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
    Users,
    Search,
    Plus,
    UserCheck,
    UserX,
    CheckCircle2,
    X,
    Copy,
    MapPin,
    Loader2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/apiClient';

/* Constants */

const BARANGAY_OPTIONS = [
    { value: 'LANGGAM', label: 'LANGGAM' },
    { value: 'CALENDOLA', label: 'CALENDOLA' },
    { value: 'GSIS', label: 'GSIS' },
    { value: 'MAGSAYSAY', label: 'MAGSAYSAY' },
    { value: 'SAMPAGUITA', label: 'SAMPAGUITA' },
    { value: 'UBL', label: 'UBL' },
    { value: 'UB', label: 'UB' },
    { value: 'LARAM', label: 'LARAM' },
    { value: 'ESTRELLA', label: 'ESTRELLA' },
    { value: 'BAGONG SILANG', label: 'BAGONG SILANG' },
    { value: 'RIVERSIDE', label: 'RIVERSIDE' },
    { value: 'NARRA', label: 'NARRA' },
];

/* Sub-components */

/** Top-right floating toast */
const Toast = ({ message, onDismiss }) => {
    useEffect(() => {
        const t = setTimeout(onDismiss, 4000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-3 fade-in duration-300">
            <div className="flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-slate-700 max-w-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-sm font-semibold">{message}</span>
                <button onClick={onDismiss} className="ml-2 text-slate-400 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

/** Success modal shown after staff is registered */
const SuccessModal = ({ data, onClose, onRegisterAnother }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(data.staffId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for browsers without clipboard API
            const el = document.createElement('textarea');
            el.value = data.staffId;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl overflow-hidden">
                {/* Success Header */}
                <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-5 flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-emerald-900">Staff Registered Successfully</h3>
                        <p className="text-xs text-emerald-700 mt-0.5">The new account is now active and ready to use.</p>
                    </div>
                </div>

                {/* Staff Details */}
                <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Full Name</p>
                            <p className="text-sm font-semibold text-slate-800">{data.fullName}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Role</p>
                            <p className="text-sm font-semibold text-slate-800">{data.role}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Assigned Barangay</p>
                            <p className="text-sm font-semibold text-slate-800">{data.barangay || '-'}</p>
                        </div>
                    </div>

                    {/* Staff ID Highlight */}
                    <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Staff ID</p>
                        <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-xl font-bold text-slate-900 tracking-widest">
                                {data.staffId}
                            </span>
                            <button
                                onClick={handleCopy}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                {copied ? (
                                    <>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy ID
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2">
                            Share this ID with the staff member so they can log in.
                        </p>
                    </div>
                </div>

                {/* Modal Actions */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={onRegisterAnother}
                        className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-semibold text-sm rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        Register Another
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-lg hover:bg-black transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

/* Main Component */

const UserManagement = () => {
    const { user } = useAuth();
    const getInitialUserForm = useCallback(() => ({
        full_name: '',
        role: 'Midwife',
        assigned_barangay: user?.role === 'Admin' ? (user.assigned_barangay || '') : '',
        password: ''
    }), [user]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [newUser, setNewUser] = useState(getInitialUserForm);
    const [formError, setFormError] = useState('');

    // Success modal
    const [successData, setSuccessData] = useState(null);

    // Top-right toast
    const [toast, setToast] = useState('');

    const fetchUsers = useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const response = await apiClient.get('/admin/users');
            const data = await response.json();
            if (response.ok) setUsers(data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleToggleStatus = async (targetUser) => {
        try {
            const newStatus = !targetUser.is_active;
            const response = await apiClient.put(`/admin/users/${targetUser.id}/status`, { is_active: newStatus });
            if (response.ok) {
                setToast(`User ${newStatus ? 'enabled' : 'disabled'} successfully`);
                fetchUsers();
            }
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    const handleResetPassword = async (userId) => {
        try {
            const response = await apiClient.post(`/admin/users/${userId}/reset-password`);
            if (response.ok) {
                setToast('Password reset successfully');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setFormError('');

        if (newUser.role !== 'Super Admin' && !newUser.assigned_barangay) {
            setFormError('Please select an assigned barangay');
            return;
        }

        try {
            setSubmitting(true);
            const response = await apiClient.post('/admin/users', newUser);
            const data = await response.json();

            if (response.ok) {
                // Success: close modal and reset form
                const staffId = data?.user_id ?? data?.id ?? 'N/A';
                setShowAddModal(false);
                setNewUser(getInitialUserForm());
                setFormError('');

                // Show success modal
                setSuccessData({
                    staffId,
                    fullName: newUser.full_name,
                    role: newUser.role,
                    barangay: newUser.assigned_barangay,
                });

                setToast(`Staff registered - ID: ${staffId}`);
                fetchUsers();
            } else {
                // Failure: keep modal open and show error
                setFormError(data?.message || data?.error || 'Failed to create staff account');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            setFormError('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSuccessClose = () => {
        setSuccessData(null);
        fetchUsers();
    };

    const handleRegisterAnother = () => {
        setSuccessData(null);
        setShowAddModal(true);
    };

    const filteredUsers = users.filter(u =>
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-5">
            {/* Toast */}
            {toast && <Toast message={toast} onDismiss={() => setToast('')} />}

            {/* Success Modal */}
            {successData && (
                <SuccessModal
                    data={successData}
                    onClose={handleSuccessClose}
                    onRegisterAnother={handleRegisterAnother}
                />
            )}

            {/* Page Header */}
            <div className="flex items-center justify-between bg-white px-6 py-5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Users className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">User Management</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Manage staff accounts and barangay assignments</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setNewUser(getInitialUserForm());
                        setShowAddModal(true);
                    }}
                    className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg hover:bg-black transition-colors shadow-sm font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add New Staff
                </button>
            </div>

            {/* Search */}
            <div className="bg-white px-5 py-4 rounded-xl border border-slate-200">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search by name or role..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-sm transition"
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-6 py-3.5 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Staff Member</th>
                            <th className="text-left px-6 py-3.5 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Role</th>
                            <th className="text-left px-6 py-3.5 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Assigned Barangay</th>
                            <th className="text-left px-6 py-3.5 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Status</th>
                            <th className="text-right px-6 py-3.5 font-bold text-slate-500 uppercase tracking-wider text-[11px]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span className="text-sm">Loading staff list...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <Users className="w-7 h-7 text-slate-200" />
                                        <p className="text-sm font-medium text-slate-500">No staff members found</p>
                                        {search && <p className="text-xs text-slate-400">Try adjusting your search</p>}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((staffUser) => (
                                <tr key={staffUser.id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 font-bold text-xs border border-slate-200 flex-shrink-0">
                                                {staffUser.full_name?.[0] ?? '?'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900">{staffUser.full_name}</p>
                                                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-tight">{staffUser.id}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                            staffUser.role === 'Super Admin'
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : staffUser.role === 'Admin'
                                                    ? 'bg-violet-50 text-violet-700 border-violet-100'
                                                    : staffUser.role === 'Midwife'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-100'
                                                        : 'bg-green-50 text-green-700 border-green-100'
                                        }`}>
                                            {staffUser.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {staffUser.assigned_barangay ? (
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-sm font-medium">{staffUser.assigned_barangay}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-2 h-2 rounded-full ${staffUser.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                            <span className={`text-xs font-bold ${staffUser.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                {staffUser.is_active ? 'Active' : 'Disabled'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => handleResetPassword(staffUser.id)}
                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors text-xs font-medium"
                                                title="Reset Password"
                                            >
                                                Reset PW
                                            </button>
                                            <button
                                                onClick={() => handleToggleStatus(staffUser)}
                                                className={`p-2 rounded-lg transition-colors text-xs font-semibold ${staffUser.is_active
                                                    ? 'hover:bg-red-50 text-slate-400 hover:text-red-600'
                                                    : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'
                                                    }`}
                                                title={staffUser.is_active ? 'Disable User' : 'Enable User'}
                                            >
                                                {staffUser.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Register New Staff Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Register New Staff</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Create a new staff account for this RHU</p>
                            </div>
                            <button
                                onClick={() => { 
                                    setShowAddModal(false); 
                                    setNewUser(getInitialUserForm()); 
                                    setFormError(''); 
                                }}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="px-6 py-5 space-y-4">
                            {/* Error Alert */}
                            {formError && (
                                <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs font-semibold text-red-700 leading-relaxed">
                                        {formError}
                                    </p>
                                </div>
                            )}
                            {/* Full Name */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Full Name <span className="text-red-400">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={newUser.full_name}
                                    onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                                    placeholder="e.g. Maria Santos"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-sm transition"
                                />
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Role <span className="text-red-400">*</span></label>
                                <select
                                    value={newUser.role}
                                    onChange={e => {
                                        const newRole = e.target.value;
                                        setNewUser({ 
                                            ...newUser, 
                                            role: newRole, 
                                            assigned_barangay: user?.role === 'Admin' ? (user.assigned_barangay || '') : ''
                                        });
                                    }}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-sm font-medium transition"
                                >
                                    {/* Role Options filtered by Privilege Level */}
                                    <option value="Midwife">Midwife</option>
                                    <option value="BHW">BHW (Barangay Health Worker)</option>
                                    {user?.role === 'Super Admin' && (
                                        <option value="Admin">Admin / Head Nurse</option>
                                    )}
                                </select>
                            </div>

                            {/* Assigned Barangay - required for all scoped roles */}
                            {newUser.role !== 'Super Admin' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5">
                                        Assigned Barangay <span className="text-red-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        {user?.role === 'Admin' ? (
                                            <input
                                                value={user.assigned_barangay || ''}
                                                readOnly
                                                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold"
                                            />
                                        ) : (
                                            <select
                                                required
                                                value={newUser.assigned_barangay}
                                                onChange={e => setNewUser({ ...newUser, assigned_barangay: e.target.value })}
                                                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-sm font-medium transition appearance-none bg-slate-50 text-slate-900"
                                            >
                                                <option value="">Select a barangay...</option>
                                                {BARANGAY_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    {user?.role === 'Admin' && (
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            Admin-created staff are locked to your assigned barangay.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Password */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Account Password <span className="text-red-400">*</span></label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    placeholder="Min. 6 characters"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-sm transition"
                                />
                            </div>

                            {/* Actions */}
                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setShowAddModal(false); setNewUser(getInitialUserForm()); setFormError(''); }}
                                    className="flex-1 px-4 py-2.5 text-slate-600 font-semibold text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 px-4 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-lg hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        'Create Account'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
