import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeploymentReportModal from '../../components/DeploymentReportModal';
import apiClient from '../../services/apiClient';

// Mock apiClient — the modal calls apiClient.post to submit the report
vi.mock('../../services/apiClient', () => ({
    default: {
        post: vi.fn()
    }
}));

/** Helper: build a minimal cluster prop */
const buildCluster = (overrides = {}) => ({
    id: 'assignment-1',
    cluster_label: 'Priority Area 1',
    barangay: 'Langgam',
    points: [
        { id: 'infant-1', first_name: 'Juan', last_name: 'Cruz', reference_id: 'REG-001' },
        { id: 'infant-2', first_name: 'Maria', last_name: 'Santos', reference_id: 'REG-002' }
    ],
    assigned_user_name: null,
    assigned_bhw_name: null,
    assigned_user_role: null,
    ...overrides
});

const buildOkResponse = (payload) => ({
    ok: true,
    json: vi.fn().mockResolvedValue(payload)
});

describe('DeploymentReportModal — Assigned Healthcare Worker Display', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('displays the assigned healthcare worker name and role when assigned_user_name is set', () => {
        const cluster = buildCluster({
            assigned_user_name: 'Maria Dela Cruz',
            assigned_user_role: 'Midwife'
        });

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={vi.fn()}
                onSubmitSuccess={vi.fn()}
            />
        );

        // The full label "Assigned Healthcare Worker:" must be visible
        expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();

        // The name and role must be visible together
        expect(screen.getByText(/Maria Dela Cruz \(Midwife\)/i)).toBeInTheDocument();
    });

    it('displays assigned_bhw_name as fallback when assigned_user_name is absent', () => {
        const cluster = buildCluster({
            assigned_user_name: null,
            assigned_bhw_name: 'Pedro Reyes',
            assigned_user_role: 'BHW'
        });

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={vi.fn()}
                onSubmitSuccess={vi.fn()}
            />
        );

        expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();
        expect(screen.getByText(/Pedro Reyes \(BHW\)/i)).toBeInTheDocument();
    });

    it('displays "Not assigned" fallback when no name fields are set', () => {
        const cluster = buildCluster();  // all name fields null

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={vi.fn()}
                onSubmitSuccess={vi.fn()}
            />
        );

        expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();
        expect(screen.getByText(/Not assigned/i)).toBeInTheDocument();
    });

    it('shows name without role suffix when assigned_user_role is absent', () => {
        const cluster = buildCluster({
            assigned_user_name: 'Ana Reyes',
            assigned_user_role: null
        });

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={vi.fn()}
                onSubmitSuccess={vi.fn()}
            />
        );

        // Should show name without parentheses for role
        expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
        // Should not show empty parentheses
        expect(screen.queryByText(/Ana Reyes \(\)/)).not.toBeInTheDocument();
    });

    it('does not mislabel a BHW as a Midwife', () => {
        const cluster = buildCluster({
            assigned_user_name: 'Carlos Manalo',
            assigned_user_role: 'BHW'
        });

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={vi.fn()}
                onSubmitSuccess={vi.fn()}
            />
        );

        // The role shown must be BHW, not Midwife
        expect(screen.getByText(/Carlos Manalo \(BHW\)/i)).toBeInTheDocument();
        expect(screen.queryByText(/Carlos Manalo \(Midwife\)/i)).not.toBeInTheDocument();
    });

    it('submits the deployment report and calls onSubmitSuccess — infant roster preserved', async () => {
        const cluster = buildCluster({
            assigned_user_name: 'Maria Dela Cruz',
            assigned_user_role: 'Midwife'
        });

        const mockReport = { id: 'report-1', cluster_label: 'Priority Area 1' };
        apiClient.post.mockResolvedValueOnce(buildOkResponse({ success: true, report: mockReport }));

        const onSubmitSuccess = vi.fn();
        const onClose = vi.fn();

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={onClose}
                onSubmitSuccess={onSubmitSuccess}
            />
        );

        // Both infants must appear in the roster table
        expect(screen.getByText('Juan Cruz')).toBeInTheDocument();
        expect(screen.getByText('Maria Santos')).toBeInTheDocument();

        // Submit the form
        const submitButton = screen.getByRole('button', { name: /submit deployment report/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(apiClient.post).toHaveBeenCalledWith(
                '/clinical/deployments/assignment-1/report',
                expect.objectContaining({
                    outcomes: expect.arrayContaining([
                        expect.objectContaining({ infant_id: 'infant-1' }),
                        expect.objectContaining({ infant_id: 'infant-2' })
                    ])
                })
            );
            expect(onSubmitSuccess).toHaveBeenCalledWith(mockReport);
            expect(onClose).toHaveBeenCalled();
        });
    });

    it('shows cluster_label, barangay, and infant count in header subtitle', () => {
        const cluster = buildCluster();

        render(
            <DeploymentReportModal
                cluster={cluster}
                onClose={vi.fn()}
                onSubmitSuccess={vi.fn()}
            />
        );

        // Subtitle line with the three key pieces of info
        expect(screen.getByText(/Priority Area 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Langgam/i)).toBeInTheDocument();
        expect(screen.getByText(/2 Infant\(s\)/i)).toBeInTheDocument();
    });
});
