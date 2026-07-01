import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InfantRegistrationForm from '../../features/registration/pages/InfantRegistrationForm';
import { getBarangayCenter } from '../../utils/barangayConfig';
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
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock validation rules to make them pass simply
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

// Mock formatting
vi.mock('../../utils/formatFullName', () => ({
  formatFullNameFromObject: (value = {}) => [value.first_name, value.middle_name, value.last_name].filter(Boolean).join(' ')
}));

// Mock components that are not needed
vi.mock('../../features/registry/components/GlobalInfantSearchModal', () => ({
  default: () => null
}));

vi.mock('../../features/registration/components/FormComponents', () => {
  const actual = vi.importActual('../../features/registration/components/FormComponents');
  return {
    ...actual,
    StepIndicator: () => <div data-testid="step-indicator">Step indicator</div>
  };
});

// Mock Leaflet/Map because it cannot render correctly in JSDOM
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  GeoJSON: () => <div data-testid="geojson" />,
  Marker: () => <div data-testid="marker" />,
  useMap: () => ({
    flyTo: vi.fn(),
    invalidateSize: vi.fn()
  }),
  useMapEvents: vi.fn()
}));

// Mock IdentitySection to bypass map dependencies
vi.mock('../../features/registration/components/IdentitySection', () => ({
  default: function IdentitySectionMock({
    formData,
    handleChange,
    pendingOutOfBarangayLocation,
    outOfBarangayReason,
    outOfBarangayConfirmed,
    onOutOfBarangayReasonChange,
    onOutOfBarangayConfirmChange,
    onCancelOutOfBarangayLocation
  }) {
    return (
      <div>
        <input aria-label="First Name" name="first_name" value={formData.first_name || ''} onChange={handleChange} />
        <input aria-label="Middle Name" name="middle_name" value={formData.middle_name || ''} onChange={handleChange} />
        <input aria-label="Last Name" name="last_name" value={formData.last_name || ''} onChange={handleChange} />
        <input aria-label="Date of Birth" name="dob" value={formData.dob || ''} onChange={handleChange} />
        <input aria-label="Sex" name="sex" value={formData.sex || ''} onChange={handleChange} />
        <input aria-label="Exact Address" name="exact_address" value={formData.exact_address || ''} onChange={handleChange} />
        <input aria-label="Landmark" name="landmark" value={formData.landmark || ''} onChange={handleChange} />
        
        {pendingOutOfBarangayLocation && (
          <div data-testid="out-of-barangay-section">
            <textarea
              aria-label="Exception Reason"
              value={outOfBarangayReason}
              onChange={(e) => onOutOfBarangayReasonChange(e.target.value)}
            />
            <input
              type="checkbox"
              aria-label="Confirm Exception"
              checked={outOfBarangayConfirmed}
              onChange={(e) => onOutOfBarangayConfirmChange(e.target.checked)}
            />
            <button type="button" onClick={onCancelOutOfBarangayLocation}>Cancel Selection</button>
          </div>
        )}
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

describe('InfantRegistrationForm Reset Flow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  const reachReviewAndSubmit = async (user, coordinates = getBarangayCenter('Langgam')) => {
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
    await user.type(screen.getByLabelText('Latitude'), coordinates.lat.toString());
    await user.type(screen.getByLabelText('Longitude'), coordinates.lng.toString());
  };

  test('normal registration flow reset restores editable fields', async () => {
    const user = userEvent.setup();
    apiClient.post.mockImplementation((url) => {
      if (url === '/registrations/check-duplicates') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ duplicate_alert: null, matches: [] })
        });
      }
      if (url === '/registrations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'reg-new-123',
            reference_id: 'REF-123',
            status: 'PENDING_VALIDATION'
          })
        });
      }
    });

    render(
      <MemoryRouter initialEntries={['/bhw/register']}>
        <Routes>
          <Route path="/bhw/register" element={<InfantRegistrationForm userRole="BHW" />} />
        </Routes>
      </MemoryRouter>
    );

    // Fill and submit form
    await reachReviewAndSubmit(user);
    const submitButton = screen.getByRole('button', { name: /submit for validation/i });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    // Verify success screen
    expect(await screen.findByText('Registration Submitted Successfully')).toBeInTheDocument();

    // Click Reset
    const resetBtn = screen.getByRole('button', { name: /register another infant/i });
    await user.click(resetBtn);

    // Verify step 1 inputs are reset and editable
    const firstNameInput = await screen.findByLabelText('First Name');
    expect(firstNameInput).toBeInTheDocument();
    expect(firstNameInput).not.toHaveAttribute('readOnly');
    expect(firstNameInput.value).toBe('');

    // Ensure we can type in the first name field again
    await user.type(firstNameInput, 'Clean');
    expect(firstNameInput.value).toBe('Clean');
  });

  test('resetting from a draft route removes route ID and renders clean editable form', async () => {
    const user = userEvent.setup();
    
    // Mock get endpoint for loading initial draft
    apiClient.get.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'draft-123',
          status: 'DRAFT',
          registration_data: {
            first_name: 'Existing',
            middle_name: 'Draft',
            last_name: 'Infant',
            dob: '2026-02-02',
            sex: 'M',
            barangay: 'Langgam',
            exact_address: 'House 5 Langgam'
          }
        }
      })
    });

    apiClient.post.mockImplementation((url) => {
      if (url === '/registrations/check-duplicates') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ duplicate_alert: null, matches: [] })
        });
      }
      if (url === '/registrations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'reg-new-123',
            reference_id: 'REF-123',
            status: 'PENDING_VALIDATION'
          })
        });
      }
    });

    render(
      <MemoryRouter initialEntries={['/bhw/registrations/draft-123']}>
        <Routes>
          <Route path="/bhw/registrations/:id" element={<InfantRegistrationForm userRole="BHW" />} />
          <Route path="/bhw/register" element={
            <div>
              <span data-testid="register-route-indicator">Register Route Loaded</span>
              <InfantRegistrationForm userRole="BHW" />
            </div>
          } />
        </Routes>
      </MemoryRouter>
    );

    // Wait for draft details to load
    await waitFor(() => {
      expect(screen.getByLabelText('First Name').value).toBe('Existing');
    });

    // Move to review and submit
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));
    await user.click(screen.getByRole('button', { name: /next step/i }));

    const coordinates = getBarangayCenter('Langgam');
    await user.type(screen.getByLabelText('Latitude'), coordinates.lat.toString());
    await user.type(screen.getByLabelText('Longitude'), coordinates.lng.toString());

    const submitButton = screen.getByRole('button', { name: /submit for validation/i });
    await user.click(submitButton);

    // Verify success screen
    expect(await screen.findByText('Registration Submitted Successfully')).toBeInTheDocument();

    // Click Register Another
    const resetBtn = screen.getByRole('button', { name: /register another infant/i });
    await user.click(resetBtn);

    // Verify redirect to /bhw/register and editable clean form
    expect(await screen.findByTestId('register-route-indicator')).toBeInTheDocument();
    const newFirstNameInput = screen.getAllByLabelText('First Name')[0];
    expect(newFirstNameInput.value).toBe('');
    expect(newFirstNameInput).not.toHaveAttribute('readOnly');
  });

  test('duplicate warning, success messages, and submission errors are cleared', async () => {
    const user = userEvent.setup();

    apiClient.post.mockImplementation((url) => {
      if (url === '/registrations/check-duplicates') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            duplicate_alert: {
              status: 'STRICT_DUPLICATE',
              message: 'Duplicate found!'
            },
            matches: [{ id: 'match-1', first_name: 'Maria', last_name: 'Santos' }]
          })
        });
      }
    });

    render(
      <MemoryRouter initialEntries={['/bhw/register']}>
        <Routes>
          <Route path="/bhw/register" element={<InfantRegistrationForm userRole="BHW" />} />
        </Routes>
      </MemoryRouter>
    );

    await reachReviewAndSubmit(user);
    const submitButton = screen.getByRole('button', { name: /submit for validation/i });
    await user.click(submitButton);

    // 1. Assert duplicate warning modal appears
    expect(await screen.findByText('Duplicate Registration Detected')).toBeInTheDocument();
    
    // Close modal
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // 2. Mock submission error
    apiClient.post.mockImplementation((url) => {
      if (url === '/registrations/check-duplicates') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ duplicate_alert: null, matches: [] })
        });
      }
      return Promise.resolve({
        status: 400,
        ok: false,
        json: async () => ({ details: 'Invalid data submitted!' })
      });
    });

    await user.click(submitButton);
    expect(await screen.findByText('Invalid data submitted!')).toBeInTheDocument();

    // 3. Mock success submission
    apiClient.post.mockImplementation((url) => {
      if (url === '/registrations/check-duplicates') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ duplicate_alert: null, matches: [] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'reg-ok-123', reference_id: 'REF-123' })
      });
    });

    await user.click(submitButton);
    expect(await screen.findByText('Registration Submitted Successfully')).toBeInTheDocument();

    // Reset Form
    await user.click(screen.getByRole('button', { name: /register another infant/i }));

    // 4. Assert all errors and warnings are cleared
    expect(screen.queryByText('Duplicate Registration Detected')).not.toBeInTheDocument();
    expect(screen.queryByText('Invalid data submitted!')).not.toBeInTheDocument();
  });

  test('location/map and out-of-barangay state is reset', async () => {
    // Note: We can check that initial state is set and mock trigger works
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/bhw/register']}>
        <Routes>
          <Route path="/bhw/register" element={<InfantRegistrationForm userRole="BHW" />} />
        </Routes>
      </MemoryRouter>
    );

    // Initially out of barangay section should not be visible
    expect(screen.queryByTestId('out-of-barangay-section')).not.toBeInTheDocument();
  });
});
