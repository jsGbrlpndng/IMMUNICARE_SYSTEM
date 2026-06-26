import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MapPin, Settings, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import apiClient from '../../../services/apiClient';

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const formatMetric = (value, digits = 3) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : 'N/A';
};

const normalizeRow = (row = {}) => {
    const clusters = toNumber(row.number_of_clusters ?? row.num_clusters, 0);
    const noise = toNumber(row.number_of_noise_points ?? row.noise_points, 0);
    const coverage = toNumber(row.cluster_coverage_percent ?? row.coverage, 0);

    return {
        epsilon_meters: toNumber(row.epsilon_meters),
        minPts: toNumber(row.minPts ?? row.min_samples),
        number_of_clusters: clusters,
        number_of_noise_points: noise,
        cluster_coverage_percent: coverage,
        dbcv_score: row.dbcv_score,
        silhouette_score: row.silhouette_score,
        davies_bouldin_index: row.davies_bouldin_index,
        calinski_harabasz_index: row.calinski_harabasz_index,
        interpretation: row.interpretation || 'No interpretation available.',
        is_recommended: Boolean(row.is_recommended),
        is_stable: Boolean(row.is_stable),
        noise_percentage: row.noise_percentage ?? (coverage > 0 ? 100 - coverage : 0)
    };
};

const DSSAuditDashboard = () => {
    const [auditData, setAuditData] = useState([]);
    const [summary, setSummary] = useState(null);
    const [recommendation, setRecommendation] = useState(null);
    const [currentSettings, setCurrentSettings] = useState(null);
    const [warnings, setWarnings] = useState([]);
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
    const [selectedRadius, setSelectedRadius] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [applyReason, setApplyReason] = useState('');
    const [applying, setApplying] = useState(false);
    const [applyMessage, setApplyMessage] = useState(null);
    const [applyError, setApplyError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchAuditData = async ({ showLoader = false } = {}) => {
        if (showLoader) setLoading(true);
        try {
            const res = await apiClient.get('/dashboard/dbscan-audit');
            const data = await res.json();
            if (data.success) {
                const rows = Array.isArray(data.parameter_sweep)
                    ? data.parameter_sweep
                    : (Array.isArray(data.data) ? data.data : []);
                const normalizedRows = rows.map(normalizeRow);
                const nextRecommendation = data.best_recommendation || null;
                const nextCurrentSettings = data.current_production_settings || null;
                const preferredRow = normalizedRows.find(row => row.epsilon_meters === toNumber(nextCurrentSettings?.epsilon_meters, null))
                    || normalizedRows.find(row => row.epsilon_meters === toNumber(nextRecommendation?.epsilon_meters, null))
                    || normalizedRows[0]
                    || null;

                setAuditData(normalizedRows);
                setSummary(data.dataset_summary || null);
                setRecommendation(nextRecommendation);
                setCurrentSettings(nextCurrentSettings);
                setSelectedRadius(preferredRow?.epsilon_meters || null);
                setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
                setError(null);
            } else {
                throw new Error(data.error || 'Failed to fetch audit data');
            }
        } catch (err) {
            console.error('DSS Audit Fetch Error:', err);
            setAuditData([]);
            setSummary(null);
            setRecommendation(null);
            setCurrentSettings(null);
            setWarnings([]);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAuditData({ showLoader: true });
    }, []);

    if (loading) {
        return (
            <div className="border border-slate-300 bg-white p-10 text-center min-h-[260px] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-green-600 mb-3" size={32} />
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Loading...</p>
            </div>
        );
    }

    const hasMeaningfulClusters = auditData.length > 0 && auditData.some(row => row.number_of_clusters > 0);
    const recommendedRow = auditData.find(row => row.is_recommended);
    const recommendedRadius = recommendation?.epsilon_meters || recommendedRow?.epsilon_meters;
    const recommendedMinPts = recommendation?.minPts || recommendedRow?.minPts;
    const activeRadius = currentSettings?.epsilon_meters;
    const activeMinPts = currentSettings?.minPts;
    const selectedOption = auditData.find(row => row.epsilon_meters === selectedRadius) || recommendedRow || auditData[0] || null;
    const selectedMinPts = selectedOption?.minPts || recommendedMinPts || activeMinPts || 3;
    const selectedAlreadyActive = activeRadius === selectedOption?.epsilon_meters && activeMinPts === selectedMinPts;
    const radiusOptions = [...auditData].sort((left, right) => left.epsilon_meters - right.epsilon_meters);
    const reasonReady = applyReason.trim().length > 0;
    const evaluationResult = recommendation || recommendedRow
        ? 'Moderate/acceptable hotspot separation'
        : 'Not enough hotspot grouping to recommend a setting yet';

    const openConfirmation = () => {
        if (!selectedOption || !reasonReady || selectedAlreadyActive) return;
        setShowConfirmation(true);
    };

    const applySelectedSetting = async () => {
        if (!selectedOption || !reasonReady) return;

        setApplying(true);
        setApplyError(null);
        setApplyMessage(null);

        try {
            const response = await apiClient.put('/dashboard/dbscan-settings', {
                epsilon_meters: selectedOption.epsilon_meters,
                minPts: selectedMinPts,
                reason: applyReason.trim(),
                selected_dbcv_score: selectedOption.dbcv_score,
                selected_is_recommended: selectedOption.is_recommended,
                confirmed: true
            });
            const payload = await response.json();

            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'Failed to update DBSCAN settings.');
            }

            setApplyMessage('DBSCAN production parameters updated. Evaluation data refreshed.');
            setApplyReason('');
            setShowConfirmation(false);
            await fetchAuditData();
        } catch (applyUpdateError) {
            console.error('DBSCAN settings update failed:', applyUpdateError);
            setApplyError('Unable to update DBSCAN settings. Please try again or contact the system administrator.');
            setShowConfirmation(false);
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="w-full min-w-0">
            <div className="mx-auto w-full max-w-7xl min-w-0 space-y-5">
                <section className="border border-slate-300 bg-white p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-10 w-10 items-center justify-center bg-[#064E3B] text-white">
                                <MapPin className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]">
                                    Super Admin Evaluation
                                </p>
                                <h1 className="mt-1 text-2xl font-black text-slate-950">DBSCAN Hotspot Evaluation Summary</h1>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    {hasMeaningfulClusters
                                        ? 'Review the hotspot radius used for future defaulter hotspot detection and outreach planning.'
                                        : 'No high-risk clusters detected.'}
                                </p>
                            </div>
                        </div>
                        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
                            This setting affects future hotspot detection only. It does not change infant records or vaccination records.
                        </div>
                    </div>
                </section>

                {(activeRadius || recommendedRadius) && (
                    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="border border-slate-300 bg-white px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Current active hotspot radius</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{activeRadius || 'N/A'} meters</p>
                        </div>
                        <div className="border border-slate-300 bg-white px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Current minimum nearby defaulters to form a hotspot</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{activeMinPts || 'N/A'}</p>
                        </div>
                        <div className="border border-emerald-300 bg-emerald-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Recommended radius based on evaluation</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{recommendedRadius || 'N/A'} meters</p>
                        </div>
                        <div className="border border-emerald-300 bg-emerald-50 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Recommended minimum nearby defaulters</p>
                            <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{recommendedMinPts || 'N/A'}</p>
                        </div>
                    </section>
                )}

                <section className="border border-slate-300 bg-white p-5">
                    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                        <div className="space-y-2 text-sm font-semibold text-slate-600">
                        <p>
                            <span className="font-bold text-slate-700">Evaluation result:</span>
                            {' '}{evaluationResult}.
                        </p>
                        <p>
                            <span className="font-bold text-slate-700">Meaning:</span>
                            {' '}The system found conservative hotspot pockets for RHU outreach planning.
                        </p>
                        <p>
                            <span className="font-bold text-slate-700">Outreach meaning:</span>
                            {' '}The setting detects the densest defaulter hotspot pockets.
                        </p>
                        <p>
                            <span className="font-bold text-slate-700">Follow-up note:</span>
                            {' '}Defaulters outside hotspots are still listed as individual follow-up cases.
                        </p>
                        <p>
                            <span className="font-bold text-slate-700">Data safety:</span>
                            {' '}This does not change the actual infant records or vaccination data.
                        </p>
                        <p>
                            <span className="font-bold text-slate-700">Configuration note:</span>
                            {' '}The recommended setting is for evaluation guidance only and is not automatically applied unless approved/configured.
                        </p>
                        </div>

                        <div className="space-y-3">
                            {recommendedRow && recommendedRow.number_of_noise_points > 0 && (
                                <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                                    <AlertTriangle className="mr-2 inline-block" size={16} />
                                    {recommendedRow.number_of_noise_points} mappable defaulter records remain outside hotspot groups and should still receive individual follow-up.
                                </div>
                            )}

                            {summary && (
                                <div className="border border-slate-300 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
                                    Review set: {summary.number_of_eligible_records || 0} eligible defaulters,
                                    {' '}{summary.number_of_mappable_records || 0} with map coordinates,
                                    {' '}{summary.unmapped_defaulters || 0} without coordinates.
                                </div>
                            )}
                        </div>
                    </div>

                    {warnings.length > 0 && (
                        <p className="mt-2 text-xs text-amber-700">{warnings.join(' ')}</p>
                    )}

                    {error && (
                        <p className="mt-2 text-xs text-rose-600">{error}</p>
                    )}
                </section>

            {hasMeaningfulClusters && recommendedRadius && recommendedMinPts && selectedOption && (
                <section className="border border-slate-300 bg-white p-5">
                    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#064E3B]">
                                Controlled Parameter Setting
                            </p>
                            <h2 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-950">
                                <SlidersHorizontal className="text-[#064E3B]" size={18} />
                                Choose hotspot radius to apply
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-600">
                                Select an evaluated radius for future hotspot detection. This setting affects future hotspot detection only.
                            </p>
                        </div>
                        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                            This does not change infant records or vaccination records.
                        </p>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
                        <div className="border border-slate-300 bg-white p-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="border border-slate-300 bg-slate-50 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Current active hotspot radius</p>
                                    <p className="mt-1 text-2xl font-black text-slate-900">{activeRadius || 'N/A'}m</p>
                                    <p className="text-xs font-semibold text-slate-500">Current minimum nearby defaulters: {activeMinPts || 'N/A'}</p>
                                </div>
                                <div className="border border-emerald-300 bg-emerald-50 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#064E3B]">Recommended radius based on evaluation</p>
                                    <p className="mt-1 text-2xl font-black text-emerald-950">{recommendedRadius || 'N/A'}m</p>
                                    <p className="text-xs font-semibold text-emerald-800">Recommended minimum nearby defaulters: {recommendedMinPts || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="mt-4">
                                <label htmlFor="dbscan-radius-select" className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    Select evaluated radius
                                </label>
                                <select
                                    id="dbscan-radius-select"
                                    value={selectedOption.epsilon_meters}
                                    onChange={(event) => setSelectedRadius(Number(event.target.value))}
                                    className="mt-1 h-10 w-full border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#064E3B]"
                                >
                                    {radiusOptions.map(row => (
                                        <option key={row.epsilon_meters} value={row.epsilon_meters}>
                                            {row.epsilon_meters} meters{row.is_recommended ? ' - Recommended by evaluation' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {radiusOptions.map(row => {
                                    const selected = row.epsilon_meters === selectedOption.epsilon_meters;
                                    return (
                                        <button
                                            key={row.epsilon_meters}
                                            type="button"
                                            onClick={() => setSelectedRadius(row.epsilon_meters)}
                                            className={`border px-3 py-2 text-xs font-black transition-colors ${
                                                selected
                                                    ? 'border-[#064E3B] bg-[#064E3B] text-white'
                                                    : row.is_recommended
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            {row.epsilon_meters}m
                                            {row.is_recommended && (
                                                <span className={`ml-2 px-1.5 py-0.5 text-[9px] uppercase ${
                                                    selected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    Recommended
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <label className="mt-4 block">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Approval reason / note</span>
                                <textarea
                                    value={applyReason}
                                    onChange={(event) => setApplyReason(event.target.value)}
                                    rows={3}
                                    maxLength={500}
                                    placeholder="Example: Approved after evaluation review for RHU outreach planning."
                                    className="mt-1 w-full resize-none border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-[#064E3B]"
                                />
                            </label>
                            {!reasonReady && (
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                    Add a short approval note before applying the selected setting.
                                </p>
                            )}
                            {applyMessage && <p className="mt-2 text-xs font-bold text-emerald-700">{applyMessage}</p>}
                            {applyError && <p className="mt-2 text-xs font-bold text-rose-700">{applyError}</p>}
                        </div>

                        <div className="border border-slate-300 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Selected setting summary</p>
                                    <h5 className="mt-1 text-3xl font-black text-slate-900">{selectedOption.epsilon_meters} meters</h5>
                                    <p className="text-sm font-semibold text-slate-600">
                                        Minimum nearby defaulters to form a hotspot: {selectedMinPts}
                                    </p>
                                </div>
                                {selectedOption.is_recommended && (
                                    <span className="inline-flex items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#064E3B]">
                                        <CheckCircle2 size={13} />
                                        Recommended by evaluation
                                    </span>
                                )}
                            </div>

                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <div className="border border-slate-300 bg-slate-50 p-3">
                                    <p className="text-[10px] font-black uppercase text-slate-500">DBCV score</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{formatMetric(selectedOption.dbcv_score)}</p>
                                </div>
                                <div className="border border-slate-300 bg-slate-50 p-3">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Hotspot groups</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{selectedOption.number_of_clusters}</p>
                                </div>
                                <div className="border border-slate-300 bg-slate-50 p-3">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Isolated defaulters</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{selectedOption.number_of_noise_points}</p>
                                </div>
                                <div className="border border-slate-300 bg-slate-50 p-3">
                                    <p className="text-[10px] font-black uppercase text-slate-500">Coverage</p>
                                    <p className="mt-1 text-lg font-black text-slate-900">{formatMetric(selectedOption.cluster_coverage_percent, 2)}%</p>
                                </div>
                            </div>

                            <p className="mt-4 border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                                {selectedOption.interpretation}
                            </p>

                            <button
                                type="button"
                                onClick={openConfirmation}
                                disabled={applying || selectedAlreadyActive || !reasonReady}
                                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 bg-[#064E3B] px-5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-[#053B2D] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                            >
                                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck size={16} />}
                                {selectedAlreadyActive ? 'Selected Setting Active' : 'Update DBSCAN Parameters'}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {!hasMeaningfulClusters ? (
                <section className="border border-slate-300 bg-white px-6 py-8 text-center">
                    <p className="text-sm text-slate-500">
                        No meaningful spatial grouping is available yet. Cluster results will appear once more location-based records are registered.
                    </p>
                </section>
            ) : (
                <section className="border border-slate-300 bg-white">
                    <button
                        type="button"
                        onClick={() => setShowTechnicalDetails(current => !current)}
                        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-50"
                        aria-expanded={showTechnicalDetails}
                    >
                        <span>
                            <span className="flex items-center gap-2 text-sm font-black text-slate-800">
                                <Settings className="text-slate-400" size={16} />
                                Technical Evaluation Details
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                                For Research/Developer Review. Show Full Metric Table.
                            </span>
                        </span>
                        <ChevronDown
                            className={`text-slate-400 transition-transform ${showTechnicalDetails ? 'rotate-180' : ''}`}
                            size={18}
                        />
                    </button>

                    {showTechnicalDetails && (
                        <div className="overflow-x-auto border-t border-slate-300">
                            <table className="min-w-[1120px] w-full text-left border-collapse">
                                <thead className="bg-[#064E3B] text-white">
                                    <tr>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Epsilon</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">MinPts</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Clusters</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Noise</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Coverage</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">DBCV</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Silhouette</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Davies-Bouldin</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Calinski-Harabasz</th>
                                        <th className="border-r border-emerald-800 py-2 px-3 text-[10px] font-black uppercase tracking-wider">Interpretation</th>
                                        <th className="py-2 px-3 text-[10px] font-black uppercase tracking-wider text-right">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditData.map((row, idx) => {
                                        const isRecommended = row.is_recommended && row.number_of_clusters > 0;
                                        const isStable = row.is_stable;
                                        const rowClass = isRecommended
                                            ? 'bg-emerald-50'
                                            : idx % 2 ? 'bg-slate-50' : 'bg-white';

                                        return (
                                            <tr key={`${row.epsilon_meters}-${idx}`} className={rowClass}>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="font-semibold text-slate-700 text-sm">{row.epsilon_meters}m</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="font-medium text-slate-600 text-sm">{row.minPts}</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="font-bold text-slate-800 text-sm">{row.number_of_clusters}</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className={`text-sm font-medium ${row.noise_percentage > 50 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                        {row.number_of_noise_points}
                                                    </span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="text-sm font-medium text-slate-600">{formatMetric(row.cluster_coverage_percent, 2)}%</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="text-sm font-medium text-slate-600">{formatMetric(row.dbcv_score)}</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="text-sm font-medium text-slate-600">{formatMetric(row.silhouette_score)}</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="text-sm font-medium text-slate-600">{formatMetric(row.davies_bouldin_index)}</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3">
                                                    <span className="text-sm font-medium text-slate-600">{formatMetric(row.calinski_harabasz_index)}</span>
                                                </td>
                                                <td className="border-b border-r border-slate-300 py-2 px-3 max-w-xs">
                                                    <span className="text-xs font-medium text-slate-600">{row.interpretation}</span>
                                                </td>
                                                <td className="border-b border-slate-300 py-2 px-3 text-right">
                                                    {isRecommended ? (
                                                        <span className="inline-flex items-center gap-1.5 border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#064E3B]">
                                                            <ShieldCheck size={12} />
                                                            Recommended
                                                        </span>
                                                    ) : isStable ? (
                                                        <span className="inline-flex items-center gap-1 border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            Stable
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                                            <AlertTriangle size={10} />
                                                            Brittle
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {showConfirmation && selectedOption && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 px-4 py-6">
                    <div className="w-full max-w-lg border border-slate-300 bg-white shadow-2xl">
                        <div className="flex items-start justify-between border-b border-slate-300 px-5 py-4">
                            <div>
                                <h4 className="text-lg font-black text-slate-900">Confirm DBSCAN Parameter Update</h4>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Apply {selectedOption.epsilon_meters} meters for future hotspot detection?
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowConfirmation(false)}
                                className="border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                                aria-label="Close confirmation"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="px-5 py-4">
                            <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                                Changing the hotspot radius affects future hotspot detection results. This does not change infant records or vaccination records.
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="border border-slate-300 bg-slate-50 p-3">
                                    <dt className="text-[10px] font-black uppercase text-slate-500">From</dt>
                                    <dd className="mt-1 font-black text-slate-900">{activeRadius || 'N/A'}m / MinPts {activeMinPts || 'N/A'}</dd>
                                </div>
                                <div className="border border-emerald-300 bg-emerald-50 p-3">
                                    <dt className="text-[10px] font-black uppercase text-emerald-700">To</dt>
                                    <dd className="mt-1 font-black text-emerald-950">{selectedOption.epsilon_meters}m / MinPts {selectedMinPts}</dd>
                                </div>
                            </dl>
                            <p className="mt-3 text-xs font-semibold text-slate-500">
                                Approval note: {applyReason.trim()}
                            </p>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-slate-300 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setShowConfirmation(false)}
                                className="border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={applySelectedSetting}
                                disabled={applying}
                                className="inline-flex items-center gap-2 bg-[#064E3B] px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-[#053B2D] disabled:bg-slate-300"
                            >
                                {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                                Confirm Update
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

export default DSSAuditDashboard;
