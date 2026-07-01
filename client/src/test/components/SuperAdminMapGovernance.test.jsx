import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SuperAdminMap from '../../features/geospatial/pages/SuperAdminMap';
import apiClient from '../../services/apiClient';

vi.mock('../../services/apiClient', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn()
    }
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'SA-001',
            role: 'Super Admin',
            full_name: 'Head Nurse'
        }
    })
}));

vi.mock('react-leaflet', () => ({
    MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    ScaleControl: () => null,
    Polygon: ({ children }) => <div data-testid="polygon">{children}</div>,
    Popup: ({ children }) => <div>{children}</div>,
    CircleMarker: ({ children }) => <div>{children}</div>,
    useMap: () => ({
        flyTo: vi.fn(),
        setView: vi.fn(),
        fitBounds: vi.fn(),
        flyToBounds: vi.fn(),
        invalidateSize: vi.fn(),
        getContainer: () => document.createElement('div')
    })
}));

describe('SuperAdminMap governance controls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.ResizeObserver = class ResizeObserver {
            observe() {}
            disconnect() {}
        };

        apiClient.get.mockImplementation(async (url) => {
            if (url === '/dashboard/dbscan-settings') {
                return {
                    ok: true,
                    json: vi.fn().mockResolvedValue({
                        success: true,
                        current_production_settings: {
                            epsilon_meters: 250,
                            minPts: 4
                        }
                    })
                };
            }

            if (url.startsWith('/dashboard/superadmin/spatial-analysis')) {
                return {
                    ok: true,
                    json: vi.fn().mockResolvedValue({
                        success: true,
                        clustering_scope: 'BARANGAY_AWARE_MUNICIPAL_OVERVIEW',
                        clusters: [
                            {
                                clusterId: 'LANGGAM-CL-0',
                                barangay: 'LANGGAM',
                                locality: 'Purok 1',
                                total_infants: 3,
                                total_defaulter_doses: 5,
                                points: [
                                    { id: 'i1', barangay: 'LANGGAM', lat: 14.1, lng: 121.1 },
                                    { id: 'i2', barangay: 'LANGGAM', lat: 14.2, lng: 121.2 },
                                    { id: 'i3', barangay: 'LANGGAM', lat: 14.3, lng: 121.3 }
                                ]
                            }
                        ],
                        counts: { total_defaulters: 3, mapped_defaulters: 3 }
                    })
                };
            }

            return {
                ok: true,
                json: vi.fn().mockResolvedValue({ success: true, rows: [], summary: {} })
            };
        });
    });

    it('removes the radius slider and shows active DBSCAN settings as read-only', async () => {
        render(<SuperAdminMap />);

        await waitFor(() => {
            expect(apiClient.get).toHaveBeenCalledWith('/dashboard/dbscan-settings');
        });

        fireEvent.click(screen.getByRole('button', { name: /Cluster Analysis/i }));

        await waitFor(() => {
            expect(screen.getByText('Active DBSCAN Setting')).toBeInTheDocument();
            expect(screen.getByText('250m / MinPts 4')).toBeInTheDocument();
        });

        expect(screen.queryByText('Hotspot Radius')).not.toBeInTheDocument();
        expect(screen.queryByRole('slider')).not.toBeInTheDocument();
        expect(screen.getByText(/DBSCAN parameter changes are managed only through the DBSCAN Evaluation page/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Refresh Hotspot Overview/i })).toBeInTheDocument();
        expect(apiClient.get).toHaveBeenCalledWith('/dashboard/dbscan-settings');
        expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('eps=250'));
        expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('minPts=4'));
    });
});
