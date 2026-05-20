const fs = require('fs');
let lines = fs.readFileSync('client/src/pages/clinical/MidwifeDashboard.jsx', 'utf8').split('\\n');

const startIndex = 465;
const endIndex = 589;

const newSection = \`                    </div>
                </div>

                {/* Sidebar: Contextual Analytics & Map CTA */}
                <div className="lg:col-span-1 flex flex-col gap-6">

                    {/* Outreach Recommendation */}
                    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
                        <div className="p-6 border-b-2 border-emerald-800 bg-white">
                            <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck size={16} className="text-emerald-800" />
                                <h2 className="text-xs font-black text-emerald-800 uppercase tracking-[0.15em]">Strategic Follow-Up</h2>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recommended Focus Area</p>
                        </div>

                        <div className="p-6">
                            {spatialData.clusters?.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-700 bg-white px-2.5 py-1 rounded-sm border border-rose-600">
                                            Priority Area
                                        </span>
                                        <div className="p-2 bg-rose-50 rounded-sm">
                                            <MapPin size={16} className="text-rose-500" />
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-black text-slate-800">{spatialData.clusters[0].locality}</h3>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                        Concentrated backlog detected. Coordinated <span className="font-bold text-slate-900">home visits</span> are recommended for this sector to improve coverage.
                                    </p>
                                    <div className="bg-emerald-50 border-l-4 border-emerald-800 p-4 rounded-sm">
                                        <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1">Operational Directive</p>
                                        <p className="text-[11px] font-bold text-emerald-600 leading-tight">Address {spatialData.clusters[0].total_infants || spatialData.clusters[0].count} critical cases in this locality.</p>
                                    </div>

                                    <button
                                        onClick={() => navigate('/clinical/map')}
                                        className="w-full text-slate-400 hover:text-emerald-800 hover:bg-emerald-50 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all py-3 border border-slate-100 rounded-sm"
                                    >
                                        <MapIcon size={14} />
                                        View Triage Map
                                        <ChevronRight size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div className="py-12 text-center">
                                    <div className="w-16 h-16 bg-emerald-50 rounded-sm flex items-center justify-center mx-auto mb-4">
                                        <ShieldCheck size={32} className="text-emerald-800" />
                                    </div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-1">Sector Secured</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No spatial risks identified</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. FIELD KIT & BOTTLENECKS GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                <div className="lg:col-span-2 flex flex-col">
                    {/* Dynamic Field Kit Planner */}
                    <div className="bg-white border border-slate-200 border-t-4 border-t-emerald-700 rounded-sm shadow-sm h-[350px] flex flex-col">
                        <div className="p-6 shrink-0 border-b border-slate-100">
                            <h2 className="text-xs font-black text-slate-800 tracking-widest uppercase">SUGGESTED FIELD KIT</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Based on active operational queue</p>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-0 space-y-1">
                            {fieldKitData.length === 0 ? (
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest py-4 text-center">No inventory requirements detected</p>
                            ) : (
                                fieldKitData.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setSelectedVaccineModal(item)}
                                        className="w-full flex justify-between items-center py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer group text-left"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-800 transition-colors">{item.name}</span>
                                        </div>
                                        <span className="text-sm font-black text-emerald-700 bg-emerald-50/50 px-2 py-1 rounded-sm border border-emerald-100 group-hover:bg-emerald-100 group-hover:border-emerald-200 transition-all">
                                            {item.count} Doses
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 flex flex-col">
                    {/* Follow-Up Bottlenecks */}
                    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden flex flex-col h-[350px] transition-all hover:shadow-md">
                        <div className="p-6 border-b-2 border-emerald-800 bg-white shrink-0">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertCircle size={16} className="text-rose-600" />
                                <h2 className="text-xs font-black text-emerald-800 uppercase tracking-[0.15em]">Follow-Up Bottlenecks</h2>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Barriers to effective follow-up</p>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                            {[
                                { label: 'Needs Home Visit', count: bottlenecks.homeVisit, icon: Home, color: 'text-rose-600', bg: 'bg-rose-50', path: '/clinical/registry?urgency=overdue' },
                                { label: 'Unreachable (SMS/Phone)', count: bottlenecks.unreachable, icon: Phone, color: 'text-orange-600', bg: 'bg-orange-50' },
                                { label: 'No Exact Address', count: bottlenecks.addressMissing, icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-50' },
                                { label: 'Severe Overdue (>90d)', count: bottlenecks.severeOverdue, icon: Clock, color: 'text-red-900', bg: 'bg-red-50', path: '/clinical/registry?urgency=overdue' },
                                { label: 'Validation Required', count: bottlenecks.validationRequired, icon: Search, color: 'text-emerald-800', bg: 'bg-emerald-50', path: '/clinical/validation' }
                            ].map((item, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => item.path && navigate(item.path)}
                                    className={\`flex items-center justify-between group p-2.5 rounded-sm transition-all \${item.path ? 'cursor-pointer hover:bg-slate-50 active:scale-[0.98]' : 'cursor-default'}\`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={\`p-2 rounded-sm \${item.bg} \${item.color} group-hover:scale-110 transition-transform\`}>
                                            <item.icon size={16} />
                                        </div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.label}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={\`text-sm font-black \${item.count > 0 ? item.color : 'text-slate-300'}\`}>{item.count}</span>
                                        {item.path && <ChevronRight size={12} className="text-slate-300 group-hover:text-slate-500 transition-colors" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>\`.split('\\n');

lines.splice(startIndex, endIndex - startIndex, ...newSection);
fs.writeFileSync('client/src/pages/clinical/MidwifeDashboard.jsx', lines.join('\\n'));
