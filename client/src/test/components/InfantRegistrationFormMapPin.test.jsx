import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import InfantRegistrationForm from '../../features/registration/pages/InfantRegistrationForm';

const mockGet = vi.fn();
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
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
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
  isStepValid: () => true,
  normalizeTTStatus: (value) => (String(value || '').replace(/^TT/, '') || ''),
  deriveBirthStatus: () => 'Normal',
  classifyBirthDoseStatus: () => 'Given within 24 hours',
  normalizeBirthDoseSelection: ({ status, date }) => ({
    status: ['Not Given', 'Unknown'].includes(status) ? status : (status || ''),
    date: ['Not Given', 'Unknown'].includes(status) ? '' : (date || '')
  }),
  GIVEN_WITHIN_24_HOURS: 'Given within 24 hours',
  GIVEN_MORE_THAN_24_HOURS: 'Given more than 24 hours',
  NOT_GIVEN: 'Not Given',
  UNKNOWN: 'Unknown'
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
  default: function IdentitySectionMock({ formData, handleChange, handleAddressInputChange, handleMapClick, handleDragEnd, handleSelectSuggestion }) {
    return (
      <div>
        <input aria-label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} />
        <input aria-label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} />
        <input aria-label="Date of Birth" name="dob" value={formData.dob} onChange={handleChange} />
        <input aria-label="Sex" name="sex" value={formData.sex} onChange={handleChange} />
        <input aria-label="Exact Address" name="exact_address" value={formData.exact_address} onChange={handleAddressInputChange || handleChange} />
        <input aria-label="Current Address" value={formData.current_address ?? ''} readOnly />
        <input aria-label="Latitude" value={formData.latitude ?? ''} readOnly />
        <input aria-label="Longitude" value={formData.longitude ?? ''} readOnly />
        <input aria-label="Selected Barangay" value={formData.locality ?? ''} readOnly />
        <button type="button" onClick={() => handleMapClick(14.3261, 121.0179)}>
          Pin Langgam
        </button>
        <button type="button" onClick={() => handleDragEnd(14.3262, 121.018)}>
          Drag Langgam
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
  default: ({ formData }) => (
    <div>
      <div>Review Step</div>
      <div>Review Address: {formData.exact_address}</div>
      <div>Review Coordinates: {formData.latitude}, {formData.longitude}</div>
    </div>
  )
}));

describe('InfantRegistrationForm map pin reverse geocoding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ ok: true, json: async () => [] });
    window.scrollTo = vi.fn();
  });

  test('map click sanitizes provider-inferred Block/Lot from the auto-filled address', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        display_name: 'Block 12 Lot 7, Lawaan Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna',
        lat: '14.3261',
        lon: '121.0179',
        source: 'external',
        address: {
          road: 'Lawaan Street',
          neighbourhood: 'Saint Joseph 10',
          suburb: 'Phase 3',
          barangay: 'Langgam',
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
      expect(screen.getByLabelText('Exact Address')).toHaveValue('Lawaan Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna');
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/geo/reverse?lat=14.3261&lon=121.0179&source=pin',
      expect.any(Object)
    );
    expect(screen.getByLabelText('Exact Address')).not.toHaveValue(expect.stringMatching(/\b(block|blk|lot|house|unit)\b/i));
  });

  test('marker drag sanitizes provider-inferred House/Block/Lot from the auto-filled address', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        display_name: 'House No. 44 Block 3 Lot 9, Sampaguita Alley, Saint Joseph Village, Langgam, San Pedro, Laguna',
        lat: '14.3262',
        lon: '121.018',
        source: 'external',
        address: {
          road: 'Sampaguita Alley',
          neighbourhood: 'Saint Joseph Village',
          barangay: 'Langgam',
          city: 'San Pedro',
          state: 'Laguna',
          country: 'Philippines'
        }
      })
    });

    const user = userEvent.setup();
    render(<InfantRegistrationForm userRole="BHW" />);

    await user.click(screen.getByRole('button', { name: /drag langgam/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue('14.3262');
      expect(screen.getByLabelText('Longitude')).toHaveValue('121.018');
      expect(screen.getByLabelText('Exact Address')).toHaveValue('Sampaguita Alley, Saint Joseph Village, Langgam, San Pedro, Laguna');
    });

    expect(screen.getByLabelText('Exact Address')).not.toHaveValue(expect.stringMatching(/\b(house|block|blk|lot|unit)\b/i));
  });

  test('manual user-typed Block/Lot address is preserved after map reverse geocoding', async () => {
    mockGet.mockImplementation((url) => {
      if (String(url).startsWith('/geo/reverse')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            display_name: 'Block 99 Lot 1, Lawaan Street, Langgam, San Pedro, Laguna',
            lat: '14.3261',
            lon: '121.0179',
            source: 'external',
            address: {
              road: 'Lawaan Street',
              barangay: 'Langgam',
              city: 'San Pedro',
              state: 'Laguna',
              country: 'Philippines'
            }
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const user = userEvent.setup();
    render(<InfantRegistrationForm userRole="BHW" />);

    await user.type(screen.getByLabelText('Exact Address'), 'Block 12 Lot 7, Lawaan Street, Saint Joseph 10, Phase 3');
    await user.click(screen.getByRole('button', { name: /pin langgam/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue('14.3261');
      expect(screen.getByLabelText('Longitude')).toHaveValue('121.0179');
      expect(screen.getByLabelText('Exact Address')).toHaveValue('Block 12 Lot 7, Lawaan Street, Saint Joseph 10, Phase 3');
      expect(screen.getByLabelText('Current Address')).toHaveValue('Lawaan Street, Langgam, San Pedro, Laguna');
    });
  });

  test('registration submits successfully with sanitized map label and unchanged latitude/longitude', async () => {
    mockGet.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        display_name: 'Block 12 Lot 7, Lawaan Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna',
        lat: '14.3261',
        lon: '121.0179',
        source: 'external',
        address: {
          road: 'Lawaan Street',
          neighbourhood: 'Saint Joseph 10',
          suburb: 'Phase 3',
          barangay: 'Langgam',
          city: 'San Pedro',
          state: 'Laguna',
          country: 'Philippines'
        }
      })
    });
    mockPost.mockImplementation((url) => {
      if (url === '/registrations/check-duplicates') {
        return Promise.resolve({ ok: true, json: async () => ({ duplicate_alert: null, matches: [] }) });
      }
      if (url === '/registrations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'reg-1', reference_id: 'REG-1', status: 'PENDING_VALIDATION' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const user = userEvent.setup();
    render(<InfantRegistrationForm userRole="BHW" />);

    await user.click(screen.getByRole('button', { name: /pin langgam/i }));
    await waitFor(() => expect(screen.getByLabelText('Latitude')).toHaveValue('14.3261'));

    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));

    expect(screen.getByText(/Review Address:\s*Lawaan Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna/)).toBeInTheDocument();
    expect(screen.getByText(/Review Coordinates:\s*14\.3261,\s*121\.0179/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /submit for validation/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/registrations', expect.objectContaining({
        data: expect.objectContaining({
          exact_address: 'Lawaan Street, Saint Joseph 10, Phase 3',
          current_address: 'Lawaan Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna',
          latitude: 14.3261,
          longitude: 121.0179
        })
      }));
    });
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
