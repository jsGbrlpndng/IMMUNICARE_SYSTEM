import React from 'react';
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonitoringCharts, { normalizeRows } from '../../components/reports/MonitoringCharts';

describe('MonitoringCharts', () => {
  test('derives cumulative target rows from configured target multiplied by month index', () => {
    const rows = normalizeRows([
      {
        report_month: 1,
        month_label: 'JAN',
        penta_target_config: 55,
        mcv_target_config: 60,
        utilization_target_config: 60,
        penta1_cumulative: 5,
        penta3_cumulative: 3,
        mcv1_cumulative: 4,
        mcv2_cumulative: 2,
        dropout_rate: 24.32,
        mcv_dropout_rate: 30,
        utilization_cumulative_dropout_rate: 24.32
      },
      {
        report_month: 2,
        month_label: 'FEB',
        penta_target_config: 55,
        mcv_target_config: 60,
        utilization_target_config: 60,
        penta1_cumulative: 9,
        penta3_cumulative: 6,
        mcv1_cumulative: 8,
        mcv2_cumulative: 5,
        dropout_rate: 24.98,
        mcv_dropout_rate: 29,
        utilization_cumulative_dropout_rate: 24.98
      }
    ]);

    expect(rows[0]).toMatchObject({
      month: 'JAN',
      cumulativeTargetPopulation: 55,
      pentaCummulativeTargetPopulation: 55,
      mcvCummulativeTargetPopulation: 60,
      utilizationCummulativeTargetPopulation: 60,
      penta1Cummulative: 5,
      penta3Cummulative: 3,
      mcv1Cummulative: 4,
      mcv2Cummulative: 2,
      utilizationPenta1Cummulative: 5,
      utilizationMcv2Cummulative: 2,
      pentaDropoutRate: 24.32,
      mcvDropoutRate: 30,
      utilizationDropoutRate: 24.32
    });
    expect(rows[1].cumulativeTargetPopulation).toBe(110);
    expect(rows[1].mcvCummulativeTargetPopulation).toBe(120);
    expect(rows[1].utilizationCummulativeTargetPopulation).toBe(120);
    expect(rows[1].penta3Cummulative).toBe(6);
    expect(rows[1].mcv2Cummulative).toBe(5);
  });

  test('renders configured cumulative target labels and utilization graph without NaN', () => {
    const { container } = render(
      <MonitoringCharts
        report={{
          target_status: { has_required_targets: true },
          rows: [
            {
              report_month: 1,
              month_label: 'JAN',
              penta_target_config: '55',
              mcv_target_config: '60',
              utilization_target_config: '60',
              penta1_cumulative: '5',
              penta3_cumulative: '3',
              mcv1_cumulative: '4',
              mcv2_cumulative: 'bad-value',
              penta1_count: '5',
              penta3_count: '3',
              mcv1_count: null,
              mcv2_count: undefined,
              dropout_rate: '24.32',
              mcv_dropout_rate: '',
              utilization_cumulative_dropout_count: '125',
              utilization_cumulative_dropout_rate: '24.32'
            }
          ]
        }}
      />
    );

    expect(screen.getAllByText('CUMMULATIVE TARGET POPULATION').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PENTA 3 COMMULATIVE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MCV2 COMMULATIVE').length).toBeGreaterThan(0);
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getAllByText('60').length).toBeGreaterThan(0);
    expect(screen.getByText('Utilization Monitoring')).toBeInTheDocument();
    expect(container.textContent).not.toContain('NaN');
  });
});
