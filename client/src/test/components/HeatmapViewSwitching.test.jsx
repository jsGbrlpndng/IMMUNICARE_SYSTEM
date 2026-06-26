import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import Heatmap from '../../features/geospatial/pages/Heatmap';
import apiClient from '../../services/apiClient';

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            role: 'Midwife',
            assigned_barangay: 'LANGGAM'
        }
    })
}));

vi.mock('../../services/apiClient', () => ({
    default: {
        get: vi.fn()
    }
}));

vi.mock('../../features/geospatial/components/HeatmapMap', () => ({
    default: ({ allMarkersForMode, mode, loading }) => (
        <div>
            <div data-testid="map-mode">{mode}</div>
            <div data-testid="map-loading">{loading ? 'loading' : 'ready'}</div>
            <div data-testid="marker-count">{allMarkersForMode.length}</div>
            <div data-testid="legend-labels">
                {mode === 'priority'
                    ? 'Defaulters | Isolated Defaulters | Hotspot Areas'
                    : 'Defaulter | Due Soon | On Track | Fully Immunized'}
            </div>
        </div>
    )
}));

vi.mock('../../features/geospatial/components/HeatmapSidePanel', () => ({
    default: ({ allMarkersForMode, mode }) => (
        <div>
            <div data-testid="side-panel-mode">{mode}</div>
            <div data-testid="side-panel-count">{allMarkersForMode.length}</div>
        </div>
    )
}));

vi.mock('../../features/reports/components/DeploymentReportModal', () => ({
    default: () => <div data-testid="deployment-report-modal" />
}));

const okResponse = (payload) => ({
    ok: true,
    json: async () => payload
});

const mapPayload = {
    barangay: 'LANGGAM',
    all_infants: [
        {
            id: 'infant-1',
            reference_id: 'REF-001',
            first_name: 'Nadine',
            last_name: 'Lustre',
            patient_name: 'Nadine Lustre',
            urgency: 'defaulter',
            computed_map_status: 'DEFAULTER',
            lat: 14.3596,
            lng: 121.0426,
            exact_address: 'Pear Street',
            vaccination_needs: []
        },
        {
            id: 'infant-2',
            reference_id: 'REF-002',
            first_name: 'June',
            last_name: 'Due',
            patient_name: 'June Due',
            urgency: 'due_soon',
            computed_map_status: 'DUE_SOON',
            lat: 14.3597,
            lng: 121.0427,
            exact_address: 'Apple Street',
            vaccination_needs: []
        },
        {
            id: 'infant-3',
            reference_id: 'REF-003',
            first_name: 'Ona',
            last_name: 'Track',
            patient_name: 'Ona Track',
            urgency: 'on_track',
            computed_map_status: 'UP_TO_DATE',
            lat: 14.3598,
            lng: 121.0428,
            exact_address: 'Mimosa Street',
            vaccination_needs: []
        },
        {
            id: 'infant-4',
            reference_id: 'REF-004',
            first_name: 'Fiona',
            last_name: 'Full',
            patient_name: 'Fiona Full',
            urgency: 'completed',
            computed_map_status: 'FULLY_IMMUNIZED',
            lat: 14.3599,
            lng: 121.0429,
            exact_address: 'Cinnamon Street',
            vaccination_needs: []
        }
    ],
    counts: {
        all: 4,
        total_defaulters: 1,
        mapped_defaulters: 1,
        total_due_soon: 1,
        mapped_due_soon: 1,
        total_on_track: 1,
        total_completed: 1
    },
    recommended_actions: [],
    clusters: []
};

const deploymentsPayload = {
    deployments: [
        {
            id: 'cluster-1',
            cluster_label: 'Priority Area 1',
            infant_count: 1,
            points: mapPayload.all_infants
        }
    ]
};

const SwitchToIndividual = () => {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => navigate('/clinical/map?view=individual')}>
            Switch to Infant Status Map
        </button>
    );
};

const SwitchToPriority = () => {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => navigate('/clinical/map?view=priority')}>
            Switch to Defaulter Hotspot Areas
        </button>
    );
};

const renderHeatmap = (initialEntry) => render(
    <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
            <Route
                path="/clinical/map"
                element={(
                    <>
                        <SwitchToIndividual />
                        <SwitchToPriority />
                        <Heatmap />
                    </>
                )}
            />
        </Routes>
    </MemoryRouter>
);

describe('Heatmap query-driven view switching', () => {
    beforeEach(() => {
        apiClient.get.mockImplementation((url) => {
            if (url.startsWith('/analytics/map-data')) return Promise.resolve(okResponse(mapPayload));
            if (url === '/clinical/deployments') return Promise.resolve(okResponse(deploymentsPayload));
            return Promise.resolve(okResponse({ success: true }));
        });
    });

    it('switches from priority to individual without clearing loaded infant markers or staying stuck loading', async () => {
        renderHeatmap('/clinical/map?view=priority');

        expect(await screen.findByText('Defaulter Hotspot Areas')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId('map-loading')).toHaveTextContent('ready'));
        expect(screen.getByTestId('map-mode')).toHaveTextContent('priority');
        expect(screen.getByTestId('marker-count')).toHaveTextContent('1');
        expect(screen.getByTestId('legend-labels')).toHaveTextContent('Defaulters');
        expect(screen.getByTestId('legend-labels')).toHaveTextContent('Isolated Defaulters');
        expect(screen.getByTestId('legend-labels')).toHaveTextContent('Hotspot Areas');
        expect(screen.getByTestId('legend-labels')).not.toHaveTextContent('Due Soon');
        expect(screen.getByTestId('legend-labels')).not.toHaveTextContent('On Track');
        expect(screen.getByTestId('legend-labels')).not.toHaveTextContent('Fully Immunized');

        fireEvent.click(screen.getByRole('button', { name: /switch to infant status map/i }));

        expect(await screen.findByText('Infant Status Map')).toBeInTheDocument();
        expect(screen.getByTestId('map-mode')).toHaveTextContent('all');
        expect(screen.getByTestId('map-loading')).toHaveTextContent('ready');
        expect(screen.getByTestId('marker-count')).toHaveTextContent('4');
        expect(screen.getByTestId('side-panel-count')).toHaveTextContent('4');
        expect(screen.getByTestId('legend-labels')).toHaveTextContent('Due Soon');
        expect(screen.getByTestId('legend-labels')).toHaveTextContent('On Track');
        expect(screen.getByTestId('legend-labels')).toHaveTextContent('Fully Immunized');

        fireEvent.click(screen.getByRole('button', { name: /switch to defaulter hotspot areas/i }));

        expect(await screen.findByText('Defaulter Hotspot Areas')).toBeInTheDocument();
        expect(screen.getByTestId('map-mode')).toHaveTextContent('priority');
        expect(screen.getByTestId('marker-count')).toHaveTextContent('1');
        expect(screen.getByTestId('legend-labels')).not.toHaveTextContent('Due Soon');
    });
});
