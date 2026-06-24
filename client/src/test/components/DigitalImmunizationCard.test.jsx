import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DigitalImmunizationCard from '../../features/caregiver/components/DigitalImmunizationCard';

const mockCardWithData = {
    infant: {
        id: 'infant-1',
        reference_id: 'REG-2026-1234',
        first_name: 'Alvin',
        last_name: 'Sarap',
        dob: '2026-01-19',
        sex: 'M',
        place_of_birth: 'San Pedro District Hospital',
        address: '58 Narra St',
        barangay: 'Langgam',
        mothers_name: 'Janice',
        fathers_name: 'Allan',
        birth_weight: 3.20,
        birth_length: 50.50,
        status: 'Active'
    },
    summary: {
        completed_count: 2,
        due_soon_count: 0,
        overdue_count: 10,
        pending_validation_count: 0
    },
    caregiver: {
        name: 'Janice Sarap',
        relationship: 'Mother',
        phone: '09123456789'
    },
    vaccine_groups: []
};

const mockCardWithoutData = {
    infant: {
        id: 'infant-1',
        reference_id: 'REG-2026-1234',
        first_name: 'Alvin',
        last_name: 'Sarap',
        dob: '2026-01-19',
        sex: 'M',
        place_of_birth: null,
        address: '58 Narra St',
        barangay: 'Langgam',
        mothers_name: 'Janice',
        fathers_name: 'Allan',
        status: 'Active'
    },
    summary: {
        completed_count: 0,
        due_soon_count: 0,
        overdue_count: 0,
        pending_validation_count: 0
    },
    vaccine_groups: []
};

describe('DigitalImmunizationCard Component Tests', () => {
    it('displays place of birth when the API provides it', () => {
        render(
            <MemoryRouter>
                <DigitalImmunizationCard card={mockCardWithData} onSignOut={() => {}} />
            </MemoryRouter>
        );

        // Expect the child's name to be rendered
        expect(screen.getByText('Alvin Sarap')).toBeInTheDocument();

        // Expect place of birth to be rendered
        expect(screen.getByText('San Pedro District Hospital')).toBeInTheDocument();
    });

    it('falls back to - when place of birth is missing', () => {
        render(
            <MemoryRouter>
                <DigitalImmunizationCard card={mockCardWithoutData} onSignOut={() => {}} />
            </MemoryRouter>
        );

        // Expect place of birth section to display '-'
        const dtElement = screen.getByText('Place of Birth');
        const ddElement = dtElement.nextElementSibling;
        expect(ddElement.textContent).toBe('-');
    });

    it('renders caregiver details when included in the API response', () => {
        render(
            <MemoryRouter>
                <DigitalImmunizationCard card={mockCardWithData} onSignOut={() => {}} />
            </MemoryRouter>
        );

        // Verify caregiver information headers and fields
        expect(screen.getByText('Caregiver / Guardian Information')).toBeInTheDocument();
        expect(screen.getByText('Janice Sarap')).toBeInTheDocument();
        expect(screen.getByText('Mother')).toBeInTheDocument();
        expect(screen.getByText('09123456789')).toBeInTheDocument();
    });

    it('does not render caregiver section when not included in the response', () => {
        render(
            <MemoryRouter>
                <DigitalImmunizationCard card={mockCardWithoutData} onSignOut={() => {}} />
            </MemoryRouter>
        );

        // Verify caregiver information is not present
        expect(screen.queryByText('Caregiver / Guardian Information')).not.toBeInTheDocument();
    });
});
