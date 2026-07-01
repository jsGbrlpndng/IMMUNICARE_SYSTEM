import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'SADMIN-001',
            role: 'Super Admin',
            full_name: 'Head Nurse'
        },
        logout: vi.fn(),
        auditLogout: vi.fn()
    })
}));

vi.mock('../../contexts/BarangayFilterContext', () => ({
    useBarangayFilter: () => ({
        selectedBarangay: 'all',
        setSelectedBarangay: vi.fn()
    })
}));

vi.mock('../../components/feedback/NotificationBell', () => ({
    default: () => <div data-testid="notification-bell" />
}));

describe('SuperAdminLayout DBSCAN navigation', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('shows the DBSCAN Evaluation menu item under Super Admin geospatial navigation', () => {
        render(
            <MemoryRouter initialEntries={['/superadmin/geospatial/evaluation']}>
                <SuperAdminLayout>
                    <div>Evaluation Page</div>
                </SuperAdminLayout>
            </MemoryRouter>
        );

        const link = screen.getByRole('link', { name: /DBSCAN Evaluation/i });
        expect(link).toHaveAttribute('href', '/superadmin/geospatial/evaluation');
        expect(screen.getByText(/Super Admin Portal/i)).toBeInTheDocument();
        expect(screen.getAllByText(/DBSCAN Evaluation/i).length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('Evaluation Page')).toBeInTheDocument();
    });

    it('shows the Global Filter only on the Super Admin dashboard', () => {
        render(
            <MemoryRouter initialEntries={['/superadmin/dashboard']}>
                <SuperAdminLayout>
                    <div>Dashboard Page</div>
                </SuperAdminLayout>
            </MemoryRouter>
        );

        expect(screen.getByText('Global Filter')).toBeInTheDocument();

        const hiddenRoutes = [
            '/superadmin/geospatial',
            '/superadmin/geospatial/evaluation',
            '/superadmin/users',
            '/superadmin/targets',
            '/superadmin/reports',
            '/superadmin/audit',
            '/superadmin/account-settings'
        ];

        hiddenRoutes.forEach((route) => {
            cleanup();
            render(
                <MemoryRouter initialEntries={[route]}>
                    <SuperAdminLayout>
                        <div>Other Page</div>
                    </SuperAdminLayout>
                </MemoryRouter>
            );

            expect(screen.queryByText('Global Filter')).not.toBeInTheDocument();
        });
    });
});
