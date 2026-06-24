import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InfantRegistrationForm from '../../features/registration/pages/InfantRegistrationForm';

const mockGet = vi.fn();

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
    get: (...args) => mockGet(...args),
    post: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
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

vi.mock('../../features/registry/components/GlobalInfantSearchModal', () => ({
  default: () => null
}));

vi.mock('../../features/registration/components/FormComponents', () => ({
  StepIndicator: () => <div data-testid="step-indicator">Step indicator</div>,
  InputWrapper: ({ children, label }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
  inputClasses: ''
}));

vi.mock('../../features/registration/components/IdentitySection', () => ({
  default: function IdentitySectionMock({ formData, handleChange, handleMapClick, handleSelectSuggestion }) {
    return (
      <div>
        <input aria-label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} />
        <input aria-label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} />
        <input aria-label="Date of Birth" name="dob" value={formData.dob} onChange={handleChange} />
        <input aria-label="Sex" name="sex" value={formData.sex} onChange={handleChange} />
        <input aria-label="Exact Address" name="exact_address" value={formData.exact_address} onChange={handleChange} />
        <input aria-label="Current Address" value={formData.current_address ?? ''} readOnly />
        <input aria-label="Latitude" value={formData.latitude ?? ''} readOnly />
        <input aria-label="Longitude" value={formData.longitude ?? ''} readOnly />
        <input aria-label="Selected Barangay" value={formData.locality ?? ''} readOnly />
        <button type="button" onClick={() => handleMapClick(14.3261, 121.0179)}>
          Pin Langgam
        </button>
        <button
          type="button"
          onClick={() => handleSelectSuggestion({
            display_name: '20, Aspen Street, Saint Joseph Village 10, red bubong, asdasdas, UBL, San Pedro, Laguna',
            lat: '14.3261',
            lon: '121.0179',
            source: 'local-sanitized',
            address: {
              barangay: 'UBL',
              exact_address: 'dirty exact address',
              current_address: 'dirty current address',
              landmark: 'blue na bahay'
            }
          })}
        >
          Select Dirty Search Result
        </button>
      </div>
    );
  }
}));

vi.mock('../../features/registration/components/GuardianSection', () => ({
  default: () => <div>Guardian Step</div>
}));

vi.mock('../../features/registration/components/MaternalBirthSection', () => ({
  default: () => <div>Clinical Step</div>
}));

vi.mock('../../features/registration/components/ImmunizationSection', () => ({
  default: () => <div>Doses Step</div>
}));

vi.mock('../../features/registration/components/ReviewSection', () => ({
  default: () => <div>Review Step</div>
}));

describe('InfantRegistrationForm map pin reverse geocoding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  test('map pin saves clicked coordinates and uses polygon barangay with a clean address label', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        display_name: 'Saint Joseph 10, Phase 3, cvacawf, may pulang red, UBL, San Pedro, Laguna',
        lat: '14.3261',
        lon: '121.0179',
        source: 'local-sanitized',
        address: {
          barangay: 'UBL',
          city: 'San Pedro',
          state: 'Laguna',
          country: 'Philippines'
        }
      })
    });

    const user = userEvent.setup();
    render(<InfantRegistrationForm userRole="BHW" />);

    await user.click(screen.getByRole('button', { name: /pin langgam/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue('14.3261');
      expect(screen.getByLabelText('Longitude')).toHaveValue('121.0179');
      expect(screen.getByLabelText('Selected Barangay')).toHaveValue('LANGGAM');
      expect(screen.getByLabelText('Exact Address')).toHaveValue('Selected location in LANGGAM, San Pedro, Laguna');
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/geo/reverse?lat=14.3261&lon=121.0179&source=pin',
      expect.any(Object)
    );
    expect(screen.getByLabelText('Exact Address')).not.toHaveValue(expect.stringMatching(/cvacawf|may pulang red|UBL/i));
  });

  test('search selection saves coordinates and uses polygon barangay with clean address state', async () => {
    const user = userEvent.setup();
    render(<InfantRegistrationForm userRole="BHW" />);

    await user.click(screen.getByRole('button', { name: /select dirty search result/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue('14.3261');
      expect(screen.getByLabelText('Longitude')).toHaveValue('121.0179');
      expect(screen.getByLabelText('Selected Barangay')).toHaveValue('LANGGAM');
      expect(screen.getByLabelText('Exact Address')).toHaveValue('Selected location in LANGGAM, San Pedro, Laguna');
      expect(screen.getByLabelText('Current Address')).toHaveValue('Selected location in LANGGAM, San Pedro, Laguna');
    });

    expect(screen.getByLabelText('Exact Address')).not.toHaveValue(expect.stringMatching(/red bubong|asdasdas|blue na bahay|UBL/i));
    expect(screen.getByLabelText('Current Address')).not.toHaveValue(expect.stringMatching(/red bubong|asdasdas|blue na bahay|UBL/i));
  });
});
