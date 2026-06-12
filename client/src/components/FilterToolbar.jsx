import React from 'react';
import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

/**
 * FilterToolbar Component
 * Provides search, filter, and sort controls for infant lists
 * Supports filter persistence in sessionStorage per category
 */
const FilterToolbar = ({ 
  category,
  searchTerm, 
  onSearchChange, 
  filters, 
  onFiltersChange,
  sortBy,
  onSortChange,
  barangayOptions = [],
  ageGroupOptions = [
    { value: '0-5m', label: '0-5 months' },
    { value: '6-11m', label: '6-11 months' },
    { value: '12-23m', label: '12-23 months' },
    { value: '24m+', label: '24+ months' }
  ],
  vaccineOptions = [],
  assignedBhwOptions = [],
  sortOptions = [
    { value: 'name_asc', label: 'Name (A-Z)' },
    { value: 'name_desc', label: 'Name (Z-A)' },
    { value: 'date_newest', label: 'Date Registered (Newest)' },
    { value: 'date_oldest', label: 'Date Registered (Oldest)' },
    { value: 'age_youngest', label: 'Age (Youngest)' },
    { value: 'age_oldest', label: 'Age (Oldest)' }
  ],
  showBarangayFilter = true,
  showSexFilter = true,
  showAgeGroupFilter = true,
  showVaccineTypeFilter = false,
  showAssignedBhwFilter = false,
  searchPlaceholder = 'Search by name, ID, barangay, or phone...',
  className = ''
}) => {
  const [localSearch, setLocalSearch] = useState(searchTerm || '');

  // Load filters from sessionStorage on mount
  useEffect(() => {
    if (category) {
      const storageKey = `${category}_filters`;
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsedFilters = JSON.parse(stored);
          onFiltersChange(parsedFilters);
        } catch (e) {
          console.error('Failed to parse stored filters:', e);
        }
      }
    }
  }, [category]);

  // Save filters to sessionStorage when they change
  useEffect(() => {
    if (category && filters) {
      const storageKey = `${category}_filters`;
      sessionStorage.setItem(storageKey, JSON.stringify(filters));
    }
  }, [category, filters]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setLocalSearch(value);
    onSearchChange(value);
  };

  const handleClearSearch = () => {
    setLocalSearch('');
    onSearchChange('');
  };

  const handleFilterChange = (filterName, value) => {
    onFiltersChange({
      ...filters,
      [filterName]: value
    });
  };

  const effectiveAgeGroupOptions = ageGroupOptions.length ? ageGroupOptions : [
    { value: '0-5m', label: '0-5 months' },
    { value: '6-11m', label: '6-11 months' },
    { value: '12-23m', label: '12-23 months' },
    { value: '24m+', label: '24+ months' }
  ];
  const effectiveSortOptions = sortOptions.length ? sortOptions : [
    { value: 'name_asc', label: 'Name (A-Z)' },
    { value: 'name_desc', label: 'Name (Z-A)' },
    { value: 'date_newest', label: 'Date Registered (Newest)' },
    { value: 'date_oldest', label: 'Date Registered (Oldest)' },
    { value: 'age_youngest', label: 'Age (Youngest)' },
    { value: 'age_oldest', label: 'Age (Oldest)' }
  ];

  const normalizedBarangayOptions = barangayOptions.map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));
  const normalizedAgeGroupOptions = effectiveAgeGroupOptions.map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));
  const normalizedVaccineOptions = vaccineOptions.map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));
  const normalizedBhwOptions = assignedBhwOptions.map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));
  const normalizedSortOptions = effectiveSortOptions.map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : option
  ));

  const ageGroupValue = filters.ageGroup ?? filters.ageRange ?? 'All';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="search"
          value={localSearch}
          onChange={handleSearchChange}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          aria-label="Search infants by name, ID, barangay, or phone"
        />
        {localSearch && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {showBarangayFilter && (
          <select
            value={filters.barangay || 'All'}
            onChange={(e) => handleFilterChange('barangay', e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            aria-label="Filter by barangay"
          >
            <option value="All">All Barangays</option>
            {normalizedBarangayOptions.map((barangay) => (
              <option key={barangay.value} value={barangay.value}>
                {barangay.label}
              </option>
            ))}
          </select>
        )}

        {showSexFilter && (
          <select
            value={filters.sex || 'All'}
            onChange={(e) => handleFilterChange('sex', e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            aria-label="Filter by sex"
          >
            <option value="All">All Sexes</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        )}

        {showAgeGroupFilter && (
          <select
            value={ageGroupValue}
            onChange={(e) => handleFilterChange(filters.ageGroup !== undefined ? 'ageGroup' : 'ageRange', e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            aria-label="Filter by age group"
          >
            <option value="All">All Age Groups</option>
            {normalizedAgeGroupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {showVaccineTypeFilter && (
          <select
            value={filters.vaccineType || 'All'}
            onChange={(e) => handleFilterChange('vaccineType', e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            aria-label="Filter by vaccine type"
          >
            <option value="All">All Vaccine Types</option>
            {normalizedVaccineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {showAssignedBhwFilter && (
          <select
            value={filters.assignedBhw || 'All'}
            onChange={(e) => handleFilterChange('assignedBhw', e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
            aria-label="Filter by assigned BHW"
          >
            <option value="All">All Assigned BHWs</option>
            {normalizedBhwOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        <select
          value={sortBy || normalizedSortOptions[0]?.value || 'name_asc'}
          onChange={(e) => onSortChange(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          aria-label="Sort by"
        >
          {normalizedSortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default FilterToolbar;
