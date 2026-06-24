import React from 'react';
import { ArrowRight, FileText, LockKeyhole, Phone } from 'lucide-react';

const CaregiverOtpForm = ({
    step,
    referenceNumber,
    setReferenceNumber,
    otp,
    setOtp,
    maskedMobileNumber,
    loading,
    onRequestOtp,
    onVerifyOtp,
    onBack
}) => {
    if (step === 'otp') {
        return (
            <form onSubmit={onVerifyOtp} className="space-y-5">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                    <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        OTP prepared for {maskedMobileNumber || 'the linked caregiver mobile number'}.
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-600">One-Time Password</label>
                    <div className="relative">
                        <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                            value={otp}
                            onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-center text-2xl font-black text-slate-950 outline-none focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
                            required
                        />
                    </div>
                    <p className="text-xs font-semibold text-slate-500">Enter the six-digit verification code for this access request.</p>
                </div>

                <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 py-4 text-sm font-black text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {loading ? 'Verifying...' : 'Open Digital Card'}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                </button>

                <button
                    type="button"
                    onClick={onBack}
                    className="w-full rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
                >
                    Use another reference number
                </button>
            </form>
        );
    }

    return (
        <form onSubmit={onRequestOtp} className="space-y-5">
            <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-600">Infant Reference Number</label>
                <div className="relative">
                    <FileText className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                        value={referenceNumber}
                        onChange={(event) => setReferenceNumber(event.target.value)}
                        placeholder="Example: REG-2026-0001"
                        autoCapitalize="characters"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 font-black text-slate-950 outline-none focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-900/10"
                        required
                    />
                </div>
                <p className="text-xs font-semibold text-slate-500">
                    Use the registration or code number printed on the RHU child immunization card.
                </p>
            </div>

            <button
                type="submit"
                disabled={loading || !referenceNumber.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 py-4 text-sm font-black text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {loading ? 'Checking record...' : 'Request OTP'}
                {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
        </form>
    );
};

export default CaregiverOtpForm;
