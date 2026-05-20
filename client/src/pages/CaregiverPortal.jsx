import { useState } from 'react';
import { Search, ShieldCheck, Calendar, Clock, CheckCircle2, User, Phone, MapPin, ExternalLink, Baby } from 'lucide-react';

const CaregiverPortal = () => {
    const [referenceId, setReferenceId] = useState('');
    const [record, setRecord] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!referenceId.trim()) return;

        setLoading(true);
        setError('');
        setRecord(null);

        try {
            const response = await fetch(`/api/logs/public/${referenceId}`);
            const data = await response.json();

            if (response.ok) {
                setRecord(data);
            } else {
                setError(data.error || 'Record not found. Please check the Reference ID.');
            }
        } catch (err) {
            setError('Network error. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    const calculateAge = (dob) => {
        const birthDate = new Date(dob);
        const today = new Date();
        const months = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24 * 30.44));
        if (months < 12) return `${months} months`;
        return `${Math.floor(months / 12)} years`;
    };

    const formatDate = (dateString, options = { year: 'numeric', month: 'long', day: 'numeric' }) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', options);
    };

    return (
        <div className="max-w-4xl mx-auto py-6">
            {/* Search Header */}
            <div className="flex flex-col items-center text-center mb-12 animate-fade-in px-4">
                <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-glass mb-6">
                    <ShieldCheck size={32} className="text-medical-blue" />
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-navy">Caregiver Portal</h1>
                <p className="text-gray-500 text-lg mt-3 font-medium max-w-lg">
                    Access and verify your child's immunization records securely from any device.
                </p>
            </div>

            {/* Search Box */}
            <div className="card-glass p-10 mb-16 max-w-2xl mx-auto shadow-2xl border-none">
                <form onSubmit={handleSearch} className="space-y-6">
                    <div className="text-center space-y-1">
                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] block">
                            Patient Identification
                        </label>
                        <p className="text-xs text-medical-blue font-bold italic">Enter the Reference ID from the health center</p>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-medical-blue transition-colors" size={24} />
                        <input
                            type="text"
                            value={referenceId}
                            onChange={(e) => setReferenceId(e.target.value.toUpperCase())}
                            placeholder="LG-2026-XXXX"
                            className="w-full pl-16 pr-6 py-6 bg-gray-50 border-none rounded-[24px] text-center font-black text-2xl tracking-[0.1em] text-navy focus:ring-4 ring-blue-50 transition-all uppercase placeholder:text-gray-200"
                            maxLength={12}
                        />
                    </div>

                    {error && (
                        <div className="flex items-center justify-center space-x-2 text-red-500 animate-pulse bg-red-50 py-3 rounded-2xl">
                            <Clock size={16} />
                            <span className="text-xs font-bold">{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-clinical w-full py-5 text-lg flex items-center justify-center space-x-3 shadow-xl shadow-blue-500/20"
                    >
                        {loading ? (
                            <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <span>Locate Records</span>
                                <ExternalLink size={20} />
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Digital Immunization Card */}
            {record && (
                <div className="animate-slide-up space-y-8 px-4">
                    <div className="card-glass overflow-hidden shadow-2xl border-none">
                        {/* ID Card Header */}
                        <div className="bg-[#1A2B48] p-8 text-white relative overflow-hidden">
                            {/* Decorative element */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-medical-blue opacity-10 rounded-full blur-3xl -translate-y-24 translate-x-24" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-400 opacity-5 rounded-full blur-2xl -translate-x-12 translate-y-12" />

                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                                <div className="flex items-center space-x-6">
                                    <div className="w-20 h-20 rounded-[28px] bg-white/10 backdrop-blur-md flex items-center justify-center text-3xl font-black border border-white/10 group-hover:scale-105 transition-transform">
                                        {record.infant.first_name[0]}{record.infant.last_name[0]}
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black tracking-tight">{record.infant.first_name} {record.infant.last_name}</h2>
                                        <div className="flex flex-wrap gap-3 mt-3">
                                            <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">{calculateAge(record.infant.dob)}</span>
                                            <span className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">{record.infant.sex === 'M' ? 'Male' : 'Female'}</span>
                                            <span className="bg-medical-blue/30 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/10">{record.infant.purok} Sector</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-5 rounded-[24px] shadow-2xl min-w-[180px] text-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Official ID</p>
                                    <p className="font-black text-xl text-navy tracking-tight">{record.infant.reference_id}</p>
                                </div>
                            </div>
                        </div>

                        {/* Summary Bar */}
                        <div className="grid grid-cols-2 md:grid-cols-4 bg-gray-50 border-b border-gray-100">
                            <div className="p-6 border-r border-gray-100 flex items-center space-x-3">
                                <Baby size={20} className="text-blue-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Born</p>
                                    <p className="text-xs font-black text-navy">{formatDate(record.infant.dob, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                            </div>
                            <div className="p-6 border-r border-gray-100 flex items-center space-x-3">
                                <CheckCircle2 size={20} className="text-green-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Validated</p>
                                    <p className="text-xs font-black text-navy">{record.records.filter(r => r.is_validated).length} Doses</p>
                                </div>
                            </div>
                            <div className="p-6 border-r border-gray-100 flex items-center space-x-3">
                                <Phone size={18} className="text-medical-blue" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Registered Phone</p>
                                    <p className="text-xs font-black text-navy truncate max-w-[100px]">{record.infant.caregiver_phone || 'None'}</p>
                                </div>
                            </div>
                            <div className="p-6 flex items-center space-x-3">
                                <Clock size={18} className="text-amber-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Next Due</p>
                                    <p className="text-xs font-black text-navy">
                                        {formatDate(record.records.find(r => !r.is_validated)?.scheduled_date, { month: 'short', day: 'numeric' }) || 'Complete'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Detailed Records */}
                        <div className="p-10">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-8">Digital Immunization Timeline</h3>
                            <div className="space-y-4">
                                {record.records.map((vac, idx) => (
                                    <div
                                        key={idx}
                                        className={`group relative flex items-center justify-between p-6 rounded-2xl border transition-all ${vac.is_validated
                                            ? 'bg-white border-green-50 hover:border-green-100 ring-4 ring-green-50/20'
                                            : 'bg-white border-gray-50 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center space-x-5">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm transition-transform group-hover:scale-110 ${vac.is_validated ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="font-black text-navy text-lg">{vac.vaccine_name}</p>
                                                <div className="flex items-center mt-1 space-x-3">
                                                    <div className="flex items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                        <Calendar size={12} className="mr-1.5" />
                                                        Scheduled: {formatDate(vac.scheduled_date)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center">
                                            {vac.is_validated ? (
                                                <div className="text-right">
                                                    <span className="inline-flex items-center px-4 py-2 rounded-xl text-[10px] font-black bg-green-50 text-green-600 border border-green-100 uppercase tracking-widest">
                                                        <CheckCircle2 size={12} className="mr-2" />
                                                        Administered
                                                    </span>
                                                    <p className="text-[9px] font-bold text-gray-300 mt-2 uppercase tracking-tighter">Date: {formatDate(vac.administered_date)}</p>
                                                </div>
                                            ) : (
                                                new Date(vac.scheduled_date) < new Date() ? (
                                                    <span className="inline-flex items-center px-4 py-2 rounded-xl text-[10px] font-black bg-red-50 text-red-600 border border-red-100 uppercase tracking-widest">
                                                        <Clock size={12} className="mr-2" />
                                                        Action Required
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-4 py-2 rounded-xl text-[10px] font-black bg-gray-50 text-gray-400 border border-gray-100 uppercase tracking-widest">
                                                        Upcoming
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-50/50 p-8 text-center border-t border-gray-100">
                            <div className="flex items-center justify-center space-x-2 text-gray-400 mb-2">
                                <ShieldCheck size={16} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Verified Secure Record</span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium">
                                Provided for informational purposes only. For official certifications, please visit the health center.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CaregiverPortal;
