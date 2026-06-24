import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MySubmissions from '../../features/bhw/pages/MySubmissions';
import apiClient from '../../services/apiClient';

// Mock AuthContext
vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            id: 'bhw-1',
            role: 'BHW',
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

describe('MySubmissions Draft Count Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('proves the Draft filter tab displays the correct count of draft registrations', async () => {
        const mockRegistrations = [
            { id: '1', first_name: 'Baby', last_name: 'One', status: 'DRAFT', updated_at: '2026-06-22' },
            { id: '2', first_name: 'Baby', last_name: 'Two', status: 'PENDING_VALIDATION', updated_at: '2026-06-22' },
            { id: '3', first_name: 'Baby', last_name: 'Three', status: 'DRAFT', updated_at: '2026-06-22' },
            { id: '4', first_name: 'Baby', last_name: 'Four', status: 'APPROVED', updated_at: '2026-06-22' }
        ];

        apiClient.get.mockResolvedValue(buildResponse({
            registrations: mockRegistrations
        }));

        render(
            <MemoryRouter>
                <MySubmissions />
            </MemoryRouter>
        );

        // Wait for records to load
        expect(await screen.findByText('Baby One')).toBeInTheDocument();
        expect(screen.getByText('Baby Two')).toBeInTheDocument();

        // Verify all filter tabs display their respective counts
        expect(screen.getByRole('button', { name: /All \(4\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Draft \(2\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Pending \(1\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Approved \(1\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Needs Correction \(0\)/i })).toBeInTheDocument();
    });

    it('proves the status filter tabs display correct counts when there are no drafts', async () => {
        const mockRegistrations = [
            { id: '1', first_name: 'Baby', last_name: 'One', status: 'PENDING_VALIDATION', updated_at: '2026-06-22' },
            { id: '2', first_name: 'Baby', last_name: 'Two', status: 'APPROVED', updated_at: '2026-06-22' }
        ];

        apiClient.get.mockResolvedValue(buildResponse({
            registrations: mockRegistrations
        }));

        render(
            <MemoryRouter>
                <MySubmissions />
            </MemoryRouter>
        );

        // Wait for records to load
        expect(await screen.findByText('Baby One')).toBeInTheDocument();

        // Verify all filter tabs display their respective counts
        expect(screen.getByRole('button', { name: /All \(2\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Draft \(0\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Pending \(1\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Approved \(1\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Needs Correction \(0\)/i })).toBeInTheDocument();
    });
});
