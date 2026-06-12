import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ValidationPage from '../../pages/clinical/ValidationPage';
import apiClient from '../../services/apiClient';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'mw-1',
      role: 'Midwife',
      assigned_barangay: 'Langgam'
    }
  })
}));

vi.mock('../../services/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn()
  }
}));

const buildResponse = (payload) => ({
  ok: true,
  json: vi.fn().mockResolvedValue(payload)
});

describe('ValidationPage transfer inquiry review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows BHW transfer inquiry notes prominently for Midwife review', async () => {
    apiClient.get
      .mockResolvedValueOnce(buildResponse({
        queue: [{
          id: 'reg-transfer-1',
          reference_id: 'REG-2026-3001',
          status: 'PENDING_VALIDATION',
          barangay: 'Langgam',
          first_name: 'Maria',
          middle_name: 'Nicole',
          last_name: 'Santos',
          dob: '2026-01-15',
          duplicate_alert: {
            status: 'TRANSFER_POSSIBLE',
            barangay: 'United Bayanihan',
            message: 'Potential transfer candidate.'
          }
        }],
        stats: { processed_today: 0 }
      }))
      .mockResolvedValueOnce(buildResponse({
        success: true,
        registration: {
          id: 'reg-transfer-1',
          reference_id: 'REG-2026-3001',
          status: 'PENDING_VALIDATION',
          barangay: 'Langgam',
          first_name: 'Maria',
          middle_name: 'Nicole',
          last_name: 'Santos',
          dob: '2026-01-15',
          submitted_by_name: 'BHW Langgam',
          created_at: '2026-06-08T08:00:00.000Z',
          duplicate_alert: {
            status: 'TRANSFER_POSSIBLE',
            barangay: 'United Bayanihan',
            message: 'Potential transfer candidate.'
          },
          transfer_inquiry_notes: 'Caregiver says they transferred from United Bayanihan last week.'
        },
        duplicate_review_context: {
          transfer_inquiry_notes: 'Caregiver says they transferred from United Bayanihan last week.'
        },
        correction_history: []
      }));

    render(
      <MemoryRouter initialEntries={['/clinical/validation?record=reg-transfer-1']}>
        <Routes>
          <Route path="/clinical/validation" element={<ValidationPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Clinical Duplicate Alert')).toBeInTheDocument();
    expect(screen.getByText('Transfer Inquiry Notes')).toBeInTheDocument();
    expect(screen.getByText('Caregiver says they transferred from United Bayanihan last week.')).toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/validation/queue');
      expect(apiClient.get).toHaveBeenCalledWith('/validation/reg-transfer-1');
    });
  });
});
