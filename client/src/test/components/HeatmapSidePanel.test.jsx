import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeatmapSidePanel from '../../features/geospatial/components/HeatmapSidePanel';


/**
 * HeatmapSidePanel requires no router context because it renders
 * purely based on props and uses window.location.href for navigation.
 */

/** Minimal cluster objects for priority mode */
const buildDeploymentCluster = (overrides = {}) => ({
    clusterId: 'cluster-1',
    id: 'assignment-1',
    cluster_label: 'Priority Area 1',
    locality: 'Purok 3',
    barangay: 'Langgam',
    lat: 14.0,
    lng: 121.0,
    bounds: null,
    total_infants: 5,
    assigned_count: 5,
    total_defaulter_doses: 3,
    total_due_doses: 0,
    cluster_status: 'Pending',
    severity: 'high',
    assigned_user_name: null,
    assigned_bhw_name: null,
    assigned_user_role: null,
    area_justification: null,
    points: [
        { id: 'infant-1', patient_name: 'Juan Cruz', first_name: 'Juan', last_name: 'Cruz', urgency: 'defaulter', mapping_readiness: 'Verified' },
        { id: 'infant-2', patient_name: 'Maria Santos', first_name: 'Maria', last_name: 'Santos', urgency: 'defaulter', mapping_readiness: 'Approximate' }
    ],
    ...overrides
});

const buildDefaultProps = (overrides = {}) => ({
    mapState: {
        clusters: [],
        all_infants: [],
        dss_clusters: [],
        counts: {
            all: 0, total_defaulters: 0, total_due_soon: 0, total_on_track: 0, total_completed: 0,
            mapped_defaulters: 0, mapped_due_soon: 0, mapped_on_track: 0, mapped_completed: 0
        }
    },
    mode: 'priority',
    derivedCounts: {
        all: 0, rendered: 0,
        total_defaulters: 0, total_due_soon: 0, total_on_track: 0, total_completed: 0,
        mapped_defaulters: 0, mapped_due_soon: 0, mapped_on_track: 0, mapped_completed: 0,
        totalDefaulter: 0, totalDueSoon: 0, totalOnTrack: 0, totalCompleted: 0,
        mappedDefaulter: 0, mappedDueSoon: 0
    },
    selectedClusterId: null,
    setSelectedClusterId: vi.fn(),
    setMapTarget: vi.fn(),
    allMarkersForMode: [],
    handleFocusInfant: vi.fn(),
    activeFilters: { statuses: ['defaulter', 'due_soon', 'on_track', 'completed'], shortcuts: [] },
    setActiveFilters: vi.fn(),
    clusterDeploymentRows: [],
    activeReport: null,
    loadingReport: false,
    onSubmitReport: vi.fn(),
    ...overrides
});

describe('HeatmapSidePanel — Deployment Detail: Assigned Healthcare Worker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Cluster list view ────────────────────────────────────────────────────
    describe('Cluster list (no cluster selected)', () => {
        it('shows "Assigned Healthcare Worker:" label in cluster list card when a name is present', () => {
            const cluster = buildDeploymentCluster({
                assigned_user_name: 'Maria Dela Cruz',
                assigned_user_role: 'Midwife'
            });

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: null,
                        clusterDeploymentRows: []
                    })}
                />
            );

            expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();
            expect(screen.getByText(/Maria Dela Cruz \(Midwife\)/i)).toBeInTheDocument();
        });

        it('shows "Pending assignment" when no staff is assigned in cluster list card', () => {
            const cluster = buildDeploymentCluster(); // all name fields null

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: null,
                        clusterDeploymentRows: []
                    })}
                />
            );

            expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();
            expect(screen.getByText(/Pending assignment/i)).toBeInTheDocument();
        });
    });

    // ── Deployment Detail (cluster selected) ─────────────────────────────────
    describe('Deployment Detail panel (cluster selected)', () => {
        it('shows assigned Midwife name with role in detail panel', () => {
            const cluster = buildDeploymentCluster({
                assigned_user_name: 'Maria Dela Cruz',
                assigned_user_role: 'Midwife'
            });

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: 'cluster-1',
                        clusterDeploymentRows: []
                    })}
                />
            );

            // Must say "Assigned Healthcare Worker:" not "Assigned to:"
            expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();
            expect(screen.getByText(/Maria Dela Cruz \(Midwife\)/i)).toBeInTheDocument();
        });

        it('does NOT mislabel a BHW as a Midwife in the detail panel', () => {
            const cluster = buildDeploymentCluster({
                assigned_user_name: 'Carlos Manalo',
                assigned_user_role: 'BHW'
            });

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: 'cluster-1',
                        clusterDeploymentRows: []
                    })}
                />
            );

            expect(screen.getByText(/Carlos Manalo \(BHW\)/i)).toBeInTheDocument();
            expect(screen.queryByText(/Carlos Manalo \(Midwife\)/i)).not.toBeInTheDocument();
        });

        it('shows "Pending assignment" fallback in detail panel when no name is set', () => {
            const cluster = buildDeploymentCluster(); // all null

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: 'cluster-1',
                        clusterDeploymentRows: []
                    })}
                />
            );

            expect(screen.getByText(/Assigned Healthcare Worker:/i)).toBeInTheDocument();
            expect(screen.getByText(/Pending assignment/i)).toBeInTheDocument();
        });

        it('falls back to assigned_bhw_name when assigned_user_name is absent', () => {
            const cluster = buildDeploymentCluster({
                assigned_user_name: null,
                assigned_bhw_name: 'Pedro Reyes',
                assigned_user_role: 'BHW'
            });

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: 'cluster-1',
                        clusterDeploymentRows: []
                    })}
                />
            );

            expect(screen.getByText(/Pedro Reyes \(BHW\)/i)).toBeInTheDocument();
        });

        it('renders the infant action roster for the selected cluster', () => {
            const cluster = buildDeploymentCluster({
                assigned_user_name: 'Maria Dela Cruz',
                assigned_user_role: 'Midwife'
            });

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: 'cluster-1',
                        clusterDeploymentRows: []
                    })}
                />
            );

            // Action Roster heading should be present
            expect(screen.getByText(/Action Roster/i)).toBeInTheDocument();
            // Both infants should appear
            expect(screen.getByText('Juan Cruz')).toBeInTheDocument();
            expect(screen.getByText('Maria Santos')).toBeInTheDocument();
        });

        it('shows "Submit Deployment Report" button when no report exists', () => {
            const cluster = buildDeploymentCluster({
                assigned_user_name: 'Maria Dela Cruz',
                assigned_user_role: 'Midwife'
            });
            const onSubmitReport = vi.fn();

            render(
                <HeatmapSidePanel
                    {...buildDefaultProps({
                        mapState: { clusters: [cluster], all_infants: [], dss_clusters: [], counts: {} },
                        selectedClusterId: 'cluster-1',
                        activeReport: null,
                        onSubmitReport
                    })}
                />
            );

            const submitBtn = screen.getByRole('button', { name: /Submit Deployment Report/i });
            expect(submitBtn).toBeInTheDocument();

            fireEvent.click(submitBtn);
            expect(onSubmitReport).toHaveBeenCalledTimes(1);
        });
    });
});
