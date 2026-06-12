import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Calendar, Loader2, MapPin, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import apiClient from '../services/apiClient';
import { formatFullNameFromObject } from '../utils/formatFullName';

const emptySearch = {
    reference_id: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    dob: ''
};

const readError = async (response, fallback) => {
    try {
        const data = await response.json();
        return data?.message || data?.details || data?.error || fallback;
    } catch {
        return fallback;
    }
};

export default function GlobalInfantSearchModal({
    isOpen,
    onClose,
    onTransferred,
    initialSearch = {},
    user = null
}) {
    const [search, setSearch] = useState(emptySearch);
    const [results, setResults] = useState([]);
    const [queryMeta, setQueryMeta] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [selectedInfant, setSelectedInfant] = useState(null);
    const [transferReason, setTransferReason] = useState('');
    const [transferNotes, setTransferNotes] = useState('');
    const [acknowledged, setAcknowledged] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferError, setTransferError] = useState('');
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }

        if (wasOpenRef.current) return;
        wasOpenRef.current = true;

        setSearch({
            ...emptySearch,
            ...Object.fromEntries(
                Object.entries(initialSearch || {}).map(([key, value]) => [key, value || ''])
            )
        });
        setResults([]);
        setQueryMeta(null);
        setSearchError('');
        setSelectedInfant(null);
        setTransferReason('');
        setTransferNotes('');
        setAcknowledged(false);
        setTransferError('');
    }, [initialSearch, isOpen]);

    const canSubmitSearch = useMemo(() => {
        const hasReference = search.reference_id.trim().length >= 3;
        const hasNameDob = search.first_name.trim().length >= 2
            && search.last_name.trim().length >= 2
            && search.dob.trim().length >= 8;
        return hasReference || hasNameDob;
    }, [search]);
    const isBhw = user?.role === 'BHW';
    const hasCrossBarangayMatch = useMemo(
        () => results.some((row) => row.already_in_catchment === false),
        [results]
    );
    const showDuplicateAlert = isBhw && hasCrossBarangayMatch;

    if (!isOpen) return null;

    const handleSearchChange = (event) => {
        const { name, value } = event.target;
        setSearch((prev) => ({ ...prev, [name]: value }));
    };

    const submitSearch = async (event) => {
        event.preventDefault();
        if (!canSubmitSearch || isSearching) return;

        setIsSearching(true);
        setSearchError('');
        setResults([]);
        setQueryMeta(null);
        setSelectedInfant(null);

        try {
            const params = new URLSearchParams();
            Object.entries(search).forEach(([key, value]) => {
                const trimmed = String(value || '').trim();
                if (trimmed) params.set(key, trimmed);
            });

            const response = await apiClient.get(`/infants/global-search?${params.toString()}`);
            if (!response.ok) {
                throw new Error(await readError(response, 'Global infant search failed.'));
            }

            const data = await response.json();
            setResults(data.matches || []);
            setQueryMeta({
                query_strength: data.query_strength || null,
                current_user_barangay: data.current_user_barangay || user?.assigned_barangay || null
            });
        } catch (error) {
            setSearchError(error.message || 'Global infant search failed.');
        } finally {
            setIsSearching(false);
        }
    };

    const openTransferConfirmation = (infant) => {
        setSelectedInfant(infant);
        setTransferReason('');
        setTransferNotes('');
        setAcknowledged(false);
        setTransferError('');
    };

    const closeTransferConfirmation = () => {
        if (isTransferring) return;
        setSelectedInfant(null);
        setTransferReason('');
        setTransferNotes('');
        setAcknowledged(false);
        setTransferError('');
    };

    const submitTransfer = async (event) => {
        event.preventDefault();
        if (!selectedInfant?.id || !transferReason.trim() || !acknowledged || isTransferring) return;

        setIsTransferring(true);
        setTransferError('');

        try {
            const response = await apiClient.post(`/infants/${selectedInfant.id}/transfer`, {
                reason: transferReason.trim(),
                notes: transferNotes.trim() || null
            });

            if (!response.ok) {
                throw new Error(await readError(response, 'Infant transfer failed.'));
            }

            const data = await response.json();
            onTransferred?.(data);
            onClose?.();
        } catch (error) {
            setTransferError(error.message || 'Infant transfer failed.');
        } finally {
            setIsTransferring(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-emerald-100 bg-emerald-50 text-emerald-800">
                            <Search className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900">Global Patient Search</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                Search the municipal registry before creating a new infant profile.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-5">
                    <form onSubmit={submitSearch} className="grid gap-3 md:grid-cols-12">
                        <label className="md:col-span-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reference ID</span>
                            <input
                                name="reference_id"
                                value={search.reference_id}
                                onChange={handleSearchChange}
                                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-800"
                                placeholder="REG-2026-0001"
                            />
                        </label>
                        <label className="md:col-span-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">First Name</span>
                            <input
                                name="first_name"
                                value={search.first_name}
                                onChange={handleSearchChange}
                                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-800"
                            />
                        </label>
                        <label className="md:col-span-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Middle Name</span>
                            <input
                                name="middle_name"
                                value={search.middle_name}
                                onChange={handleSearchChange}
                                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-800"
                            />
                        </label>
                        <label className="md:col-span-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Last Name</span>
                            <input
                                name="last_name"
                                value={search.last_name}
                                onChange={handleSearchChange}
                                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-800"
                            />
                        </label>
                        <label className="md:col-span-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">DOB</span>
                            <input
                                type="date"
                                name="dob"
                                value={search.dob}
                                onChange={handleSearchChange}
                                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-emerald-800"
                            />
                        </label>
                        <div className="flex items-end md:col-span-1">
                            <button
                                type="submit"
                                disabled={!canSubmitSearch || isSearching}
                                className="flex h-[42px] w-full items-center justify-center rounded-md bg-emerald-800 text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            </button>
                        </div>
                    </form>

                    {searchError && (
                        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
                            {searchError}
                        </div>
                    )}

                    {showDuplicateAlert && (
                        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                            Duplicate Alert: a matching infant exists outside your barangay. Review the identity details and escalate to your Midwife for transfer assessment.
                        </div>
                    )}

                    <div className="mt-5 rounded-md border border-slate-200">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Search Results</span>
                            {queryMeta?.query_strength && (
                                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                    {queryMeta.query_strength.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>

                        {results.length === 0 ? (
                            <div className="px-4 py-12 text-center">
                                <UserRound className="mx-auto h-9 w-9 text-slate-200" />
                                <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">
                                    No matches loaded
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {results.map((infant) => (
                                    <div key={infant.id} className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] md:items-center">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-black uppercase text-slate-900">
                                                    {formatFullNameFromObject(infant)}
                                                </p>
                                                {!isBhw && infant.reference_id && (
                                                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                        {infant.reference_id}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {infant.dob ? new Date(infant.dob).toLocaleDateString() : 'DOB N/A'}
                                                </span>
                                                {!isBhw && <span>{infant.sex || 'Sex N/A'}</span>}
                                                {!isBhw && <span>Mother: {infant.mothers_maiden_name || 'N/A'}</span>}
                                                {!isBhw && <span>Phone: {infant.caregiver_phone_masked || 'N/A'}</span>}
                                            </div>
                                        </div>
                                        <div className="text-[11px] font-bold text-slate-600">
                                            <p className="flex items-center gap-1 font-black uppercase text-slate-800">
                                                <MapPin className="h-3.5 w-3.5 text-emerald-800" />
                                                {infant.current_barangay || 'Barangay N/A'}
                                            </p>
                                            {!isBhw && (
                                                <>
                                                    <p className="mt-1 line-clamp-2">{infant.exact_address || infant.current_address || infant.locality || 'Address N/A'}</p>
                                                    <p className="mt-1 text-slate-400">Last dose: {infant.last_vaccination_date || 'N/A'} · Next: {infant.next_due_vaccine || 'N/A'}</p>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex justify-start md:justify-end">
                                            {infant.already_in_catchment ? (
                                                <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                                    <ShieldCheck className="h-4 w-4" />
                                                    In Catchment
                                                </span>
                                            ) : !isBhw && infant.can_transfer ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openTransferConfirmation(infant)}
                                                    className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-900"
                                                >
                                                    <ArrowRightLeft className="h-4 w-4" />
                                                    Transfer
                                                </button>
                                            ) : (
                                                <span className="rounded-md border border-slate-200 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                                    {isBhw ? 'Midwife Review Required' : 'Review Only'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedInfant && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 px-4">
                    <form onSubmit={submitTransfer} className="w-full max-w-xl rounded-md border border-amber-200 bg-white shadow-2xl">
                        <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-700">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Confirm Internal Transfer</h3>
                                <p className="mt-1 text-sm font-bold text-slate-600">
                                    {formatFullNameFromObject(selectedInfant)}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-4 px-6 py-5">
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700">
                                This will move the infant's current catchment from <b>{selectedInfant.current_barangay || 'current barangay'}</b> to <b>{queryMeta?.current_user_barangay || user?.assigned_barangay || 'your assigned barangay'}</b>. Previous vaccinations will remain credited to the barangay where they were administered.
                            </div>

                            {transferError && (
                                <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
                                    {transferError}
                                </div>
                            )}

                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Transfer Reason</span>
                                <textarea
                                    required
                                    rows={3}
                                    value={transferReason}
                                    onChange={(event) => setTransferReason(event.target.value)}
                                    className="mt-2 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-800"
                                    placeholder="Family moved into catchment"
                                />
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</span>
                                <textarea
                                    rows={2}
                                    value={transferNotes}
                                    onChange={(event) => setTransferNotes(event.target.value)}
                                    className="mt-2 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-800"
                                    placeholder="Optional confirmation details"
                                />
                            </label>
                            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-4 py-3">
                                <input
                                    type="checkbox"
                                    checked={acknowledged}
                                    onChange={(event) => setAcknowledged(event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-800"
                                />
                                <span className="text-sm font-semibold leading-6 text-slate-700">
                                    I confirm this is the same infant and understand that only the current catchment changes.
                                </span>
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={closeTransferConfirmation}
                                disabled={isTransferring}
                                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!transferReason.trim() || !acknowledged || isTransferring}
                                className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                                Confirm Transfer
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
