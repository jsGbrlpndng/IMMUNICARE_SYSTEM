import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonthlyAccomplishmentTable from '../../components/reports/MonthlyAccomplishmentTable';

describe('MonthlyAccomplishmentTable DOH column layout', () => {
  test('renders target denominators as columns before antigen accomplishments', () => {
    render(
      <MonthlyAccomplishmentTable
        mode="master"
        title="Master Monthly Accomplishment Table"
        report={{
          period: { month: 6, year: 2026, mode: 'MONTHLY' },
          scope: { label: 'RHU 2 Aggregate' },
          rows: [{
            barangay: 'LANGGAM',
            assigned_personnel: 'Midwife Langgam',
            total_population: 32022,
            eligible_population_0_11_months: 521,
            eligible_population_0_12_months: 660,
            eligible_population_13_23_months: 120,
            actual_population: 31780,
            bcg_at_birth: 11,
            hepb_at_birth: 24,
            penta1_0_12: 12,
            penta1_13_23: 3,
            fic: 40,
            cic: 10
          }]
        }}
      />
    );

    const headerCells = screen.getAllByRole('columnheader').map((cell) => cell.textContent.trim());

    expect(headerCells.slice(0, 7)).toEqual([
      'Barangay',
      'Population / EP Targets',
      'Birth Doses',
      'PENTA 1',
      'PENTA 2',
      'PENTA 3',
      'OPV 1'
    ]);

    const populationIndex = headerCells.indexOf('Population');
    expect(populationIndex).toBeGreaterThan(headerCells.indexOf('Barangay'));
    expect(headerCells.slice(populationIndex, populationIndex + 5)).toEqual([
      'Population',
      'EP 0-11 months',
      'EP 0-12 months',
      'EP 13-23 months',
      'Actual Population'
    ]);
    expect(headerCells.indexOf('BCG @ Birth')).toBe(populationIndex + 5);

    expect(screen.queryByText('Target Row')).not.toBeInTheDocument();
    expect(screen.queryByText('Coverage (%)')).not.toBeInTheDocument();
    expect(screen.queryByText('Assigned Midwife/Nurse')).not.toBeInTheDocument();

    expect(screen.getByText('LANGGAM')).toBeInTheDocument();
    expect(screen.getByText('32,022')).toBeInTheDocument();
    expect(screen.getByText('521')).toBeInTheDocument();
    expect(screen.getByText('660')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('31,780')).toBeInTheDocument();
  });
});
