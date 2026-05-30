import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BatchVaccinationModal from './BatchVaccinationModal';
import apiClient from '../services/apiClient';

// Mock apiClient
vi.mock('../services/apiClient', () => ({
  default: {
    post: vi.fn()
  }
}));

describe('BatchVaccinationModal', () => {
  const mockInfants = [
    {
      id: 1,
      name: 'Juan Dela Cruz',
      reference_id: 'INF-001',
      sex: 'Male',
      age_months: 6,
      barangay: 'Barangay 1'
    },
    {
      id: 2,
      name: 'Maria Santos',
      reference_id: 'INF-002',
      sex: 'Female',
      age_months: 12,
      barangay: 'Barangay 2'
    },
    {
      id: 3,
      name: 'Pedro Garcia',
      reference_id: 'INF-003',
      sex: 'Male',
      age_months: 3,
      barangay: 'Barangay 1'
    }
  ];

  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal when isOpen is true', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText('Batch Vaccination Entry')).toBeInTheDocument();
    expect(screen.getByText('Vaccinate multiple infants at once with the same vaccine')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <BatchVaccinationModal
        isOpen={false}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.queryByText('Batch Vaccination Entry')).not.toBeInTheDocument();
  });

  it('displays all 14 NIP vaccines in dropdown', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const vaccineSelect = screen.getByRole('combobox', { name: /vaccine type/i });
    const options = vaccineSelect.querySelectorAll('option');
    
    // 14 vaccines + 1 placeholder option = 15 total
    expect(options).toHaveLength(15);
    
    // Check for specific vaccines
    expect(screen.getByRole('option', { name: /BCG/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Hepatitis B Birth Dose/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Pentavalent 1/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /MMR 2/i })).toBeInTheDocument();
  });

  it('filters infants by search term', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search by name or id/i);
    fireEvent.change(searchInput, { target: { value: 'Juan' } });

    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument();
  });

  it('filters infants by barangay', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const barangaySelect = screen.getByDisplayValue('All Barangays');
    fireEvent.change(barangaySelect, { target: { value: 'Barangay 1' } });

    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('Pedro Garcia')).toBeInTheDocument();
    expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument();
  });

  it('filters infants by age range', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const ageSelect = screen.getByDisplayValue('All Ages');
    fireEvent.change(ageSelect, { target: { value: '0-6' } });

    expect(screen.getByText('Pedro Garcia')).toBeInTheDocument();
    expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
    expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument();
  });

  it('allows selecting and deselecting infants', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const firstInfantCheckbox = checkboxes[1]; // Skip "Select All" checkbox

    // Select infant
    fireEvent.click(firstInfantCheckbox);
    expect(screen.getByText(/1 infant selected/i)).toBeInTheDocument();

    // Deselect infant
    fireEvent.click(firstInfantCheckbox);
    expect(screen.getByText(/0 infants selected/i)).toBeInTheDocument();
  });

  it('validates required fields before submission', async () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const applyButton = screen.getByRole('button', { name: /apply to all/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText(/please select a vaccine/i)).toBeInTheDocument();
      expect(screen.getByText(/batch\/lot number is required/i)).toBeInTheDocument();
      expect(screen.getByText(/please select at least one infant/i)).toBeInTheDocument();
    });
  });

  it('shows confirmation dialog before applying', async () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    // Fill in required fields
    const vaccineSelect = screen.getByRole('combobox', { name: /vaccine type/i });
    fireEvent.change(vaccineSelect, { target: { value: 'BCG' } });

    const batchInput = screen.getByPlaceholderText(/e.g., BCG-2024-001/i);
    fireEvent.change(batchInput, { target: { value: 'BCG-2024-001' } });

    // Select an infant
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    // Click apply
    const applyButton = screen.getByRole('button', { name: /apply to all/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Batch Vaccination')).toBeInTheDocument();
      expect(screen.getByText(/you are about to record 1 vaccinations/i)).toBeInTheDocument();
    });
  });

  it('successfully processes batch vaccination', async () => {
    apiClient.post.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    // Fill in required fields
    const vaccineSelect = screen.getByRole('combobox', { name: /vaccine type/i });
    fireEvent.change(vaccineSelect, { target: { value: 'BCG' } });

    const batchInput = screen.getByPlaceholderText(/e.g., BCG-2024-001/i);
    fireEvent.change(batchInput, { target: { value: 'BCG-2024-001' } });

    // Select an infant
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    // Click apply
    const applyButton = screen.getByRole('button', { name: /apply to all/i });
    fireEvent.click(applyButton);

    // Confirm
    await waitFor(() => {
      const confirmButton = screen.getByRole('button', { name: /confirm & apply/i });
      fireEvent.click(confirmButton);
    });

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText('Batch Vaccination Complete!')).toBeInTheDocument();
      expect(screen.getByText(/1 of 1 infants.*successfully vaccinated/i)).toBeInTheDocument();
    });
  });

  it('handles partial failures correctly', async () => {
    // Mock one success and one failure
    apiClient.post
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ 
        ok: false, 
        json: async () => ({ error: 'Duplicate vaccination' }) 
      });

    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    // Fill in required fields
    const vaccineSelect = screen.getByRole('combobox', { name: /vaccine type/i });
    fireEvent.change(vaccineSelect, { target: { value: 'BCG' } });

    const batchInput = screen.getByPlaceholderText(/e.g., BCG-2024-001/i);
    fireEvent.change(batchInput, { target: { value: 'BCG-2024-001' } });

    // Select two infants
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);

    // Click apply and confirm
    const applyButton = screen.getByRole('button', { name: /apply to all/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      const confirmButton = screen.getByRole('button', { name: /confirm & apply/i });
      fireEvent.click(confirmButton);
    });

    // Wait for partial success
    await waitFor(() => {
      expect(screen.getByText('Batch Vaccination Completed with Errors')).toBeInTheDocument();
      expect(screen.getByText(/1 of 2 infants.*successfully vaccinated/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed \(1\)/i)).toBeInTheDocument();
    });
  });

  it('defaults vaccination date to today', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const dateInput = screen.getByLabelText(/vaccination date/i);
    const today = new Date().toISOString().slice(0, 10);
    expect(dateInput.value).toBe(today);
  });

  it('prevents future vaccination dates', async () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const dateInput = screen.getByLabelText(/vaccination date/i);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    fireEvent.change(dateInput, { target: { value: tomorrow.toISOString().slice(0, 10) } });

    // Fill other required fields
    const vaccineSelect = screen.getByRole('combobox', { name: /vaccine type/i });
    fireEvent.change(vaccineSelect, { target: { value: 'BCG' } });

    const batchInput = screen.getByPlaceholderText(/e.g., BCG-2024-001/i);
    fireEvent.change(batchInput, { target: { value: 'BCG-2024-001' } });

    // Select an infant
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    // Try to apply
    const applyButton = screen.getByRole('button', { name: /apply to all/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByText(/cannot record future vaccination dates/i)).toBeInTheDocument();
    });
  });

  it('closes modal when close button is clicked', () => {
    render(
      <BatchVaccinationModal
        isOpen={true}
        onClose={mockOnClose}
        availableInfants={mockInfants}
        onSuccess={mockOnSuccess}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
