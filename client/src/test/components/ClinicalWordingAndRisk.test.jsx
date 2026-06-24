import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge';
import InfantRegistry from '../../features/registry/pages/InfantRegistry';
import { getClinicalStatusMeta, CLINICAL_STATUS } from '../../utils/clinicalStatus';
import apiClient from '../../services/apiClient';

// Mock AuthContext
vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam'
        }
    })
}));

// Mock apiClient
vi.mock('../../services/apiClient', () => ({
    default: {
        get: vi.fn()
    }
}));

const buildResponse = (payload) => ({
    ok: true,
    json: vi.fn().mockResolvedValue(payload)
});

describe('Clinical Wording and Risk Badge Standardization Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('proves UP_TO_DATE internal status renders visibly as ON TRACK', () => {
        const meta = getClinicalStatusMeta(CLINICAL_STATUS.UP_TO_DATE);
        expect(meta.label).toBe('On Track');

        render(<StatusBadge status={CLINICAL_STATUS.UP_TO_DATE} />);
        const badge = screen.getByText('On Track');
        expect(badge).toBeInTheDocument();
    });

    it('proves Infant Registry renders ON TRACK status and NO ACTIVE RISK tier for completed/immunized infants', async () => {
        const mockInfants = [
            {
                id: 'infant-1',
                reference_id: 'REG-001',
                first_name: 'Baby',
                last_name: 'One',
                dob: '2025-01-01',
                barangay: 'Langgam',
                purok: 'Purok 1',
                mothers_maiden_name: 'Mother One',
                next_due_vaccine: null,
                next_due_date: null,
                urgency: 'completed',
                computed_schedule_status: 'CIC',
                clinical_status: 'FULLY_IMMUNIZED'
            },
            {
                id: 'infant-2',
                reference_id: 'REG-002',
                first_name: 'Baby',
                last_name: 'Two',
                dob: '2025-10-01',
                barangay: 'Langgam',
                purok: 'Purok 2',
                mothers_maiden_name: 'Mother Two',
                next_due_vaccine: 'PENTA-1',
                next_due_date: '2026-06-30',
                urgency: 'upcoming',
                computed_schedule_status: 'ON_TRACK',
                clinical_status: 'UP_TO_DATE'
            }
        ];

        apiClient.get.mockResolvedValueOnce(buildResponse({
            infants: mockInfants,
            pagination: { totalRecords: 2, totalPages: 1 },
            filter_options: {
                barangays: ['Langgam'],
                assignedBhws: [],
                vaccineTypes: [],
                ageGroups: [],
                sortOptions: []
            }
        }));

        render(
            <MemoryRouter initialEntries={['/clinical/registry']}>
                <Routes>
                    <Route path="/clinical/registry" element={<InfantRegistry />} />
                </Routes>
            </MemoryRouter>
        );

        // Wait for registry rows to load
        expect(await screen.findByText('Baby One')).toBeInTheDocument();
        expect(screen.getByText('Baby Two')).toBeInTheDocument();

        // 1. Proves Fully Immunized infant does not show LOW RISK but shows NO ACTIVE RISK
        const completedRisk = screen.getByText('No Active Risk');
        expect(completedRisk).toBeInTheDocument();
        
        // Baby One (Completed) should NOT show Low Risk, while Baby Two (On Track) should.
        // Therefore, there should only be exactly 1 'Low Risk' badge in the list.
        const lowRiskLabelsBefore = screen.getAllByText('Low Risk');
        expect(lowRiskLabelsBefore).toHaveLength(1);

        // 2. Proves On Track infant displays status ON TRACK (standardized from Up-to-Date)
        const onTrackBadges = screen.getAllByText('On Track');
        expect(onTrackBadges.length).toBe(2); // One in filter options, one in status badge for Baby Two.
        
        // 3. Proves On Track infant displays LOW RISK
        const lowRiskLabel = screen.getAllByText('Low Risk');
        expect(lowRiskLabel.length).toBeGreaterThan(0);
    });
});
