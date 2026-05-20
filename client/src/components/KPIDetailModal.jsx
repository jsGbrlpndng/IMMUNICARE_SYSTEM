import { useState, useEffect, useMemo } from 'react';
import { X, Download, MessageSquare } from 'lucide-react';
import FilterToolbar from './FilterToolbar';
import InfantCard from './InfantCard';

/**
 * KPIDetailModal Component
 * Displays detailed infant lists for KPI categories with filtering, sorting, and pagination
 * Supports category-specific features (CPAB, Zero-Dose, Under-Immunized)
 */
const KPIDetailModal = ({ 
  isOpen, 
  onClose, 
  category,
  title,
  icon: Icon,
  infants = [],
  stats = {}
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    barangay: 'All',
    sex: 'All',
    ageRange: 'All'
  });
  const [sortBy, setSortBy] = useState(category === 'zero_dose' ? 'zero_dose_urgent' : 'name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInfants, setSelectedInfants] = useState([]);
  
  const ITEMS_PER_PAGE = 20;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      setSelectedInfants([]);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Filter by search
  const filterBySearch = (infantsList, term) => {
    if (!term) return infantsList;
    
    const searchLower = term.toLowerCase();
    return infantsList.filter(infant => 
      infant.name?.toLowerCase().includes(searchLower) ||
      infant.reference_id?.toLowerCase().includes(searchLower) ||
      infant.barangay?.toLowerCase().includes(searchLower) ||
      infant.caregiver_phone?.includes(searchLower)
    );
  };

  // Apply filters
  const applyFilters = (infantsList, currentFilters) => {
    let filtered = [...infantsList];
    
    if (currentFilters.barangay !== 'All') {
      filtered = filtered.filter(i => i.barangay === currentFilters.barangay);
    }
    
    if (currentFilters.sex !== 'All') {
      filtered = filtered.filter(i => i.sex === currentFilters.sex);
    }
    
    if (currentFilters.ageRange !== 'All') {
      const [min, max] = currentFilters.ageRange.split('-').map(Number);
      filtered = filtered.filter(i => i.age_months >= min && i.age_months < max);
    }
    
    return filtered;
  };

  // Sort infants
  const sortInfants = (infantsList, sortOption) => {
    const sorted = [...infantsList];
    
    switch (sortOption) {
      case 'name_asc':
        return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'name_desc':
        return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'date_newest':
        return sorted.sort((a, b) => new Date(b.registration_date || 0) - new Date(a.registration_date || 0));
      case 'date_oldest':
        return sorted.sort((a, b) => new Date(a.registration_date || 0) - new Date(b.registration_date || 0));
      case 'age_youngest':
        return sorted.sort((a, b) => (a.age_months || 0) - (b.age_months || 0));
      case 'age_oldest':
        return sorted.sort((a, b) => (b.age_months || 0) - (a.age_months || 0));
      case 'zero_dose_urgent':
        return sorted.sort((a, b) => (b.zero_dose_days || 0) - (a.zero_dose_days || 0));
      default:
        return sorted;
    }
  };

  // CPAB-specific filtering
  const filterCPAB = (infantsList) => {
    if (category !== 'cpab') return infantsList;
    
    return infantsList.filter(infant => {
      const status = infant.cpab_status;
      
      // Exclude null/undefined
      if (status === null || status === undefined) return false;
      
      // Include PROTECTED or YES (case-insensitive)
      if (typeof status === 'string') {
        const statusUpper = status.toUpperCase();
        if (statusUpper === 'PROTECTED' || statusUpper === 'YES') return true;
      }
      
      // Include boolean true
      if (status === true) return true;
      
      // Log warning for unexpected values
      if (status && !['PROTECTED', 'YES'].includes(status.toString().toUpperCase())) {
        console.warn(`Unexpected CPAB status value: ${status} for infant ${infant.id}`);
      }
      
      return false;
    });
  };

  // Get unique barangays for filter
  const barangayOptions = useMemo(() => {
    const unique = [...new Set(infants.map(i => i.barangay).filter(Boolean))];
    return unique.sort();
  }, [infants]);

  // Apply all filters and sorting
  const filteredInfants = useMemo(() => {
    let result = infants;
    result = filterCPAB(result);
    result = filterBySearch(result, searchTerm);
    result = applyFilters(result, filters);
    result = sortInfants(result, sortBy);
    return result;
  }, [infants, searchTerm, filters, sortBy, category]);

  // Paginate
  const paginatedInfants = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInfants.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInfants, currentPage]);

  const totalPages = Math.ceil(filteredInfants.length / ITEMS_PER_PAGE);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, sortBy]);

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedInfants(paginatedInfants.map(i => i.id));
    } else {
      setSelectedInfants([]);
    }
  };

  const handleSelectInfant = (id) => {
    setSelectedInfants(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Export CSV
  const handleExportCSV = (selectedOnly = false) => {
    const dataToExport = selectedOnly 
      ? filteredInfants.filter(i => selectedInfants.includes(i.id))
      : filteredInfants;
    
    const headers = ['Name', 'Reference ID', 'Sex', 'Age (months)', 'Barangay', 'Purok', 'Phone', 'Status'];
    const rows = dataToExport.map(i => [
      i.name,
      i.reference_id,
      i.sex,
      i.age_months,
      i.barangay || '',
      i.purok || '',
      i.caregiver_phone || '',
      i.status
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${category}_infants_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Bulk SMS handler
  const handleBulkSMS = () => {
    const infantsToSMS = category === 'zero_dose' && !selectedInfants.length
      ? filteredInfants
      : filteredInfants.filter(i => selectedInfants.includes(i.id));
    
    // TODO: Integrate with existing SMS modal component
    console.log('Send SMS to:', infantsToSMS.map(i => ({ name: i.name, phone: i.caregiver_phone })));
    alert(`SMS feature: Would send to ${infantsToSMS.length} infants`);
  };

  // Individual SMS handler
  const handleSendSMS = (infant) => {
    // TODO: Integrate with existing SMS modal with pre-filled recipient
    console.log('Send SMS to:', infant.name, infant.caregiver_phone);
    alert(`SMS feature: Would send to ${infant.name}`);
  };

  // Record vaccination handler
  const handleRecordVaccination = (infant) => {
    // TODO: Integrate with existing vaccination recording modal
    console.log('Record vaccination for:', infant.name);
    alert(`Vaccination recording: Would open modal for ${infant.name}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-slideUp">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {category === 'cpab' ? 'Children Protected at Birth (CPAB)' : title}
                </h2>
                <p className="text-sm text-slate-500">
                  {filteredInfants.length} of {stats.total || infants.length} records
                  {stats.percentage && ` • ${stats.percentage}% coverage`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4 text-sm">
            <span className="text-slate-600">
              Male: <strong>{stats.male || 0}</strong>
            </span>
            <span className="text-slate-600">
              Female: <strong>{stats.female || 0}</strong>
            </span>
            {stats.recentAdditions !== undefined && (
              <span className="text-slate-600">
                Recent: <strong>+{stats.recentAdditions}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-6 border-b border-slate-200">
          <FilterToolbar
            category={category}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filters={filters}
            onFiltersChange={setFilters}
            sortBy={sortBy}
            onSortChange={setSortBy}
            barangayOptions={barangayOptions}
          />
        </div>

        {/* Infant List */}
        <div className="flex-1 overflow-y-auto p-6">
          {paginatedInfants.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No infants found matching your filters.</p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilters({ barangay: 'All', sex: 'All', ageRange: 'All' });
                }}
                className="mt-4 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedInfants.map((infant, index) => (
                <div 
                  key={infant.id}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                >
                  <InfantCard
                    infant={infant}
                    category={category}
                    isSelected={selectedInfants.includes(infant.id)}
                    onSelect={handleSelectInfant}
                    onSendSMS={handleSendSMS}
                    onRecordVaccination={handleRecordVaccination}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Bulk Actions */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paginatedInfants.length > 0 && selectedInfants.length === paginatedInfants.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                Select All
              </label>
              
              {selectedInfants.length > 0 && (
                <>
                  <button
                    onClick={handleBulkSMS}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Send SMS to Selected ({selectedInfants.length})
                  </button>
                  <button
                    onClick={() => handleExportCSV(true)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-white transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export Selected
                  </button>
                </>
              )}
              
              {category === 'zero_dose' && (
                <button
                  onClick={handleBulkSMS}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  Send Urgent SMS to All Zero-Dose Children
                </button>
              )}
              
              <button
                onClick={() => handleExportCSV(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-white transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredInfants.length)} of {filteredInfants.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPIDetailModal;
