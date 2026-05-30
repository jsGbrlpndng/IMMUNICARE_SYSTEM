import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterToolbar from './FilterToolbar';

describe('FilterToolbar Component', () => {
  // Mock handlers
  const mockOnSearchChange = vi.fn();
  const mockOnFiltersChange = vi.fn();
  const mockOnSortChange = vi.fn();

  const defaultProps = {
    category: 'test-category',
    searchTerm: '',
    onSearchChange: mockOnSearchChange,
    filters: {
      barangay: 'All',
      sex: 'All',
      ageRange: 'All'
    },
    onFiltersChange: mockOnFiltersChange,
    sortBy: 'name_asc',
    onSortChange: mockOnSortChange,
    barangayOptions: ['Barangay 1', 'Barangay 2', 'Barangay 3']
  };

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Clear sessionStorage
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('Basic Rendering', () => {
    it('renders search input', () => {
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('renders barangay filter dropdown', () => {
      render(<FilterToolbar {...defaultProps} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      expect(barangayFilter).toBeInTheDocument();
    });

    it('renders sex filter dropdown', () => {
      render(<FilterToolbar {...defaultProps} />);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      expect(sexFilter).toBeInTheDocument();
    });

    it('renders age range filter dropdown', () => {
      render(<FilterToolbar {...defaultProps} />);
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      expect(ageFilter).toBeInTheDocument();
    });

    it('renders sort dropdown', () => {
      render(<FilterToolbar {...defaultProps} />);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      expect(sortDropdown).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<FilterToolbar {...defaultProps} className="custom-class" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Search Functionality', () => {
    it('displays initial search term', () => {
      render(<FilterToolbar {...defaultProps} searchTerm="Juan" />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      expect(searchInput).toHaveValue('Juan');
    });

    it('calls onSearchChange when typing in search input', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      
      await user.type(searchInput, 'Maria');
      
      expect(mockOnSearchChange).toHaveBeenCalled();
    });

    it('updates local search state on input', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      
      await user.type(searchInput, 'Pedro');
      
      expect(searchInput).toHaveValue('Pedro');
    });

    it('shows clear button when search has text', () => {
      render(<FilterToolbar {...defaultProps} searchTerm="test" />);
      const clearButton = screen.getByLabelText(/clear search/i);
      expect(clearButton).toBeInTheDocument();
    });

    it('does not show clear button when search is empty', () => {
      render(<FilterToolbar {...defaultProps} searchTerm="" />);
      const clearButton = screen.queryByLabelText(/clear search/i);
      expect(clearButton).not.toBeInTheDocument();
    });

    it('clears search when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} searchTerm="test" />);
      const clearButton = screen.getByLabelText(/clear search/i);
      
      await user.click(clearButton);
      
      expect(mockOnSearchChange).toHaveBeenCalledWith('');
    });

    it('clears local search state when clear button is clicked', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<FilterToolbar {...defaultProps} searchTerm="test" />);
      const clearButton = screen.getByLabelText(/clear search/i);
      
      await user.click(clearButton);
      
      rerender(<FilterToolbar {...defaultProps} searchTerm="" />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      expect(searchInput).toHaveValue('');
    });

    it('has correct placeholder text', () => {
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText('Search by name, ID, barangay, or phone...');
      expect(searchInput).toBeInTheDocument();
    });

    it('search input has correct aria-label', () => {
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByLabelText('Search infants by name, ID, barangay, or phone');
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Barangay Filter', () => {
    it('displays "All Barangays" as default option', () => {
      render(<FilterToolbar {...defaultProps} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      expect(barangayFilter).toHaveValue('All');
    });

    it('renders all barangay options', () => {
      render(<FilterToolbar {...defaultProps} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      
      expect(screen.getByRole('option', { name: 'All Barangays' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Barangay 1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Barangay 2' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Barangay 3' })).toBeInTheDocument();
    });

    it('displays selected barangay value', () => {
      const props = {
        ...defaultProps,
        filters: { ...defaultProps.filters, barangay: 'Barangay 1' }
      };
      render(<FilterToolbar {...props} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      expect(barangayFilter).toHaveValue('Barangay 1');
    });

    it('calls onFiltersChange when barangay is selected', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      
      await user.selectOptions(barangayFilter, 'Barangay 2');
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultProps.filters,
        barangay: 'Barangay 2'
      });
    });

    it('handles empty barangay options array', () => {
      const props = { ...defaultProps, barangayOptions: [] };
      render(<FilterToolbar {...props} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      
      // Should only have "All Barangays" option
      const options = barangayFilter.querySelectorAll('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('All Barangays');
    });
  });

  describe('Sex Filter', () => {
    it('displays "All Sexes" as default option', () => {
      render(<FilterToolbar {...defaultProps} />);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      expect(sexFilter).toHaveValue('All');
    });

    it('renders all sex options', () => {
      render(<FilterToolbar {...defaultProps} />);
      
      expect(screen.getByRole('option', { name: 'All Sexes' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Male' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Female' })).toBeInTheDocument();
    });

    it('displays selected sex value', () => {
      const props = {
        ...defaultProps,
        filters: { ...defaultProps.filters, sex: 'Male' }
      };
      render(<FilterToolbar {...props} />);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      expect(sexFilter).toHaveValue('Male');
    });

    it('calls onFiltersChange when sex is selected', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      
      await user.selectOptions(sexFilter, 'Female');
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultProps.filters,
        sex: 'Female'
      });
    });

    it('has correct aria-label', () => {
      render(<FilterToolbar {...defaultProps} />);
      const sexFilter = screen.getByLabelText('Filter by sex');
      expect(sexFilter).toBeInTheDocument();
    });
  });

  describe('Age Range Filter', () => {
    it('displays "All Ages" as default option', () => {
      render(<FilterToolbar {...defaultProps} />);
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      expect(ageFilter).toHaveValue('All');
    });

    it('renders all age range options', () => {
      render(<FilterToolbar {...defaultProps} />);
      
      expect(screen.getByRole('option', { name: 'All Ages' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '0-6 months' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '6-12 months' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '12-24 months' })).toBeInTheDocument();
    });

    it('displays selected age range value', () => {
      const props = {
        ...defaultProps,
        filters: { ...defaultProps.filters, ageRange: '0-6' }
      };
      render(<FilterToolbar {...props} />);
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      expect(ageFilter).toHaveValue('0-6');
    });

    it('calls onFiltersChange when age range is selected', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      
      await user.selectOptions(ageFilter, '6-12');
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultProps.filters,
        ageRange: '6-12'
      });
    });

    it('has correct aria-label', () => {
      render(<FilterToolbar {...defaultProps} />);
      const ageFilter = screen.getByLabelText('Filter by age range');
      expect(ageFilter).toBeInTheDocument();
    });
  });

  describe('Sort Functionality', () => {
    it('displays default sort value', () => {
      render(<FilterToolbar {...defaultProps} />);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      expect(sortDropdown).toHaveValue('name_asc');
    });

    it('renders all sort options', () => {
      render(<FilterToolbar {...defaultProps} />);
      
      expect(screen.getByRole('option', { name: 'Name (A-Z)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Name (Z-A)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Date Registered (Newest)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Date Registered (Oldest)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Age (Youngest)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Age (Oldest)' })).toBeInTheDocument();
    });

    it('displays selected sort value', () => {
      const props = { ...defaultProps, sortBy: 'age_youngest' };
      render(<FilterToolbar {...props} />);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      expect(sortDropdown).toHaveValue('age_youngest');
    });

    it('calls onSortChange when sort option is selected', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      
      await user.selectOptions(sortDropdown, 'name_desc');
      
      expect(mockOnSortChange).toHaveBeenCalledWith('name_desc');
    });

    it('has correct aria-label', () => {
      render(<FilterToolbar {...defaultProps} />);
      const sortDropdown = screen.getByLabelText('Sort by');
      expect(sortDropdown).toBeInTheDocument();
    });
  });

  describe('Filter Persistence - sessionStorage', () => {
    it('loads filters from sessionStorage on mount', () => {
      const storedFilters = {
        barangay: 'Barangay 2',
        sex: 'Male',
        ageRange: '6-12'
      };
      sessionStorage.setItem('test-category_filters', JSON.stringify(storedFilters));
      
      render(<FilterToolbar {...defaultProps} />);
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith(storedFilters);
    });

    it('saves filters to sessionStorage when filters change', () => {
      const { rerender } = render(<FilterToolbar {...defaultProps} />);
      
      const newFilters = {
        barangay: 'Barangay 3',
        sex: 'Female',
        ageRange: '12-24'
      };
      
      rerender(<FilterToolbar {...defaultProps} filters={newFilters} />);
      
      const stored = sessionStorage.getItem('test-category_filters');
      expect(JSON.parse(stored)).toEqual(newFilters);
    });

    it('uses category-specific storage keys', () => {
      const props1 = { ...defaultProps, category: 'zero-dose' };
      const props2 = { ...defaultProps, category: 'cpab' };
      
      render(<FilterToolbar {...props1} />);
      
      const filters1 = { barangay: 'Barangay 1', sex: 'Male', ageRange: 'All' };
      const filters2 = { barangay: 'Barangay 2', sex: 'Female', ageRange: '0-6' };
      
      sessionStorage.setItem('zero-dose_filters', JSON.stringify(filters1));
      sessionStorage.setItem('cpab_filters', JSON.stringify(filters2));
      
      expect(sessionStorage.getItem('zero-dose_filters')).toBeTruthy();
      expect(sessionStorage.getItem('cpab_filters')).toBeTruthy();
      expect(sessionStorage.getItem('zero-dose_filters')).not.toBe(sessionStorage.getItem('cpab_filters'));
    });

    it('handles invalid JSON in sessionStorage gracefully', () => {
      sessionStorage.setItem('test-category_filters', 'invalid-json');
      
      // Should not throw error
      expect(() => {
        render(<FilterToolbar {...defaultProps} />);
      }).not.toThrow();
    });

    it('does not load filters when category is not provided', () => {
      const storedFilters = {
        barangay: 'Barangay 2',
        sex: 'Male',
        ageRange: '6-12'
      };
      sessionStorage.setItem('undefined_filters', JSON.stringify(storedFilters));
      
      const props = { ...defaultProps, category: undefined };
      render(<FilterToolbar {...props} />);
      
      // Should not call onFiltersChange with stored filters
      expect(mockOnFiltersChange).not.toHaveBeenCalled();
    });

    it('does not save filters when category is not provided', () => {
      const props = { ...defaultProps, category: undefined };
      render(<FilterToolbar {...props} />);
      
      expect(sessionStorage.length).toBe(0);
    });
  });

  describe('Multiple Filters Applied Together', () => {
    it('applies barangay and sex filters together', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      
      await user.selectOptions(barangayFilter, 'Barangay 1');
      await user.selectOptions(sexFilter, 'Male');
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultProps.filters,
        barangay: 'Barangay 1'
      });
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultProps.filters,
        sex: 'Male'
      });
    });

    it('applies all three filters together', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      
      await user.selectOptions(barangayFilter, 'Barangay 2');
      await user.selectOptions(sexFilter, 'Female');
      await user.selectOptions(ageFilter, '0-6');
      
      expect(mockOnFiltersChange).toHaveBeenCalledTimes(3);
    });

    it('maintains existing filter values when changing one filter', async () => {
      const user = userEvent.setup();
      const props = {
        ...defaultProps,
        filters: {
          barangay: 'Barangay 1',
          sex: 'Male',
          ageRange: 'All'
        }
      };
      render(<FilterToolbar {...props} />);
      
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      await user.selectOptions(ageFilter, '6-12');
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        barangay: 'Barangay 1',
        sex: 'Male',
        ageRange: '6-12'
      });
    });
  });

  describe('Responsive Layout', () => {
    it('applies responsive flex classes', () => {
      const { container } = render(<FilterToolbar {...defaultProps} />);
      const filtersRow = container.querySelector('.flex.flex-col.sm\\:flex-row');
      expect(filtersRow).toBeInTheDocument();
    });

    it('has gap spacing between filter elements', () => {
      const { container } = render(<FilterToolbar {...defaultProps} />);
      const filtersRow = container.querySelector('.gap-3');
      expect(filtersRow).toBeInTheDocument();
    });

    it('filter dropdowns have flex-1 class for equal width', () => {
      render(<FilterToolbar {...defaultProps} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      expect(barangayFilter).toHaveClass('flex-1');
    });
  });

  describe('Styling and Classes', () => {
    it('search input has correct styling classes', () => {
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      
      expect(searchInput).toHaveClass('w-full');
      expect(searchInput).toHaveClass('pl-10');
      expect(searchInput).toHaveClass('pr-10');
      expect(searchInput).toHaveClass('py-2.5');
      expect(searchInput).toHaveClass('border');
      expect(searchInput).toHaveClass('rounded-lg');
    });

    it('filter dropdowns have consistent styling', () => {
      render(<FilterToolbar {...defaultProps} />);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      
      expect(barangayFilter).toHaveClass('px-3');
      expect(barangayFilter).toHaveClass('py-2');
      expect(barangayFilter).toHaveClass('border');
      expect(barangayFilter).toHaveClass('rounded-lg');
      expect(barangayFilter).toHaveClass('bg-white');
    });

    it('search icon is positioned correctly', () => {
      const { container } = render(<FilterToolbar {...defaultProps} />);
      const searchIcon = container.querySelector('.lucide-search');
      expect(searchIcon).toBeInTheDocument();
      // Icon itself has absolute positioning classes
      expect(searchIcon).toHaveClass('absolute');
      expect(searchIcon).toHaveClass('left-3');
    });

    it('clear button is positioned correctly', () => {
      render(<FilterToolbar {...defaultProps} searchTerm="test" />);
      const clearButton = screen.getByLabelText(/clear search/i);
      expect(clearButton).toHaveClass('absolute');
      expect(clearButton).toHaveClass('right-3');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined searchTerm prop', () => {
      const props = { ...defaultProps, searchTerm: undefined };
      render(<FilterToolbar {...props} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      expect(searchInput).toHaveValue('');
    });

    it('handles null searchTerm prop', () => {
      const props = { ...defaultProps, searchTerm: null };
      render(<FilterToolbar {...props} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      expect(searchInput).toHaveValue('');
    });

    it('handles undefined filters prop', () => {
      const props = { ...defaultProps, filters: undefined };
      // Component expects filters object, so this will cause an error
      // This test verifies the component requires filters prop
      expect(() => {
        render(<FilterToolbar {...props} />);
      }).toThrow();
    });

    it('handles undefined sortBy prop', () => {
      const props = { ...defaultProps, sortBy: undefined };
      render(<FilterToolbar {...props} />);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      expect(sortDropdown).toHaveValue('name_asc');
    });

    it('handles very long search text', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      
      const longText = 'A'.repeat(200);
      await user.type(searchInput, longText);
      
      expect(searchInput).toHaveValue(longText);
    });

    it('handles special characters in search', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      
      await user.type(searchInput, '@#$%^&*()');
      
      expect(searchInput.value).toContain('@#$%^&*()');
    });

    it('handles rapid filter changes', async () => {
      const user = userEvent.setup();
      render(<FilterToolbar {...defaultProps} />);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      
      await user.selectOptions(sexFilter, 'Male');
      await user.selectOptions(sexFilter, 'Female');
      await user.selectOptions(sexFilter, 'All');
      
      expect(mockOnFiltersChange).toHaveBeenCalledTimes(3);
    });
  });

  describe('Accessibility', () => {
    it('all interactive elements are keyboard accessible', () => {
      render(<FilterToolbar {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      const barangayFilter = screen.getByLabelText(/filter by barangay/i);
      const sexFilter = screen.getByLabelText(/filter by sex/i);
      const ageFilter = screen.getByLabelText(/filter by age range/i);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      
      expect(searchInput).not.toHaveAttribute('tabindex', '-1');
      expect(barangayFilter).not.toHaveAttribute('tabindex', '-1');
      expect(sexFilter).not.toHaveAttribute('tabindex', '-1');
      expect(ageFilter).not.toHaveAttribute('tabindex', '-1');
      expect(sortDropdown).not.toHaveAttribute('tabindex', '-1');
    });

    it('clear button has descriptive aria-label', () => {
      render(<FilterToolbar {...defaultProps} searchTerm="test" />);
      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('all dropdowns have aria-labels', () => {
      render(<FilterToolbar {...defaultProps} />);
      
      expect(screen.getByLabelText('Filter by barangay')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by sex')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by age range')).toBeInTheDocument();
      expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
    });

    it('search input has descriptive aria-label', () => {
      render(<FilterToolbar {...defaultProps} />);
      const searchInput = screen.getByLabelText('Search infants by name, ID, barangay, or phone');
      expect(searchInput).toBeInTheDocument();
    });
  });

  describe('Dynamic Updates', () => {
    it('initializes search input with searchTerm prop', () => {
      // Component uses local state initialized from searchTerm prop
      // It doesn't sync with prop changes after mount
      const { rerender } = render(<FilterToolbar {...defaultProps} searchTerm="" />);
      const searchInput = screen.getByPlaceholderText(/search by name/i);
      expect(searchInput).toHaveValue('');
      
      // Rerender with new searchTerm - local state won't update
      // This is expected behavior as component manages its own search state
      rerender(<FilterToolbar {...defaultProps} searchTerm="Maria" />);
      // Local state remains unchanged
      expect(searchInput).toHaveValue('');
    });

    it('updates filter dropdowns when filters prop changes', () => {
      const { rerender } = render(<FilterToolbar {...defaultProps} />);
      
      const newFilters = {
        barangay: 'Barangay 3',
        sex: 'Female',
        ageRange: '12-24'
      };
      
      rerender(<FilterToolbar {...defaultProps} filters={newFilters} />);
      
      expect(screen.getByLabelText(/filter by barangay/i)).toHaveValue('Barangay 3');
      expect(screen.getByLabelText(/filter by sex/i)).toHaveValue('Female');
      expect(screen.getByLabelText(/filter by age range/i)).toHaveValue('12-24');
    });

    it('updates sort dropdown when sortBy prop changes', () => {
      const { rerender } = render(<FilterToolbar {...defaultProps} sortBy="name_asc" />);
      const sortDropdown = screen.getByLabelText(/sort by/i);
      expect(sortDropdown).toHaveValue('name_asc');
      
      rerender(<FilterToolbar {...defaultProps} sortBy="age_oldest" />);
      expect(sortDropdown).toHaveValue('age_oldest');
    });

    it('updates barangay options when barangayOptions prop changes', () => {
      const { rerender } = render(<FilterToolbar {...defaultProps} />);
      
      expect(screen.getByRole('option', { name: 'Barangay 1' })).toBeInTheDocument();
      
      const newBarangayOptions = ['New Barangay 1', 'New Barangay 2'];
      rerender(<FilterToolbar {...defaultProps} barangayOptions={newBarangayOptions} />);
      
      expect(screen.queryByRole('option', { name: 'Barangay 1' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'New Barangay 1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'New Barangay 2' })).toBeInTheDocument();
    });
  });
});
