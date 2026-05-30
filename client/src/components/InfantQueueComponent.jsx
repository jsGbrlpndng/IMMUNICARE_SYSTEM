import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby, AlertTriangle, Clock, Calendar, Search, Filter, ChevronRight, CheckCircle, ExternalLink } from 'lucide-react';

const InfantQueueComponent = ({ infants, loading, onInfantSelect, onRefresh }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState('all');
    const [barangayFilter, setBarangayFilter] = useState('');

    // Get unique barangays for filter
    const barangays = [...new Set(infants.map(i => i.barangay).filter(Boolean))];

    // Filter infants
    const filteredInfants = infants.filter(infant => {
        // Search filter
        const matchesSearch = !searchTerm ||
            `${infant.first_name} ${infant.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            infant.reference_id.toLowerCase().includes(searchTerm.toLowerCase());

        // Urgency filter
        const matchesUrgency = urgencyFilter === 'all' || infant.urgency === urgencyFilter;

        // Barangay filter
        const matchesBarangay = !barangayFilter || infant.barangay === barangayFilter;

        return matchesSearch && matchesUrgency && matchesBarangay;
    });

    const getUrgencyBadge = (urgency, daysOverdue) => {
        switch (urgency) {
            case 'overdue':
                return (
                    <span className="flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                        <AlertTriangle className="w-3 h-3" />
                        <span>OVERDUE {daysOverdue ? `(${daysOverdue}d)` : ''}</span>
                    </span>
                );
            case 'due_today':
                return (
                    <span className="flex items-center space-x-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                        <Clock className="w-3 h-3" />
                        <span>DUE TODAY</span>
                    </span>
                );
            case 'pending_validation':
                return (
                    <span className="flex items-center space-x-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                        <Clock className="w-3 h-3" />
                        <span>PENDING VALIDATION</span>
                    </span>
                );
            case 'upcoming':
                return (
                    <span className="flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                        <Calendar className="w-3 h-3" />
                        <span>UPCOMING</span>
                    </span>
                );
            case 'completed':
                return (
                    <span className="flex items-center space-x-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        <CheckCircle className="w-3 h-3" />
                        <span>COMPLETED</span>
                    </span>
                );
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                    </div>

                    {/* Urgency Filter */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            value={urgencyFilter}
                            onChange={(e) => setUrgencyFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none bg-white"
                        >
                            <option value="all">All Urgency Levels</option>
                            <option value="overdue">Overdue</option>
                            <option value="due_today">Due Today</option>
                            <option value="pending_validation">Pending Validation</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>

                    {/* Barangay Filter */}
                    <div>
                        <select
                            value={barangayFilter}
                            onChange={(e) => setBarangayFilter(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none bg-white"
                        >
                            <option value="">All Barangays</option>
                            {barangays.map(barangay => (
                                <option key={barangay} value={barangay}>{barangay}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Infant List */}
            <div className="space-y-3">
                {filteredInfants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <Baby className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Approved Infants Found</h3>
                        <p className="text-slate-500">
                            {searchTerm || urgencyFilter !== 'all' || barangayFilter
                                ? 'Try adjusting your filters'
                                : 'No infants have been approved for vaccination yet'}
                        </p>
                    </div>
                ) : (
                    filteredInfants.map(infant => (
                        <div
                            key={infant.id}
                            onClick={() => onInfantSelect(infant)}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4 flex-1">
                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Baby className="w-6 h-6 text-blue-600" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center space-x-3 mb-1">
                                            <h3 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/clinical/infants/${infant.id}`);
                                                }}
                                                className="font-semibold text-slate-900 text-lg hover:text-[#2E7D32] hover:underline cursor-pointer flex items-center gap-1.5 group/name"
                                            >
                                                {infant.first_name} {infant.last_name}
                                                <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                                            </h3>
                                            {getUrgencyBadge(infant.urgency, infant.days_overdue)}
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm text-slate-600">
                                            <div>
                                                <span className="font-medium">ID:</span> {infant.reference_id}
                                            </div>
                                            <div>
                                                <span className="font-medium">DOB:</span> {new Date(infant.dob).toLocaleDateString()}
                                            </div>
                                            <div>
                                                <span className="font-medium">Age:</span> {infant.age_in_months}m / {infant.age_in_weeks}w
                                            </div>
                                            <div>
                                                <span className="font-medium">Guardian:</span> {infant.guardian_name}
                                            </div>
                                        </div>

                                        <div className="mt-2 text-sm">
                                            <span className="font-medium text-slate-700">Next Due:</span>{' '}
                                            <span className="text-blue-600 font-semibold">{infant.next_due_vaccine || 'None'}</span>
                                            {infant.next_due_date && (
                                                <span className="text-slate-500 ml-2">
                                                    ({new Date(infant.next_due_date).toLocaleDateString()})
                                                </span>
                                            )}
                                        </div>

                                        {infant.barangay && (
                                            <div className="mt-1 text-xs text-slate-500">
                                                {infant.barangay}{infant.purok ? `, ${infant.purok}` : ''}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default InfantQueueComponent;
