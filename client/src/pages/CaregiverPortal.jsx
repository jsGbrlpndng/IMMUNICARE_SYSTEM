import React from 'react';
import { useState } from 'react';
import { Baby, Calendar, CheckCircle2, Clock, LockKeyhole, Phone, ShieldCheck } from 'lucide-react';

const CaregiverPortal = () => {
    const [mobileNumber, setMobileNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [token, setToken] = useState(localStorage.getItem('caregiverToken') || '');
    const [records, setRecords] = useState([]);
    const [step, setStep] = useState(token ? 'records' : 'phone');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mockOtp, setMockOtp] = useState('');

    const requestOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMockOtp('');

        try {
            const response = await fetch('/api/caregiver/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile_number: mobileNumber })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'OTP request failed');

            setMockOtp(data.mock_otp || '');
            setStep('otp');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const verifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/caregiver/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile_number: mobileNumber, otp })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'OTP verification failed');

            localStorage.setItem('caregiverToken', data.authToken);
            setToken(data.authToken);
            setStep('records');
            await loadRecords(data.authToken);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadRecords = async (authToken = token) => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/caregiver/records', {
                headers: { 'x-auth-token': authToken }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load records');
            setRecords(data.records || []);
        } catch (err) {
            setError(err.message);
            localStorage.removeItem('caregiverToken');
            setToken('');
            setStep('phone');
        } finally {
            setLoading(false);
        }
    };

    const signOut = () => {
        localStorage.removeItem('caregiverToken');
        setToken('');
        setRecords([]);
        setOtp('');
        setStep('phone');
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const statusClass = (status) => {
        if (status === 'COMPLETED') return 'bg-green-50 text-green-700 border-green-100';
        if (status === 'OVERDUE' || status === 'DEFAULTED') return 'bg-red-50 text-red-700 border-red-100';
        if (status === 'DUE_TODAY' || status === 'DUE_SOON') return 'bg-amber-50 text-amber-700 border-amber-100';
        return 'bg-slate-50 text-slate-500 border-slate-100';
    };

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-100">
                            <ShieldCheck size={26} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-950">Caregiver Portal</h1>
                            <p className="text-sm font-semibold text-slate-500">IMMUNICARE read-only access</p>
                        </div>
                    </div>
                    {token && (
                        <button onClick={signOut} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                            Sign out
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mb-6 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                        {error}
                    </div>
                )}

                {step === 'phone' && (
                    <form onSubmit={requestOtp} className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="mb-5 flex items-center gap-3">
                            <Phone className="text-blue-600" size={22} />
                            <h2 className="text-lg font-black text-slate-900">Mobile Verification</h2>
                        </div>
                        <input
                            value={mobileNumber}
                            onChange={(e) => setMobileNumber(e.target.value)}
                            placeholder="09XXXXXXXXX"
                            className="mb-4 w-full rounded-md border border-slate-200 px-4 py-3 text-lg font-black tracking-wide text-slate-900 outline-none focus:border-blue-500"
                        />
                        <button disabled={loading} className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-blue-700 disabled:opacity-60">
                            {loading ? 'Sending...' : 'Send OTP'}
                        </button>
                    </form>
                )}

                {step === 'otp' && (
                    <form onSubmit={verifyOtp} className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="mb-5 flex items-center gap-3">
                            <LockKeyhole className="text-blue-600" size={22} />
                            <h2 className="text-lg font-black text-slate-900">Enter OTP</h2>
                        </div>
                        {mockOtp && (
                            <div className="mb-4 rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                                Mock code: {mockOtp}
                            </div>
                        )}
                        <input
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            placeholder="000000"
                            maxLength={6}
                            className="mb-4 w-full rounded-md border border-slate-200 px-4 py-3 text-center text-2xl font-black tracking-[0.3em] text-slate-900 outline-none focus:border-blue-500"
                        />
                        <button disabled={loading} className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-blue-700 disabled:opacity-60">
                            {loading ? 'Verifying...' : 'Verify'}
                        </button>
                    </form>
                )}

                {step === 'records' && (
                    <div className="space-y-6">
                        <div className="flex justify-end">
                            <button onClick={() => loadRecords()} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                                Refresh
                            </button>
                        </div>

                        {loading && <div className="text-sm font-bold text-slate-500">Loading records...</div>}

                        {!loading && records.length === 0 && (
                            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                                <Baby className="mx-auto mb-3 text-slate-300" size={36} />
                                <p className="text-sm font-bold text-slate-500">No linked infant records found.</p>
                            </div>
                        )}

                        {records.map(({ infant, schedules }) => (
                            <div key={infant.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-900 p-5 text-white md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h2 className="text-xl font-black">{infant.first_name} {infant.last_name}</h2>
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-300">{infant.reference_id} | {infant.barangay}</p>
                                    </div>
                                    <div className="rounded-md bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide">
                                        {infant.immunization_status || 'INCOMPLETE'}
                                    </div>
                                </div>

                                <div className="grid gap-3 p-5 md:grid-cols-2">
                                    {schedules.map((schedule) => (
                                        <div key={`${schedule.vaccine_code}-${schedule.dose_number}`} className="flex items-center justify-between rounded-md border border-slate-100 p-4">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-900">{schedule.vaccine_name || schedule.vaccine_code}</p>
                                                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
                                                    <Calendar size={13} />
                                                    {formatDate(schedule.recommended_date)}
                                                </div>
                                            </div>
                                            <div className="ml-3 text-right">
                                                <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-black uppercase ${statusClass(schedule.status)}`}>
                                                    {schedule.status === 'COMPLETED' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                                    {schedule.status}
                                                </span>
                                                {schedule.actual_date && (
                                                    <p className="mt-1 text-[10px] font-bold text-slate-400">{formatDate(schedule.actual_date)}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CaregiverPortal;
