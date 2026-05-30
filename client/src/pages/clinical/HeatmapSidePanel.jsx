import React from 'react';
import {
    MapPin,
    AlertTriangle,
    ArrowRight,
    ArrowLeft,
    Users,
    Activity,
    ClipboardList,
    Filter,
    ShieldCheck
} from 'lucide-react';

const MappingBadge = ({ status }) => {
    if (status === 'Verified') return <span title="Verified Location" className="text-emerald-600"><MapPin size={10} /></span>;
    if (status === 'Approximate') return <span title="Approximate Location" className="text-amber-500 opacity-80"><MapPin size={10} strokeDasharray="2 1" /></span>;
    return <span title="Unmapped / Needs Address Validation" className="text-slate-300"><AlertTriangle size={10} /></span>;
};

const PrioritySummaryCard = ({ mapState, onFocus }) => {
    const topAction = mapState?.recommended_actions?.find(a => a.type === 'FIELD_TARGET');
    if (!topAction) return null;

    return (
        <div className="mb-6 bg-slate-900 border-l-4 border-amber-500 p-5 shadow-lg">
            <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                <Activity size={12} /> Primary Mission Goal
            </h4>
            <div className="flex flex-col gap-1 mb-4">
                <span className="text-white text-lg font-black leading-tight uppercase">{topAction.title.replace('STRATEGIC FOLLOW-UP — ', '').replace('PREVENTIVE TARGET — ', '')}</span>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{topAction.reason}</span>
            </div>
            <div className="bg-white/5 rounded p-3 mb-4 border border-white/10">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                    <span className="text-amber-400 font-black uppercase">Field Goal:</span> Deploy to this area to address <span className="text-white font-black">{topAction.impact.replace(' addressable', '')}</span>. Prioritize high-density defaulter zones.
                </p>
            </div>
            <button 
                onClick={() => onFocus({ lat: topAction.lat, lng: topAction.lng, bounds: topAction.bounds })}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 text-[10px] font-black uppercase tracking-widest py-3 transition-all flex items-center justify-center gap-2"
            >
                Begin Field Triage <ArrowRight size={12} />
            </button>
        </div>
    );
};

const FilterPillContainer = ({ activeFilters, setActiveFilters }) => {
    const toggleStatus = (status) => {
        setActiveFilters(prev => {
            const statuses = prev.statuses.includes(status) 
                ? prev.statuses.filter(s => s !== status)
                : [...prev.statuses, status];
            return { ...prev, statuses };
        });
    };

    const toggleShortcut = (shortcut) => {
        setActiveFilters(prev => {
            const shortcuts = prev.shortcuts.includes(shortcut)
                ? prev.shortcuts.filter(s => s !== shortcut)
                : [shortcut]; // One shortcut at a time for clarity
            return { ...prev, shortcuts };
        });
    };

    return (
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
                {[
                    { id: 'defaulter', label: 'Defaulters', color: 'bg-rose-600' },
                    { id: 'due_today', label: 'Due Today', color: 'bg-amber-500' },
                    { id: 'upcoming', label: 'On Track', color: 'bg-emerald-600' },
                    { id: 'completed', label: 'Completed', color: 'bg-slate-400' }
                ].map(f => (
                    <button
                        key={f.id}
                        onClick={() => toggleStatus(f.id)}
                        className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                            activeFilters.statuses.includes(f.id)
                                ? `${f.color} border-transparent text-white shadow-sm`
                                : `bg-white border-slate-200 text-slate-400 hover:border-slate-300`
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Triage Shortcuts:</span>
                {[
                    { id: 'unmapped_high_risk', label: 'Unmapped High-Risk' },
                    { id: 'address_needs_validation', label: 'Address Issues' },
                    { id: 'mapped_high_risk_only', label: 'Mapped High-Risk' }
                ].map(s => (
                    <button
                        key={s.id}
                        onClick={() => toggleShortcut(s.id)}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                            activeFilters.shortcuts.includes(s.id)
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 shadow-inner'
                        }`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const AreaRankCard = ({ cluster, action, onClick }) => {
    const isCritical = cluster.severity === 'critical';
    const isHigh = cluster.severity === 'high';
    
    let borderClass = 'border-slate-300';
    let textClass = 'text-slate-800';
    let badgeBg = 'bg-slate-200 text-slate-800';
    
    if (isCritical) {
        borderClass = 'border-rose-600';
        textClass = 'text-rose-700';
        badgeBg = 'bg-rose-600 text-white';
    } else if (isHigh) {
        borderClass = 'border-amber-500';
        textClass = 'text-amber-700';
        badgeBg = 'bg-amber-500 text-white';
    }

    return (
        <button 
            onClick={() => onClick(cluster.clusterId, cluster.lat, cluster.lng, cluster.bounds)}
            className={`w-full text-left flex flex-col bg-white border-l-4 ${borderClass} border-y border-r border-slate-200 p-4 hover:bg-slate-50 transition-none mb-3`}
        >
            <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${badgeBg}`}>
                        Rank {cluster.rank}
                    </span>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {cluster.locality}
                    </span>
                </div>
                {isCritical && <AlertTriangle size={14} className="text-rose-600" />}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Infants</span>
                    <span className={`text-lg font-black leading-none ${textClass}`}>{cluster.total_infants}</span>
                </div>
                <div>
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Dose Burden</span>
                    <span className={`text-lg font-black leading-none ${textClass}`}>{cluster.total_defaulter_doses || cluster.total_due_doses || 0}</span>
                </div>
            </div>
        </button>
    );
};

const InfantRow = ({ pt, onFocus }) => {
    const isNonUrgent = pt?.urgency === 'upcoming' || pt?.urgency === 'completed';
    const addressShort = pt?.exact_address
        ? pt.exact_address.split(',').slice(0, 2).join(',').trim()
        : (pt?.purok ? `Purok ${pt.purok}` : (pt?.locality || 'No address'));
        
    return (
        <div className={`border mb-2 transition-all ${isNonUrgent ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}`}>
            <button
                onClick={() => onFocus && onFocus(pt)}
                className="w-full text-left px-4 pt-3 pb-2 flex items-start justify-between gap-3"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-black truncate ${isNonUrgent ? 'text-slate-500' : 'text-slate-900'}`}>{pt?.patient_name}</span>
                        <MappingBadge status={pt?.mapping_readiness} />
                    </div>
                    
                    <span className={`block text-[10px] font-black uppercase tracking-wider mb-1 ${pt?.urgency === 'defaulter' || pt?.urgency === 'overdue' ? 'text-rose-600' : 'text-slate-500'}`}>
                        {pt?.clinical_directive || pt?.urgency?.replace('_', ' ')}
                    </span>
                    
                    {addressShort && (
                        <span className="block text-[9px] text-slate-400 font-bold truncate uppercase tracking-tight">{addressShort}</span>
                    )}
                </div>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                    pt?.urgency === 'defaulter' || pt?.urgency === 'overdue' ? 'bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.4)]' : 
                    (pt?.urgency === 'due_soon' || pt?.urgency === 'due_today' ? 'bg-amber-400' : 'bg-emerald-500')
                }`}></div>
            </button>
            <div className="px-4 pb-3 flex justify-end">
                <button 
                    onClick={() => window.location.href = `/clinical/infants/${pt?.reference_id}`}
                    className={`px-3 py-1.5 text-white text-[9px] font-black uppercase tracking-widest transition-colors ${isNonUrgent ? 'bg-slate-400 hover:bg-slate-500' : 'bg-emerald-700 hover:bg-emerald-800'}`}
                >
                    View Profile
                </button>
            </div>
        </div>
    );
};

const HeatmapSidePanel = ({
    mapState,
    mode,
    derivedCounts,
    selectedClusterId,
    setSelectedClusterId,
    setMapTarget,
    allMarkersForMode,
    handleFocusInfant,
    activeFilters,
    setActiveFilters,
    clusterDeploymentRows = []
}) => {
    const clusters = mapState?.clusters || [];
    const selectedCluster = clusters.find(c => (c.clusterId || c.id) === selectedClusterId);

    const deploymentByLabel = React.useMemo(() => {
        const lookup = new Map();
        (clusterDeploymentRows || []).forEach((row) => {
            const label = (row?.cluster_label || '').toLowerCase().trim();
            if (!label) return;
            if (!lookup.has(label)) lookup.set(label, row);
        });
        return lookup;
    }, [clusterDeploymentRows]);

    const getDeployment = (cluster) => {
        const label = (cluster?.cluster_label || cluster?.locality || '').toLowerCase().trim();
        return label ? deploymentByLabel.get(label) : null;
    };

    const getAssignedDisplay = (cluster) => {
        const deployment = getDeployment(cluster);
        const name = cluster?.assigned_user_name || deployment?.assigned_user_name || cluster?.assigned_bhw_name || deployment?.assigned_bhw_name || 'Pending assignment';
        const role = cluster?.assigned_user_role || deployment?.assigned_user_role || '';
        return role ? `${name} (${role})` : name;
    };

    const handleClusterSelect = (clusterId, lat, lng, bounds) => {
        setSelectedClusterId(clusterId);
        setMapTarget({ lat, lng, bounds });
    };

    if (mode === 'all') {
        const sortedInfants = [...(allMarkersForMode || [])].sort((a, b) => {
            const urgencyOrder = { 'defaulter': 1, 'overdue': 1, 'due_today': 2, 'due_soon': 3, 'upcoming': 4, 'completed': 5 };
            return (urgencyOrder[a.urgency] || 99) - (urgencyOrder[b.urgency] || 99);
        });

        return (
            <div className="flex flex-col h-full bg-slate-50 w-full border-l border-slate-300">
                <div className="px-6 py-5 border-b border-slate-300 bg-white flex-shrink-0">
                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Clinical Action Engine</h2>
                    <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">Individual Triage</h3>
                </div>
                
                <FilterPillContainer 
                    activeFilters={activeFilters} 
                    setActiveFilters={setActiveFilters} 
                    derivedCounts={derivedCounts}
                />

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <PrioritySummaryCard mapState={mapState} onFocus={setMapTarget} />
                    
                    {sortedInfants.length > 0 ? (
                        sortedInfants.map(pt => <InfantRow key={pt.id} pt={pt} onFocus={handleFocusInfant} />)
                    ) : (
                        <div className="p-12 text-center">
                            <ClipboardList className="text-slate-200 mx-auto mb-4" size={48} />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">No Matching Records in this View</span>
                        </div>
                    )}
                </div>
                <div className="bg-slate-900 p-5 flex-shrink-0 border-t-4 border-emerald-700">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Action Roster</span>
                            <span className="text-sm font-black text-white uppercase tracking-widest">{sortedInfants.length} Infants</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // mode === 'priority'
    return (
        <div className="flex flex-col h-full bg-slate-50 w-full border-l border-slate-300">
            <div className="px-6 py-5 border-b border-slate-300 bg-white flex-shrink-0">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Field Deployment & Triage</h2>
                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                    {selectedCluster ? 'Deployment Detail' : 'Priority Outreach Areas'}
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="mb-4 flex items-start gap-3 border border-emerald-200 bg-emerald-50 p-4">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-800" />
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                            Standardized Cluster Detection (Min. 3 Infants)
                        </p>
                        <p className="mt-1 text-[11px] font-semibold leading-5 text-emerald-700">
                            Read-only supervisor view of assigned outreach areas.
                        </p>
                    </div>
                </div>

                {!selectedCluster ? (
                    <>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Active Deployment Areas</h4>
                        {clusters.length > 0 ? (
                            clusters.map((cluster, index) => {
                                const deployment = getDeployment(cluster);
                                const assignedName = getAssignedDisplay(cluster);
                                const status = cluster?.cluster_status || deployment?.cluster_status || 'Pending';
                                const infantCount = cluster?.total_infants || cluster?.assigned_count || deployment?.assigned_count || 0;

                                return (
                                    <button
                                        key={cluster.clusterId || cluster.id || index}
                                        type="button"
                                        onClick={() => handleClusterSelect(cluster.clusterId || cluster.id, cluster.lat, cluster.lng, cluster.bounds)}
                                        className="mb-3 w-full border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-800 hover:bg-slate-50"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{cluster.locality || cluster.cluster_label || `Priority Area ${index + 1}`}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{infantCount} infants in this deployment area</p>
                                            </div>
                                            <span className="border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-rose-700">
                                                Requires Intervention
                                            </span>
                                        </div>
                                        <div className="mt-3 border-t border-slate-200 pt-3 text-[11px] font-bold leading-5 text-slate-600">
                                            Assigned to: <span className="text-slate-900">{assignedName}</span> - Status: <span className="text-emerald-800">{status}</span>
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="p-12 text-center">
                                <Activity className="text-slate-200 mx-auto mb-4" size={48} />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">No active clusters</span>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={() => setSelectedClusterId(null)}
                            className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-slate-900 px-2"
                        >
                            <ArrowLeft size={12} /> Back to Priorities
                        </button>

                        <div className="bg-white border border-slate-300 p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
                                <div>
                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Area</span>
                                    <span className="text-lg font-black text-slate-900 leading-none uppercase">{selectedCluster.locality}</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Severity</span>
                                    <span className={`text-xs font-black uppercase tracking-widest ${selectedCluster.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'}`}>
                                        {selectedCluster.severity}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold leading-5 text-emerald-900">
                                Assigned to: <span className="text-slate-950">{getAssignedDisplay(selectedCluster)}</span> - Status: <span>{selectedCluster?.cluster_status || getDeployment(selectedCluster)?.cluster_status || 'Pending'}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Population</span>
                                    <span className="text-2xl font-black text-slate-900">{selectedCluster.total_infants}</span>
                                </div>
                                <div>
                                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dose Burden</span>
                                    <span className="text-2xl font-black text-rose-600">{selectedCluster.total_defaulter_doses || selectedCluster.total_due_doses || 0}</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 flex items-start gap-3 border border-slate-200">
                                <Activity size={16} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                                <div>
                                    <span className="block text-[10px] font-black text-slate-800 uppercase tracking-widest mb-1">Operational Context</span>
                                    <span className="text-[11px] text-slate-500 font-medium leading-relaxed">{selectedCluster.area_justification || "Optimal deployment zone based on localized dose burden."}</span>
                                </div>
                            </div>
                        </div>

                        <div className="px-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mt-2">Action Roster</h4>
                            <div className="flex flex-col gap-1">
                                {[...selectedCluster.points]
                                    .filter(pt => activeFilters.statuses.includes(pt.urgency))
                                    .sort((a, b) => {
                                        const urgencyOrder = { 'defaulter': 1, 'overdue': 1, 'due_today': 2, 'due_soon': 3, 'upcoming': 4, 'completed': 5 };
                                        return (urgencyOrder[a.urgency] || 99) - (urgencyOrder[b.urgency] || 99);
                                    }).map(pt => <InfantRow key={pt.id} pt={pt} onFocus={handleFocusInfant} />)}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Operational Footer */}
            <div className="bg-slate-900 p-5 flex-shrink-0 border-t-4 border-emerald-700">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Triage Count</span>
                    <span className="text-sm font-black text-white uppercase tracking-widest">{selectedCluster ? selectedCluster.points.filter(p => activeFilters.statuses.includes(p.urgency)).length : (mapState?.all_infants?.filter(p => activeFilters.statuses.includes(p.urgency)).length || 0)} Infants</span>
                </div>
            </div>
        </div>
    );
};

export default HeatmapSidePanel;
