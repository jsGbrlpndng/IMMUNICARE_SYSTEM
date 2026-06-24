import React from 'react';
import { Check } from 'lucide-react';

export const InputWrapper = ({ label, required, children, hasError, errorMessage }) => (
    <div className="flex flex-col">
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className={`rounded border ${hasError ? 'border-red-500 bg-red-50' : 'border-slate-300'} overflow-hidden focus-within:border-[#065f46] focus-within:ring-1 focus-within:ring-[#065f46] transition-all`}>
            {children}
        </div>
        {hasError && <span className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-widest">{errorMessage || "Required Field"}</span>}
    </div>
);

export const SummaryItem = ({ label, value }) => (
    <div className="flex flex-col border-b border-slate-100 pb-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</span>
        <span className="text-sm font-semibold text-slate-800">{value || <span className="text-slate-300 italic">None Provided</span>}</span>
    </div>
);

export const StepIndicator = ({ currentStep, steps, isReadOnly }) => (
    <div className={`flex items-center justify-between mb-8 px-2 ${isReadOnly ? 'pointer-events-none select-none opacity-80' : ''}`}>
        {steps.map((step, idx) => (
            <div key={idx} className="flex items-center flex-1 last:flex-none">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                    currentStep > idx + 1 ? 'bg-[#065f46] border-[#065f46] text-white' : 
                    currentStep === idx + 1 ? 'border-[#065f46] text-[#065f46] bg-white ring-4 ring-green-50 shadow-md' : 
                    'border-slate-200 text-slate-300 bg-white'
                }`}>
                    {currentStep > idx + 1 ? <Check className="w-5 h-5" /> : <span className="text-[13px] font-black">{idx + 1}</span>}
                </div>
                {idx < steps.length - 1 && (
                    <div className={`h-1 flex-1 mx-2 rounded-full transition-all duration-500 ${currentStep > idx + 1 ? 'bg-[#065f46]' : 'bg-slate-100'}`}></div>
                )}
            </div>
        ))}
    </div>
);

export const inputClasses = "w-full p-3.5 text-sm bg-transparent outline-none text-slate-800 focus:bg-white transition-colors placeholder-slate-400 font-medium";
