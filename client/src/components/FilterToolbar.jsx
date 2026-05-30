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

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="search"
          value={localSearch}
          onChange={handleSearchChange}
          placeholder="Search by name, ID, barangay, or phone..."
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
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Barangay Filter */}
        <select
          value={filters.barangay || 'All'}
          onChange={(e) => handleFilterChange('barangay', e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          aria-label="Filter by barangay"
        >
          <option value="All">All Barangays</option>
          {barangayOptions.map((barangay) => (
            <option key={barangay} value={barangay}>
              {barangay}
            </option>
          ))}
        </select>

        {/* Sex Filter */}
        <select
          value={filters.sex || 'All'}
          onChange={(e) => handleFilterChange('sex', e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          aria-label="Filter by sex"
        >
          <option value="All">All Sexes</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        {/* Age Range Filter */}
        <select
          value={filters.ageRange || 'All'}
          onChange={(e) => handleFilterChange('ageRange', e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          aria-label="Filter by age range"
        >
          <option value="All">All Ages</option>
          <option value="0-6">0-6 months</option>
          <option value="6-12">6-12 months</option>
          <option value="12-24">12-24 months</option>
        </select>

        {/* Sort Dropdown */}
        <select
          value={sortBy || 'name_asc'}
          onChange={(e) => onSortChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
          aria-label="Sort by"
        >
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
          <option value="date_newest">Date Registered (Newest)</option>
          <option value="date_oldest">Date Registered (Oldest)</option>
          <option value="age_youngest">Age (Youngest)</option>
          <option value="age_oldest">Age (Oldest)</option>
        </select>
      </div>
    </div>
  );
};

export default FilterToolbar;
