import { describe, expect, test } from 'vitest';
import { formatAuditTarget } from '../../utils/auditFormatter';

describe('auditFormatter transfer labels', () => {
    test('renders transfer merge metadata as a From -> To label', () => {
        const label = formatAuditTarget({
            action: 'TRANSFER_MERGE',
            metadata: {
                from_barangay: 'United Bayanihan',
                to_barangay: 'Langgam'
            },
            target_entity: 'infant_registrations',
            target_record_id: 'reg-1',
            target_name: 'Maria Nicole Santos'
        });

        expect(label).toBe('Transfer: United Bayanihan -> Langgam');
    });
});
