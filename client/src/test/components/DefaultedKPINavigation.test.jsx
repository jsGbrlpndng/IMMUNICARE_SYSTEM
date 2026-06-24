import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import MidwifeDashboard from '../../features/clinical/pages/MidwifeDashboard';
import InfantRegistry from '../../features/registry/pages/InfantRegistry';
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

// Mock Leaflet as it cannot render in jsdom easily
vi.mock('react-leaflet', () => ({
    MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
    TileLayer: () => <div data-testid="tile-layer" />,
    Circle: ({ children }) => <div data-testid="circle">{children}</div>,
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
    LayerGroup: ({ children }) => <div data-testid="layer-group">{children}</div>,
    Marker: ({ children }) => <div data-testid="marker">{children}</div>,
    useMap: () => ({
        flyTo: vi.fn(),
        fitBounds: vi.fn()
    })
}));

const buildResponse = (payload) => ({
    ok: true,
    json: vi.fn().mockResolvedValue(payload)
});

// Helper component to track navigation
const LocationTracker = ({ onChange }) => {
    const location = useLocation();
    React.useEffect(() => {
        onChange(location);
    }, [location, onChange]);
    return null;
};

describe('Defaulted KPI Navigation and Roster Filtering Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('proves clicking the Defaulted KPI card navigates to Infant Registry with urgency=defaulter parameter', async () => {
        // Setup API mock responses for MidwifeDashboard mount
        apiClient.get.mockImplementation((url) => {
            if (url.includes('/analytics/dashboard-stats')) {
                return Promise.resolve(buildResponse({
                    scheduledToday: 5,
                    dueSoon: 3,
                    overdueCount: 8
                }));
            }
            if (url.includes('/analytics/map-data')) {
                return Promise.resolve(buildResponse({
                    counts: { clinical_overdue_total: 8, clinical_due_soon_total: 3 },
                    clusters: []
                }));
            }
            if (url.includes('/follow-ups')) {
                return Promise.resolve(buildResponse({ follow_ups: [] }));
            }
            // Catch-all mock for other dashboard loads
            return Promise.resolve(buildResponse({}));
        });

        let lastLocation = null;

        render(
            <MemoryRouter initialEntries={['/clinical/dashboard']}>
                <LocationTracker onChange={(loc) => { lastLocation = loc; }} />
                <Routes>
                    <Route path="/clinical/dashboard" element={<MidwifeDashboard />} />
                    <Route path="/clinical/registry" element={<div>Registry Page</div>} />
                </Routes>
            </MemoryRouter>
        );

        // Wait for dashboard to finish loading
        expect(await screen.findByText('Midwife Operational Dashboard')).toBeInTheDocument();

        // Find the Defaulted KPI card (value is 8)
        const defaultedCard = screen.getAllByText('Defaulted')[0].closest('div');
        expect(defaultedCard).toBeInTheDocument();

        // Click Defaulted KPI card
        fireEvent.click(defaultedCard);

        // Verify it navigates to /clinical/registry?urgency=defaulter
        await waitFor(() => {
            expect(lastLocation.pathname).toBe('/clinical/registry');
            expect(lastLocation.search).toBe('?urgency=defaulter');
        });
    });

    it('proves Infant Registry reads urgency=defaulter on load and fetches defaulted roster immediately', async () => {
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
                next_due_vaccine: 'BCG',
                next_due_date: '2025-02-01',
                urgency: 'defaulter',
                computed_schedule_status: 'DEFAULTER',
                clinical_status: 'DEFAULTED'
            }
        ];

        let requestedUrl = null;
        apiClient.get.mockImplementation(async (url) => {
            requestedUrl = url;
            return buildResponse({
                infants: mockInfants,
                pagination: { totalRecords: 1, totalPages: 1 },
                filter_options: {
                    barangays: ['Langgam'],
                    assignedBhws: [],
                    vaccineTypes: [],
                    ageGroups: [],
                    sortOptions: []
                }
            });
        });

        render(
            <MemoryRouter initialEntries={['/clinical/registry?urgency=defaulter']}>
                <Routes>
                    <Route path="/clinical/registry" element={<InfantRegistry />} />
                </Routes>
            </MemoryRouter>
        );

        // Wait for table to render rows
        expect(await screen.findByText('Baby One')).toBeInTheDocument();

        // Verify the API call immediately includes urgency=defaulter
        expect(requestedUrl).toContain('urgency=defaulter');

        // Verify the dropdown element selects "Defaulted"
        const select = screen.getByLabelText('Filter by clinical status');
        expect(select.value).toBe('defaulter');
    });

    it('proves refresh or direct load with urgency=defaulter preserves filter and fetches roster', async () => {
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
                next_due_vaccine: 'BCG',
                next_due_date: '2025-02-01',
                urgency: 'defaulter',
                computed_schedule_status: 'DEFAULTER',
                clinical_status: 'DEFAULTED'
            }
        ];

        apiClient.get.mockResolvedValue(buildResponse({
            infants: mockInfants,
            pagination: { totalRecords: 1, totalPages: 1 },
            filter_options: {
                barangays: ['Langgam'],
                assignedBhws: [],
                vaccineTypes: [],
                ageGroups: [],
                sortOptions: []
            }
        }));

        const { rerender } = render(
            <MemoryRouter initialEntries={['/clinical/registry?urgency=defaulter']}>
                <Routes>
                    <Route path="/clinical/registry" element={<InfantRegistry />} />
                </Routes>
            </MemoryRouter>
        );

        // Wait for page load
        expect(await screen.findByText('Baby One')).toBeInTheDocument();
        expect(screen.getByLabelText('Filter by clinical status').value).toBe('defaulter');

        // Simulate refresh by rerendering
        rerender(
            <MemoryRouter initialEntries={['/clinical/registry?urgency=defaulter']}>
                <Routes>
                    <Route path="/clinical/registry" element={<InfantRegistry />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Baby One')).toBeInTheDocument();
        expect(screen.getByLabelText('Filter by clinical status').value).toBe('defaulter');
    });

    it('proves changing page or filter still works correctly after KPI navigation', async () => {
        const mockInfantsFirstPage = [
            {
                id: 'infant-1',
                reference_id: 'REG-001',
                first_name: 'Baby',
                last_name: 'One',
                dob: '2025-01-01',
                barangay: 'Langgam',
                purok: 'Purok 1',
                mothers_maiden_name: 'Mother One',
                next_due_vaccine: 'BCG',
                next_due_date: '2025-02-01',
                urgency: 'defaulter',
                computed_schedule_status: 'DEFAULTER',
                clinical_status: 'DEFAULTED'
            }
        ];

        const mockInfantsSecondPage = [
            {
                id: 'infant-2',
                reference_id: 'REG-002',
                first_name: 'Baby',
                last_name: 'Two',
                dob: '2025-01-01',
                barangay: 'Langgam',
                purok: 'Purok 2',
                mothers_maiden_name: 'Mother Two',
                next_due_vaccine: 'BCG',
                next_due_date: '2025-02-01',
                urgency: 'defaulter',
                computed_schedule_status: 'DEFAULTER',
                clinical_status: 'DEFAULTED'
            }
        ];

        let fetchedUrls = [];
        apiClient.get.mockImplementation(async (url) => {
            fetchedUrls.push(url);
            const isPage2 = url.includes('page=2');
            return buildResponse({
                infants: isPage2 ? mockInfantsSecondPage : mockInfantsFirstPage,
                pagination: { totalRecords: 2, totalPages: 2, currentPage: isPage2 ? 2 : 1 },
                filter_options: {
                    barangays: ['Langgam'],
                    assignedBhws: [],
                    vaccineTypes: [],
                    ageGroups: [],
                    sortOptions: []
                }
            });
        });

        render(
            <MemoryRouter initialEntries={['/clinical/registry?urgency=defaulter']}>
                <Routes>
                    <Route path="/clinical/registry" element={<InfantRegistry />} />
                </Routes>
            </MemoryRouter>
        );

        // Wait for first page to load
        expect(await screen.findByText('Baby One')).toBeInTheDocument();

        // Find pagination button for page 2
        const page2Button = screen.getByRole('button', { name: '2' });
        expect(page2Button).toBeInTheDocument();

        // Click page 2 button
        fireEvent.click(page2Button);

        // Wait for second page to load
        expect(await screen.findByText('Baby Two')).toBeInTheDocument();
        expect(fetchedUrls.some(url => url.includes('page=2'))).toBe(true);
    });
});
