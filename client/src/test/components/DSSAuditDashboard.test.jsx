import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DSSAuditDashboard from '../../features/geospatial/components/DSSAuditDashboard';
import apiClient from '../../services/apiClient';

vi.mock('../../services/apiClient', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn()
    }
}));

const buildSweepRows = () => {
    const rows = [
        {
            epsilon_meters: 100,
            minPts: 3,
            number_of_clusters: 2,
            number_of_noise_points: 19,
            cluster_coverage_percent: 32.14,
            dbcv_score: 0.2916,
            silhouette_score: 0.9447,
            davies_bouldin_index: 0.0694,
            calinski_harabasz_index: 1289.3517,
            interpretation: 'Moderate density separation; review map usefulness before adoption.',
            is_recommended: true,
            is_stable: true,
            noise_percentage: 67.86
        },
        {
            epsilon_meters: 150,
            min_samples: 3,
            num_clusters: 4,
            noise_points: 9,
            coverage: 67.86,
            dbcv_score: 0.1093,
            silhouette_score: 0.6929,
            davies_bouldin_index: 0.3558,
            calinski_harabasz_index: 201.523,
            interpretation: 'Weak density separation; use cautiously.',
            is_recommended: false,
            is_stable: false,
            noise_percentage: 32.14
        }
    ];

    return [100, 150, 200, 250, 300, 350, 400, 450, 500].map((radius) => {
        const existing = rows.find(row => row.epsilon_meters === radius);
        if (existing) return existing;
        return {
            epsilon_meters: radius,
            minPts: 3,
            number_of_clusters: radius === 300 ? 3 : 1,
            number_of_noise_points: radius === 300 ? 12 : 16,
            cluster_coverage_percent: radius === 300 ? 57.14 : 42.86,
            dbcv_score: radius === 300 ? 0.0444 : -0.02,
            silhouette_score: 0.5,
            davies_bouldin_index: 0.8,
            calinski_harabasz_index: 100,
            interpretation: radius === 300
                ? 'Broad grouping with more defaulters covered but weaker separation.'
                : 'Lower confidence grouping; use only if outreach planning needs this radius.',
            is_recommended: false,
            is_stable: radius === 300,
            noise_percentage: radius === 300 ? 42.86 : 57.14
        };
    });
};

const buildAuditPayload = (overrides = {}) => ({
    success: true,
    dataset_summary: {
        number_of_eligible_records: 30,
        number_of_mappable_records: 28,
        unmapped_defaulters: 2
    },
    best_recommendation: {
        epsilon_meters: 100,
        minPts: 3,
        dbcv_score: 0.2916
    },
    current_production_settings: {
        epsilon_meters: 300,
        minPts: 3,
        distance_model: 'PostGIS ST_ClusterDBSCAN over ST_Transform(location, 32651)',
        production_behavior_changed: false
    },
    warnings: [],
    parameter_sweep: buildSweepRows(),
    ...overrides
});

describe('DSSAuditDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        apiClient.get.mockResolvedValue({
            json: vi.fn().mockResolvedValue(buildAuditPayload())
        });
    });

    it('renders an RHU-friendly summary before the technical metric table', async () => {
        render(<DSSAuditDashboard />);

        await waitFor(() => {
            expect(screen.getByText('DBSCAN Hotspot Evaluation Summary')).toBeInTheDocument();
        });

        expect(apiClient.get).toHaveBeenCalledWith('/dashboard/dbscan-audit');
        expect(screen.getAllByText('Current active hotspot radius').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Current minimum nearby defaulters to form a hotspot')).toBeInTheDocument();
        expect(screen.getAllByText('Recommended radius based on evaluation').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Recommended minimum nearby defaulters')).toBeInTheDocument();
        expect(screen.getAllByText('300 meters').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('100 meters').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/Moderate\/acceptable hotspot separation/i)).toBeInTheDocument();
        expect(screen.getByText(/The setting detects the densest defaulter hotspot pockets/i)).toBeInTheDocument();
        expect(screen.getByText(/Defaulters outside hotspots are still listed as individual follow-up cases/i)).toBeInTheDocument();
        expect(screen.getByText(/This does not change the actual infant records or vaccination data/i)).toBeInTheDocument();
        expect(screen.getByText(/recommended setting is for evaluation guidance only and is not automatically applied/i)).toBeInTheDocument();
        expect(screen.getByText('Choose hotspot radius to apply')).toBeInTheDocument();
        expect(screen.getByLabelText('Select evaluated radius')).toBeInTheDocument();
        expect(screen.getByText('Selected setting summary')).toBeInTheDocument();
        expect(screen.getByText('Minimum nearby defaulters to form a hotspot: 3')).toBeInTheDocument();
        expect(screen.getAllByText(/This setting affects future hotspot detection only/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/This does not change infant records or vaccination records/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByRole('button', { name: /Selected Setting Active/i })).toBeInTheDocument();
        [100, 150, 200, 250, 300, 350, 400, 450, 500].forEach((radius) => {
            expect(screen.getByRole('option', { name: new RegExp(`${radius} meters`) })).toBeInTheDocument();
        });
        expect(screen.getAllByText('Recommended').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/19 mappable defaulter records remain outside hotspot groups/i)).toBeInTheDocument();
        expect(screen.getByText('Technical Evaluation Details')).toBeInTheDocument();
        expect(screen.getByText(/For Research\/Developer Review/i)).toBeInTheDocument();

        expect(screen.queryByRole('columnheader', { name: /DBCV/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: /Davies-Bouldin/i })).not.toBeInTheDocument();
        expect(screen.queryByText('0.292')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Technical Evaluation Details/i }));

        expect(screen.getByRole('columnheader', { name: /Epsilon/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /DBCV/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /Davies-Bouldin/i })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: /Calinski-Harabasz/i })).toBeInTheDocument();
        expect(screen.getAllByText('100m').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('150m').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('0.292')).toBeInTheDocument();
        expect(screen.getByText('0.945')).toBeInTheDocument();
        expect(screen.getByText('0.069')).toBeInTheDocument();
        expect(screen.getByText('1289.352')).toBeInTheDocument();
        expect(screen.getAllByText('Recommended').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Weak density separation/i)).toBeInTheDocument();
    });

    it('applies a selected evaluated radius only after in-page confirmation and refreshes current settings', async () => {
        const confirmedPayload = buildAuditPayload({
            current_production_settings: {
                epsilon_meters: 150,
                minPts: 3,
                distance_model: 'PostGIS ST_ClusterDBSCAN over ST_Transform(location, 32651)',
                production_behavior_changed: false
            }
        });

        apiClient.get
            .mockResolvedValueOnce({
                json: vi.fn().mockResolvedValue(buildAuditPayload())
            })
            .mockResolvedValueOnce({
                json: vi.fn().mockResolvedValue(confirmedPayload)
            });
        apiClient.put.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                success: true,
                new_settings: {
                    epsilon_meters: 100,
                    minPts: 3
                },
                read_only_evaluation: true
            })
        });

        render(<DSSAuditDashboard />);

        await waitFor(() => {
            expect(screen.getByLabelText('Select evaluated radius')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText('Select evaluated radius'), {
            target: { value: '150' }
        });
        expect(screen.getByText('Weak density separation; use cautiously.')).toBeInTheDocument();
        expect(screen.getByText('67.86%')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText(/Approved after evaluation review/i), {
            target: { value: 'Approved by Head Nurse after evaluation review.' }
        });
        fireEvent.click(screen.getByRole('button', { name: /Update DBSCAN Parameters/i }));

        const modal = await screen.findByText('Confirm DBSCAN Parameter Update');
        expect(modal).toBeInTheDocument();
        expect(screen.getByText(/Apply 150 meters for future hotspot detection/i)).toBeInTheDocument();
        expect(screen.getByText(/Changing the hotspot radius affects future hotspot detection results/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Confirm Update/i }));

        await waitFor(() => {
            expect(apiClient.put).toHaveBeenCalledWith('/dashboard/dbscan-settings', {
                epsilon_meters: 150,
                minPts: 3,
                reason: 'Approved by Head Nurse after evaluation review.',
                selected_dbcv_score: 0.1093,
                selected_is_recommended: false,
                confirmed: true
            });
        });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Selected Setting Active/i })).toBeInTheDocument();
        });
        expect(apiClient.get).toHaveBeenCalledTimes(2);
    });

    it('keeps the technical metric table secondary and blocks apply without an approval reason', async () => {
        render(<DSSAuditDashboard />);

        await waitFor(() => {
            expect(screen.getByLabelText('Select evaluated radius')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText('Select evaluated radius'), {
            target: { value: '150' }
        });

        expect(screen.getByRole('button', { name: /Update DBSCAN Parameters/i })).toBeDisabled();
        expect(screen.queryByRole('columnheader', { name: /DBCV/i })).not.toBeInTheDocument();
        expect(apiClient.put).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /Technical Evaluation Details/i }));
        const table = screen.getByRole('table');
        expect(within(table).getByRole('columnheader', { name: /DBCV/i })).toBeInTheDocument();
    });

    it('shows a friendly error message when the settings update fails', async () => {
        apiClient.put.mockResolvedValue({
            ok: false,
            json: vi.fn().mockResolvedValue({
                success: false,
                error: 'Failed to update DBSCAN settings.'
            })
        });

        render(<DSSAuditDashboard />);

        await waitFor(() => {
            expect(screen.getByLabelText('Select evaluated radius')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText('Select evaluated radius'), {
            target: { value: '100' }
        });
        fireEvent.change(screen.getByPlaceholderText(/Approved after evaluation review/i), {
            target: { value: 'Approved after evaluation review for RHU outreach planning.' }
        });
        fireEvent.click(screen.getByRole('button', { name: /Update DBSCAN Parameters/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Confirm Update/i }));

        await waitFor(() => {
            expect(screen.getByText(/Unable to update DBSCAN settings. Please try again or contact the system administrator./i)).toBeInTheDocument();
        });
    });
});
