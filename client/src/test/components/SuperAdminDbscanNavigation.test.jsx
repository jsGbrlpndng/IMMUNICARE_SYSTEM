import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
