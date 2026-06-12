import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InfantRegistrationForm from '../../pages/clinical/InfantRegistrationForm';

const mockNavigate = vi.fn();
const mockPost = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'bhw-1',
      role: 'BHW',
      assigned_barangay: 'Langgam'
    }
  })
}));

vi.mock('../../services/apiClient', () => ({
  default: {
    post: (...args) => mockPost(...args),
    get: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '' }),
    useParams: () => ({})
  };
});

vi.mock('../../utils/registrationValidation', () => ({
  validateField: () => '',
  isStepValid: () => true
}));

vi.mock('../../utils/formatFullName', () => ({
  formatFullNameFromObject: (value = {}) => [value.first_name, value.middle_name, value.last_name].filter(Boolean).join(' ')
}));

vi.mock('../../components/GlobalInfantSearchModal', () => ({
  default: () => null
}));

vi.mock('../../pages/clinical/registration/FormComponents', () => ({
  StepIndicator: () => <div data-testid="step-indicator">Step indicator</div>
}));

vi.mock('../../pages/clinical/registration/IdentitySection', () => ({
  default: function IdentitySectionMock({ formData, handleChange }) {
    return (
      <div>
        <input aria-label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} />
        <input aria-label="Middle Name" name="middle_name" value={formData.middle_name} onChange={handleChange} />
        <input aria-label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} />
        <input aria-label="Date of Birth" name="dob" value={formData.dob} onChange={handleChange} />
        <input aria-label="Sex" name="sex" value={formData.sex} onChange={handleChange} />
        <input aria-label="Exact Address" name="exact_address" value={formData.exact_address} onChange={handleChange} />
        <input aria-label="Landmark" name="landmark" value={formData.landmark} onChange={handleChange} />
      </div>
    );
  }
}));

vi.mock('../../pages/clinical/registration/GuardianSection', () => ({
  default: () => <div>Guardian Step</div>
}));

vi.mock('../../pages/clinical/registration/MaternalBirthSection', () => ({
  default: () => <div>Clinical Step</div>
}));

vi.mock('../../pages/clinical/registration/ImmunizationSection', () => ({
  default: () => <div>Doses Step</div>
}));

vi.mock('../../pages/clinical/registration/ReviewSection', () => ({
  default: function ReviewSectionMock({ formData, handleChange, overrideReason, setOverrideReason }) {
    return (
      <div>
        <input aria-label="Latitude" name="latitude" value={formData.latitude ?? ''} onChange={handleChange} />
        <input aria-label="Longitude" name="longitude" value={formData.longitude ?? ''} onChange={handleChange} />
        <textarea
          aria-label="Duplicate Override Reason"
          value={overrideReason}
          onChange={(event) => setOverrideReason(event.target.value)}
        />
      </div>
    );
  }
}));

describe('InfantRegistrationForm submission-time duplicate gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  const reachReviewAndSubmit = async () => {
    const user = userEvent.setup();
    render(<InfantRegistrationForm userRole="BHW" />);

    expect(screen.queryByText('Search Before Registering')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /global search/i })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('First Name'), 'Maria');
    await user.type(screen.getByLabelText('Middle Name'), 'Nicole');
    await user.type(screen.getByLabelText('Last Name'), 'Santos');
    await user.type(screen.getByLabelText('Date of Birth'), '2026-01-15');
    await user.type(screen.getByLabelText('Sex'), 'F');
    await user.type(screen.getByLabelText('Exact Address'), 'House 1 Langgam');
    await user.type(screen.getByLabelText('Landmark'), 'Blue gate');
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.type(screen.getByLabelText('Latitude'), '14.3211');
    await user.type(screen.getByLabelText('Longitude'), '121.0412');
    const submitButton = screen.getByRole('button', { name: /submit for validation/i });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    return user;
  };

  test('Scenario A: same-barangay duplicate triggers a hard block and halts registration', async () => {
    mockPost.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        duplicate_alert: {
          status: 'STRICT_DUPLICATE',
          message: 'An existing infant record already matches this identity in your barangay.'
        },
        matches: [
          {
            id: 'match-1',
            first_name: 'Maria',
            middle_name: 'Nicole',
            last_name: 'Santos',
            dob: '2026-01-15',
            barangay: 'Langgam',
            status: 'PENDING_VALIDATION'
          }
        ]
      })
    });

    await reachReviewAndSubmit();

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith('/registrations/check-duplicates', expect.any(Object));
    });

    expect(await screen.findByText('Duplicate Registration Detected')).toBeInTheDocument();
    expect(screen.getByText('Clinical review required before saving this record.')).toBeInTheDocument();
    expect(screen.getByText(/An existing infant record already matches this identity in your barangay./i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /proceed anyway/i })).not.toBeInTheDocument();
    expect(screen.getByText(/DOB:/i)).toBeInTheDocument();
    expect(screen.getByText(/Barangay: Langgam/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.type(screen.getByLabelText('Duplicate Override Reason'), 'Attempted note should not bypass same-barangay block.');
    mockPost.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        duplicate_alert: {
          status: 'STRICT_DUPLICATE',
          message: 'An existing infant record already matches this identity in your barangay.'
        },
        matches: [
          {
            id: 'match-1',
            first_name: 'Maria',
            middle_name: 'Nicole',
            last_name: 'Santos',
            dob: '2026-01-15',
            barangay: 'Langgam',
            status: 'PENDING_VALIDATION'
          }
        ]
      })
    });
    await user.click(screen.getByRole('button', { name: /submit for validation/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(2);
      expect(mockPost).not.toHaveBeenLastCalledWith('/registrations', expect.anything());
    });
    expect(await screen.findByText('Duplicate Registration Detected')).toBeInTheDocument();
  });

  test('Scenario B: other-barangay match triggers a transfer inquiry, then submits with required notes', async () => {
    mockPost.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        duplicate_alert: {
          status: 'TRANSFER_POSSIBLE',
          barangay: 'United Bayanihan',
          message: 'Potential match found in Barangay United Bayanihan. Please ask the caregiver: "Are you from another Barangay?" If yes, contact your Midwife to initiate a formal transfer.'
        },
        matches: [
          {
            id: 'match-2',
            first_name: 'Maria',
            middle_name: 'Nicole',
            last_name: 'Santos',
            dob: '2026-01-15',
            barangay: 'United Bayanihan',
            status: 'PENDING_VALIDATION'
          }
        ]
      })
    });
    mockPost.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        duplicate_alert: {
          status: 'TRANSFER_POSSIBLE',
          barangay: 'United Bayanihan',
          signature: 'TRANSFER_POSSIBLE|match-2:united bayanihan'
        },
        matches: [
          {
            id: 'match-2',
            first_name: 'Maria',
            middle_name: 'Nicole',
            last_name: 'Santos',
            dob: '2026-01-15',
            barangay: 'United Bayanihan',
            status: 'PENDING_VALIDATION'
          }
        ]
      })
    });
    mockPost.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'reg-1',
        reference_id: 'LG-2026-0001',
        status: 'PENDING_VALIDATION'
      })
    });

    const user = await reachReviewAndSubmit();

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith('/registrations/check-duplicates', expect.any(Object));
    });

    expect(await screen.findByText('Transfer Inquiry')).toBeInTheDocument();
    expect(screen.getByText('Potential cross-barangay match requires Midwife review.')).toBeInTheDocument();
    expect(screen.getByText(/Potential match found in Barangay United Bayanihan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /proceed anyway/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Barangay: United Bayanihan/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close/i }));
    await user.type(screen.getByLabelText('Duplicate Override Reason'), 'Caregiver confirmed the family moved from United Bayanihan.');
    await user.click(screen.getByRole('button', { name: /submit for validation/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(3);
      expect(mockPost).toHaveBeenLastCalledWith('/registrations', expect.objectContaining({
        data: expect.objectContaining({
          transfer_inquiry_notes: 'Caregiver confirmed the family moved from United Bayanihan.',
          override_reason: 'Caregiver confirmed the family moved from United Bayanihan.',
          duplicate_resolution: expect.objectContaining({
            disposition: 'TRANSFER_INQUIRY_SUBMITTED',
            resolved: false,
            notes: 'Caregiver confirmed the family moved from United Bayanihan.'
          }),
          registration_status: 'PENDING_VALIDATION'
        })
      }));
    });

    expect(await screen.findByText('Registration Submitted Successfully')).toBeInTheDocument();
  });
});
