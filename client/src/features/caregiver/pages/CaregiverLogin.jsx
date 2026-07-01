import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import CaregiverOtpForm from '../components/CaregiverOtpForm';
import caregiverApi from '../../../services/caregiverApi';
import BrandLogo from '../../../components/brand/BrandLogo';

const CaregiverLogin = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState('reference');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [maskedMobileNumber, setMaskedMobileNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const session = caregiverApi.getSession();
        if (caregiverApi.getToken() && session?.infant_id) {
            navigate(`/caregiver/infants/${session.infant_id}/card`, { replace: true });
        }
    }, [navigate]);

    const handleRequestOtp = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError('');

        try {
            const data = await caregiverApi.requestOtp(referenceNumber.trim());
            setMaskedMobileNumber(data.mobile_number_masked || '');
            setReferenceNumber(data.reference_number || referenceNumber.trim());
            setStep('otp');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError('');

        try {
            const data = await caregiverApi.verifyOtp(referenceNumber.trim(), otp);
            caregiverApi.setSession(data.authToken, data.caregiver);
            navigate(`/caregiver/infants/${data.caregiver.infant_id}/card`, { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setStep('reference');
        setOtp('');
        setError('');
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-950">
            <nav className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
                    <Link to="/" className="flex items-center gap-2">
                        <BrandLogo
                            variant="lockup"
                            subtitle="Caregiver Access"
                            imageClassName="h-10 w-10"
                            subtitleClassName="tracking-[0.14em]"
                        />
                    </Link>
                    <Link to="/" className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-emerald-900">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </nav>

            <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[1fr_440px]">
                <section className="hidden rounded-lg bg-emerald-950 p-8 text-white lg:block">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase">
                        <ShieldCheck className="h-4 w-4" />
                        RHU child immunization card
                    </div>
                    <h1 className="mt-8 max-w-xl text-4xl font-black leading-tight">
                        View your child's official immunization record using the RHU reference number.
                    </h1>
                    <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-emerald-50/80">
                        Enter the registration or code number from the physical card. IMMUNICARE will verify the linked caregiver mobile number before opening the read-only digital card.
                    </p>
                    <div className="mt-8 grid grid-cols-3 gap-3">
                        {['Reference Number', 'OTP Verification', 'Digital Card'].map((label) => (
                            <div key={label} className="rounded-lg border border-white/15 bg-white/10 p-4">
                                <p className="text-sm font-black">{label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <div className="mb-7">
                        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-emerald-800 text-white">
                            <ShieldCheck className="h-7 w-7" />
                        </div>
                        <p className="text-xs font-black uppercase text-emerald-800">Parent / Caregiver Portal</p>
                        <h2 className="mt-2 text-3xl font-black text-slate-950">Digital Immunization Card</h2>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                            This portal is read-only and separate from staff login.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-5 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
                            {error}
                        </div>
                    )}

                    <CaregiverOtpForm
                        step={step}
                        referenceNumber={referenceNumber}
                        setReferenceNumber={setReferenceNumber}
                        otp={otp}
                        setOtp={setOtp}
                        maskedMobileNumber={maskedMobileNumber}
                        loading={loading}
                        onRequestOtp={handleRequestOtp}
                        onVerifyOtp={handleVerifyOtp}
                        onBack={handleBack}
                    />
                </section>
            </main>
        </div>
    );
};

export default CaregiverLogin;
