import { describe, expect, test } from 'vitest';
import {
    GIVEN_MORE_THAN_24_HOURS,
    GIVEN_WITHIN_24_HOURS,
    classifyBirthDoseStatus,
    deriveBirthStatus,
    isStepValid,
    normalizeBirthDoseSelection,
    normalizeTTStatus,
    validateField
} from '../../utils/registrationValidation';

describe('registration validation rules', () => {
    test.each(['-3', '0', '1.5', 'abc'])('rejects invalid pregnancy order %s', (value) => {
        expect(validateField('pregnancy_order', value)).toBe('Must be a positive whole number');
    });

    test('accepts valid pregnancy order', () => {
        expect(validateField('pregnancy_order', '1')).toBeNull();
    });

    test('normalizes TT status values for saved drafts and returned submissions', () => {
        expect(normalizeTTStatus('TT2')).toBe('2');
        expect(normalizeTTStatus('Unknown / No History')).toBe('0');
        expect(normalizeTTStatus('')).toBe('');
    });

    test('requires TT selection and date when TT1-TT5 is selected', () => {
        expect(isStepValid(3, {
            mother_tt_status: '',
            birth_weight: '3.2',
            length_at_birth_cm: '50',
            birth_setting: 'HOME'
        }, {})).toBe(false);

        expect(isStepValid(3, {
            mother_tt_status: '2',
            last_tt_date: '',
            birth_weight: '3.2',
            length_at_birth_cm: '50',
            birth_setting: 'HOME'
        }, {})).toBe(false);

        expect(isStepValid(3, {
            mother_tt_status: '0',
            last_tt_date: '',
            birth_weight: '3.2',
            length_at_birth_cm: '50',
            birth_setting: 'HOME'
        }, {})).toBe(true);
    });

    test('ignores stale Last TT Date required error when No TT history is selected', () => {
        expect(isStepValid(3, {
            mother_tt_status: '0',
            last_tt_date: '',
            birth_weight: '3.2',
            length_at_birth_cm: '50',
            birth_setting: 'HOME'
        }, {
            last_tt_date: 'Required'
        })).toBe(true);
    });

    test('classifies at-birth doses from date and DOB', () => {
        expect(classifyBirthDoseStatus('2026-01-15', '2026-01-15')).toBe(GIVEN_WITHIN_24_HOURS);
        expect(classifyBirthDoseStatus('2026-01-16', '2026-01-15')).toBe(GIVEN_MORE_THAN_24_HOURS);
        expect(classifyBirthDoseStatus('2026-01-17', '2026-01-15')).toBe(GIVEN_MORE_THAN_24_HOURS);
    });

    test.each([
        ['BCG', 'Given more than 24 hours', '2026-07-01', GIVEN_WITHIN_24_HOURS],
        ['BCG', 'Given within 24 hours', '2026-07-02', GIVEN_MORE_THAN_24_HOURS],
        ['Hepatitis B', 'Given more than 24 hours', '2026-07-01', GIVEN_WITHIN_24_HOURS],
        ['Hepatitis B', 'Given within 24 hours', '2026-07-02', GIVEN_MORE_THAN_24_HOURS]
    ])('auto-corrects %s status %s from date %s', (_dose, selectedStatus, date, expectedStatus) => {
        expect(normalizeBirthDoseSelection({
            status: selectedStatus,
            date,
            dob: '2026-07-01'
        })).toEqual({
            status: expectedStatus,
            date
        });
    });

    test.each(['Not Given', 'Unknown'])('clears date when at-birth dose status is %s', (status) => {
        expect(normalizeBirthDoseSelection({
            status,
            date: '2026-07-01',
            dob: '2026-07-01'
        })).toEqual({
            status,
            date: ''
        });
    });

    test('rejects BCG date before DOB and future TT date', () => {
        expect(validateField('bcg_date', '2026-06-10', { dob: '2026-06-10' })).toBeNull();
        expect(validateField('hepatitis_b_date', '2026-06-10', { dob: '2026-06-10' })).toBeNull();
        expect(validateField('bcg_date', '2026-01-14', { dob: '2026-01-15' })).toBe('Must not be before date of birth');
        expect(validateField('last_tt_date', '2099-01-01', { dob: '2026-01-15' })).toBe('Future dates not allowed');
    });

    test('derives birth status from birth weight', () => {
        expect(validateField('birth_weight', '-1')).toBe('Invalid birth weight. Must be between 1.0 and 6.0 kg.');
        expect(deriveBirthStatus('2.4')).toBe('Low Birth Weight');
        expect(deriveBirthStatus('3.2')).toBe('Normal');
        expect(deriveBirthStatus('4.1')).toBe('Macrosomia');
    });
});
